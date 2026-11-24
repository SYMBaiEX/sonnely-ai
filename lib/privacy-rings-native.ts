import {
  AccountRole,
  address,
  createSolanaRpc,
  decompileTransactionMessage,
  getAddressEncoder,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getPublicKeyFromAddress,
  getTransactionDecoder,
  isSignerRole,
  signature,
  verifySignature,
  type Address,
  type Instruction,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { z } from "zod";
import { mainnetMint, verifyCluster } from "./payments";
import { SonnelyError } from "./sonnely-error";

type NativeReceiptRequest = {
  rpc: string;
  signature: string;
  sender: string;
  treasury: string;
  amount: number;
  createdAt: number;
  expiresAt: number;
  treasuryViewingKey?: string;
};

type NativeReceiptEvidence = { signature: string; slot: string; blockTime: number };
export type NativePrivacyRingsReceipt = NativeReceiptEvidence &
  (
    | { status: "verified" }
    | { status: "treasury-review"; reviewReason: "details-encrypted" | "asset-mismatch" | "amount-mismatch" }
  );

const rpcTimeout = 10_000;
const addressBytes = getAddressEncoder();
const rpcAccount = z.object({
  owner: z.string(),
  lamports: z.bigint().nonnegative(),
  executable: z.literal(false),
  data: z.tuple([z.base64(), z.literal("base64")]),
});

function receiptMismatch(
  message = "This transaction is not a matching private transfer to the Sonnely treasury.",
) {
  return new SonnelyError(message, 409);
}

// SDK 0.9 encodes Transact but provides no decoder for its signed instruction data.
// Read the plain default-pool signer shape, without public settlement or other circuit modes.
async function readNativeTransfer(
  ix: Instruction,
  expected: { sender: Address; payer: Address; treasury: Address; tree: Address; tag: number },
  deriveNullifier: (tree: Address, hash: Uint8Array) => Promise<Address>,
) {
  const accounts = ix.accounts ?? [];
  const prefix = [expected.payer, expected.tree, ix.programAddress, SYSTEM_PROGRAM_ADDRESS, expected.tree];
  if (!prefix.every((key, index) => accounts[index]?.address === key)) throw receiptMismatch();

  const data = Buffer.from(ix.data ?? []);
  let offset = 0;
  const take = (size: number) => {
    if (offset + size > data.length) throw receiptMismatch();
    const start = offset;
    offset += size;
    return data.subarray(start, offset);
  };
  const readByte = () => take(1)[0];
  if (readByte() !== expected.tag) throw receiptMismatch();
  take(8); // Protocol expiry.
  const transactionViewingPublicKey = take(33);
  const salt = take(16);
  const publicTransfers = readByte();
  const hasDataHash = readByte();
  const hasRingDataHash = readByte();
  if (publicTransfers || hasDataHash || hasRingDataHash) throw receiptMismatch();

  const treasuryTag = Buffer.from(addressBytes.encode(expected.treasury));
  const outputs = readByte();
  const treasurySlots: { commitment: Buffer; payload: Buffer; position: number }[] = [];
  for (let position = 0; position < outputs; position++) {
    const commitment = take(32);
    const tagKind = readByte();
    const tagAccount = tagKind === 1 ? accounts[readByte()] : undefined;
    const tag = tagKind === 0 ? take(32) : tagAccount && Buffer.from(addressBytes.encode(tagAccount.address));
    const hasPayload = readByte();
    if (!tag || hasPayload > 1) throw receiptMismatch();
    if (hasPayload) {
      const length = take(2).readUInt16LE();
      const payload = take(length);
      if (tag.equals(treasuryTag)) treasurySlots.push({ commitment, payload, position });
    }
  }
  if (treasurySlots.length === 0 || readByte() !== 0) throw receiptMismatch(); // No private messages.
  take(32); // Private transaction hash.
  if (take(2).readUInt16LE() !== 0) throw receiptMismatch(); // Confidential signer circuit.
  const circuitInputs = readByte();
  const circuitOutputs = readByte();
  readByte(); // Public-asset slots in the circuit, zero-valued for a private transfer.
  if (!circuitInputs || outputs > circuitOutputs) throw receiptMismatch();
  take(192); // Groth16 proof verified onchain by the pool.
  const inputs = readByte();
  if (!inputs || inputs > circuitInputs) throw receiptMismatch();
  const nullifiers: Buffer[] = [];
  for (let index = 0; index < inputs; index++) {
    nullifiers.push(take(32));
    if (readByte() !== 0) throw receiptMismatch(); // Input tree index.
  }
  if (readByte() !== 1) throw receiptMismatch();
  take(4); // One input-tree context.

  const owner = accounts[prefix.length + inputs];
  if (
    offset !== data.length ||
    accounts.length !== prefix.length + inputs + 1 ||
    owner?.address !== expected.sender ||
    !isSignerRole(owner.role)
  )
    throw receiptMismatch();
  const nullifierAccounts = await Promise.all(nullifiers.map((hash) => deriveNullifier(expected.tree, hash)));
  if (
    !nullifierAccounts.every((key, index) => {
      const meta = accounts[prefix.length + index];
      return meta?.address === key && meta.role === AccountRole.WRITABLE;
    })
  )
    throw receiptMismatch();
  return { transactionViewingPublicKey, salt, treasurySlots };
}

type NativeRpc = ReturnType<typeof createSolanaRpc>;

async function finalizedAccount(rpc: NativeRpc, key: Address, slot: bigint) {
  const { value } = await rpc
    .getAccountInfo(key, {
      commitment: "finalized",
      encoding: "base64",
      minContextSlot: slot,
    })
    .send({ abortSignal: AbortSignal.timeout(rpcTimeout) });
  if (!value) return undefined;
  const record = rpcAccount.parse(value);
  return {
    owner: address(record.owner),
    lamports: record.lamports,
    data: Buffer.from(record.data[0], "base64"),
  };
}

export async function verifyPrivacyRingsNativeReceipt(
  input: NativeReceiptRequest,
): Promise<NativePrivacyRingsReceipt> {
  const sender = address(input.sender);
  const treasury = address(input.treasury);
  const claimedSignature = signature(input.signature);
  if (
    sender === treasury ||
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0 ||
    !Number.isSafeInteger(input.createdAt) ||
    input.createdAt <= 0 ||
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt <= input.createdAt
  )
    throw receiptMismatch();

  await verifyCluster(input.rpc, "mainnet");
  const rpc = createSolanaRpc(input.rpc);
  let finalized;
  try {
    finalized = await rpc
      .getTransaction(claimedSignature, {
        commitment: "finalized",
        encoding: "base64",
        maxSupportedTransactionVersion: 1,
      })
      .send({ abortSignal: AbortSignal.timeout(rpcTimeout) });
  } catch {
    throw new SonnelyError("Solana RPC could not read the confidential payment.", 503);
  }
  if (!finalized) throw receiptMismatch("The transfer is awaiting Solana finality.");
  if (
    finalized.version !== 1 ||
    finalized.meta?.err !== null ||
    finalized.transaction[1] !== "base64" ||
    typeof finalized.slot !== "bigint" ||
    typeof finalized.blockTime !== "bigint" ||
    finalized.blockTime < BigInt(Math.ceil(input.createdAt / 1000)) ||
    finalized.blockTime >= BigInt(Math.ceil(input.expiresAt / 1000))
  )
    throw receiptMismatch("Use a successful, finalized private transfer made during this checkout.");

  const [
    {
      DEFAULT_TREE_ID,
      SHIELDED_POOL_PROGRAM_ID,
      InstructionTag,
      decodeSplAssetRegistry,
      TRANSACTION_SIZE_LIMIT,
    },
    { getNullifierPdaAddress, getSplAssetRegistryAddress, getTreeAddress },
    { fetchUserRecord },
    { decodeConfidential, decodeOutputData, EncryptedScheme, Utxo, initializePoseidon },
    { bytes16, bytes32, bytes33, ShieldedPublicKey, ViewingKey, X25519PublicKey },
  ] = await Promise.all([
    import("@heliuslabs/spr/interface"),
    import("@heliuslabs/spr/addresses"),
    import("@heliuslabs/spr/wallet"),
    import("@heliuslabs/spr/transaction"),
    import("@heliuslabs/spr/keypair"),
  ]);
  const slot = finalized.slot;
  let transfer;
  try {
    const bytes = Buffer.from(finalized.transaction[0], "base64");
    if (bytes.length > TRANSACTION_SIZE_LIMIT) throw receiptMismatch();
    const wire = getTransactionDecoder().decode(bytes);
    if (getBase64EncodedWireTransaction(wire) !== finalized.transaction[0]) throw receiptMismatch();
    const compiled = getCompiledTransactionMessageDecoder().decode(wire.messageBytes);
    if (compiled.version !== 1) throw receiptMismatch();
    const payer = compiled.staticAccounts[0];
    const senderProof = wire.signatures[sender];
    const payerProof = wire.signatures[payer];
    if (
      !payerProof ||
      getBase58Decoder().decode(payerProof) !== claimedSignature ||
      !senderProof ||
      !(await verifySignature(await getPublicKeyFromAddress(sender), senderProof, wire.messageBytes))
    )
      throw receiptMismatch();
    const { instructions } = decompileTransactionMessage(compiled);
    const poolInstructions = instructions.filter(
      ({ programAddress }) => programAddress === SHIELDED_POOL_PROGRAM_ID,
    );
    if (poolInstructions.length !== 1) throw receiptMismatch();
    transfer = await readNativeTransfer(
      poolInstructions[0],
      {
        sender,
        payer,
        treasury,
        tree: await getTreeAddress(DEFAULT_TREE_ID),
        tag: InstructionTag.transact,
      },
      getNullifierPdaAddress,
    );
  } catch {
    throw receiptMismatch();
  }

  let treasuryRecord;
  try {
    treasuryRecord = await fetchUserRecord({
      rpc: { getAccount: (key) => finalizedAccount(rpc, key, slot) },
      owner: treasury,
    });
    if (!treasuryRecord) throw new Error();
  } catch {
    throw new SonnelyError("The finalized treasury Privacy Rings record could not be verified.", 503);
  }

  const matchingSlots = transfer.treasurySlots.flatMap(({ commitment, payload, position }) => {
    try {
      const frame = decodeOutputData(payload);
      return frame.encoding === "encrypted" &&
        frame.scheme === EncryptedScheme.confidential &&
        frame.body.length > 33 &&
        Buffer.from(frame.body.subarray(0, 33)).equals(treasuryRecord.viewingPublicKey)
        ? [{ commitment, ciphertext: frame.body.subarray(33), position }]
        : [];
    } catch {
      // Dummy outputs may use the treasury's public tag with random data.
      return [];
    }
  });
  if (matchingSlots.length !== 1) throw receiptMismatch();
  const evidence = {
    signature: claimedSignature,
    slot: slot.toString(),
    blockTime: Number(finalized.blockTime),
  };
  if (!input.treasuryViewingKey)
    return { ...evidence, status: "treasury-review", reviewReason: "details-encrypted" };

  const mint = address(mainnetMint);
  let asset;
  try {
    const account = await finalizedAccount(rpc, await getSplAssetRegistryAddress(mint), slot);
    if (account?.owner !== SHIELDED_POOL_PROGRAM_ID) throw new Error();
    asset = decodeSplAssetRegistry(account.data);
    if (asset.mint !== mint || asset.assetId !== 3n) throw new Error();
    await initializePoseidon();
  } catch {
    throw new SonnelyError("The mainnet USDC Privacy Rings registry could not be verified.", 503);
  }

  const secret = Buffer.from(input.treasuryViewingKey, "base64");
  let viewingBytes: ReturnType<typeof bytes32> | undefined;
  let viewingKey: ReturnType<typeof ViewingKey.fromBytes> | undefined;
  let plaintext: Uint8Array | undefined;
  let blinding: ReturnType<typeof decodeConfidential>["blinding"] | undefined;
  let received: InstanceType<typeof Utxo> | undefined;
  try {
    if (secret.length !== 32 || secret.toString("base64") !== input.treasuryViewingKey)
      throw new SonnelyError("The treasury viewing key is misconfigured.", 503);
    viewingBytes = bytes32(secret);
    viewingKey = ViewingKey.fromBytes(viewingBytes);
    if (!Buffer.from(viewingKey.publicKey().toBytes()).equals(treasuryRecord.viewingPublicKey))
      throw new SonnelyError("The treasury viewing key does not match its finalized registry.", 503);

    const recipientOutput = matchingSlots[0];
    try {
      plaintext = viewingKey.decryptUtxo(
        recipientOutput.ciphertext,
        X25519PublicKey.fromBytes(bytes33(transfer.transactionViewingPublicKey)),
        bytes16(transfer.salt),
        recipientOutput.position,
      );
      const decoded = decodeConfidential(plaintext);
      blinding = decoded.blinding;
      if (decoded.ringProgramId !== undefined || !decoded.data.isEmpty()) throw receiptMismatch();
      if (decoded.assetId !== asset.assetId)
        return { ...evidence, status: "treasury-review", reviewReason: "asset-mismatch" };
      received = new Utxo({
        asset: mint,
        amount: decoded.amount,
        blinding,
        owner: ShieldedPublicKey.fromEd25519(bytes32(Uint8Array.from(addressBytes.encode(treasury)))),
      });
      if (
        !Buffer.from(received.hash(treasuryRecord.nullifierPublicKey, DEFAULT_TREE_ID)).equals(
          recipientOutput.commitment,
        )
      )
        throw receiptMismatch("The decrypted transfer could not be matched to an on-chain treasury output.");
      if (decoded.amount !== BigInt(input.amount))
        return { ...evidence, status: "treasury-review", reviewReason: "amount-mismatch" };
      return { ...evidence, status: "verified" };
    } catch (error) {
      if (error instanceof SonnelyError) throw error;
      throw receiptMismatch("The treasury could not open a valid confidential output for this transfer.");
    }
  } finally {
    received?.blinding.fill(0);
    blinding?.fill(0);
    plaintext?.fill(0);
    viewingKey?.destroy();
    viewingBytes?.fill(0);
    secret.fill(0);
  }
}
