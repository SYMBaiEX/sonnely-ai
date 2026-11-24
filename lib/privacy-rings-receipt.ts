import { createHash } from "node:crypto";
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
  isAddress,
  signature,
  verifySignature,
  type Address,
  type Instruction,
  type TransactionMessageBytesBase64,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { z } from "zod";
import { mainnetMint, verifyCluster } from "./payments";
import { SonnelyError } from "./sonnely-error";

export const PRIVACY_RINGS_PILOT_AMOUNT = 10_000;
export const PRIVACY_RINGS_PILOT_MAX_LAMPORTS = 20_000;
const usdcAssetId = 3n;
const defaultTreeId = 0;
const maxDebit = BigInt(PRIVACY_RINGS_PILOT_MAX_LAMPORTS);
const rpcTimeout = 10_000;
const memoProgram = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const addressBytes = getAddressEncoder();
const wireFormat = z.base64().min(1).max(5464);
const viewingKeyFormat = z.base64().length(44);
const rpcAccount = z.object({
  data: z.tuple([z.base64(), z.literal("base64")]),
  owner: z.string().refine(isAddress),
  executable: z.literal(false),
  lamports: z.bigint().nonnegative(),
});

type PilotIdentity = { sender: string; reference: string };
type PilotOrder = PilotIdentity & { rpc: string; treasury: string };
type PilotDraftInput = PilotOrder & { transaction: string; transactionViewingKey: string };
type SignedPilotInput = PilotIdentity & { transaction: string; messageHash: string };
type PilotReceiptInput = PilotOrder & { signature: string; messageHash: string; createdAt: number };

export function privacyRingsPilotMemo(reference: string) {
  return "sonnely:privacy:pilot:v1:" + reference;
}

function receiptMismatch(message = "This transaction does not match the confidential USDC pilot order.") {
  return new SonnelyError(message, 409);
}

async function readPilotWire(input: PilotIdentity & { transaction: string }) {
  const { SHIELDED_POOL_PROGRAM_ID } = await import("@heliuslabs/spr/interface");
  try {
    const sender = address(input.sender);
    if (!isAddress(input.reference)) throw receiptMismatch();
    const bytes = Buffer.from(wireFormat.parse(input.transaction), "base64");
    if (bytes.length > 4096) throw receiptMismatch();
    const wire = getTransactionDecoder().decode(bytes);
    if (getBase64EncodedWireTransaction(wire) !== input.transaction) throw receiptMismatch();
    const compiled = getCompiledTransactionMessageDecoder().decode(wire.messageBytes);
    if (
      compiled.version !== 1 ||
      compiled.header.numSignerAccounts !== 1 ||
      compiled.staticAccounts[0] !== sender ||
      Object.keys(wire.signatures).length !== 1 ||
      !Object.hasOwn(wire.signatures, sender)
    )
      throw receiptMismatch();
    const message = decompileTransactionMessage(compiled);
    const pool = message.instructions.find(
      ({ programAddress }) => programAddress === SHIELDED_POOL_PROGRAM_ID,
    );
    const memo = message.instructions.find(({ programAddress }) => programAddress === memoProgram);
    const memoAccounts = memo?.accounts ?? [];
    if (
      message.instructions.length !== 2 ||
      !pool?.data ||
      !memo?.data ||
      (memoAccounts.length !== 0 &&
        (memoAccounts.length !== 1 ||
          memoAccounts[0].address !== sender ||
          memoAccounts[0].role !== AccountRole.WRITABLE_SIGNER)) ||
      !Buffer.from(memo.data).equals(Buffer.from(privacyRingsPilotMemo(input.reference), "utf8"))
    )
      throw receiptMismatch();
    return {
      wire,
      sender,
      pool,
      blockhash: compiled.lifetimeToken,
      messageHash: createHash("sha256").update(Buffer.from(wire.messageBytes)).digest("hex"),
    };
  } catch (error) {
    if (error instanceof SonnelyError) throw error;
    throw receiptMismatch();
  }
}

// Decode the pinned SDK's Transact instruction. Refuse settlement, custom-ring
// outputs, metadata, cached circuits, and any extra program in the outer message.
async function readPoolTransfer(
  instruction: Instruction,
  expected: { sender: Address; treasury: Address; tree: Address; transactTag: number },
  nullifierAddress: (tree: Address, hash: Uint8Array) => Promise<Address>,
) {
  const accounts = instruction.accounts ?? [];
  const prefix = [
    expected.sender,
    expected.tree,
    instruction.programAddress,
    SYSTEM_PROGRAM_ADDRESS,
    expected.tree,
  ];
  if (!prefix.every((item, index) => accounts[index]?.address === item)) throw receiptMismatch();
  const data = Buffer.from(instruction.data ?? []);
  let offset = 0;
  const take = (size: number) => {
    const end = offset + size;
    if (end > data.length) throw receiptMismatch();
    const bytes = data.subarray(offset, end);
    offset = end;
    return bytes;
  };
  const byte = () => take(1)[0];
  if (byte() !== expected.transactTag) throw receiptMismatch();
  take(8); // Protocol expiry.
  const txViewingPublicKey = take(33);
  const salt = take(16);
  const publicTransfers = byte();
  const hasDataHash = byte();
  const hasRingDataHash = byte();
  if (publicTransfers !== 0 || hasDataHash !== 0 || hasRingDataHash !== 0) throw receiptMismatch();
  const outputs = byte();
  if (outputs < 1 || outputs > 16) throw receiptMismatch();
  const treasuryTag = Buffer.from(addressBytes.encode(expected.treasury));
  const senderTag = Buffer.from(addressBytes.encode(expected.sender));
  const treasurySlots: { hash: Buffer; payload: Buffer; position: number }[] = [];
  for (let position = 0; position < outputs; position++) {
    const hash = take(32);
    const type = byte();
    const tagAccount = type === 1 ? accounts[byte()] : undefined;
    const tag = type === 0 ? take(32) : tagAccount && Buffer.from(addressBytes.encode(tagAccount.address));
    const hasData = byte();
    if (!tag || (hasData !== 0 && hasData !== 1)) throw receiptMismatch();
    const payloadLength = hasData === 1 ? take(2).readUInt16LE() : 0;
    const payload = payloadLength === 0 ? undefined : take(payloadLength);
    if (tag.equals(treasuryTag)) {
      if (payload) treasurySlots.push({ hash, payload, position });
    } else if (!tag.equals(senderTag)) {
      throw receiptMismatch();
    }
  }
  if (treasurySlots.length === 0 || byte() !== 0) throw receiptMismatch();
  take(32); // Private transaction hash.
  if (take(2).readUInt16LE() !== 0) throw receiptMismatch(); // Confidential signer circuit.
  const circuitInputs = byte();
  const circuitOutputs = byte();
  byte(); // Public-asset slots of the circuit, zero-valued for this transfer.
  if (circuitInputs < 1 || circuitOutputs < outputs) throw receiptMismatch();
  take(192); // The pool checks the Groth16 proof onchain.
  const inputs = byte();
  if (inputs < 1 || inputs > circuitInputs) throw receiptMismatch();
  const nullifiers: Buffer[] = [];
  for (let index = 0; index < inputs; index++) {
    nullifiers.push(take(32));
    if (byte() !== 0) throw receiptMismatch(); // Only the default input tree.
  }
  if (byte() !== 1) throw receiptMismatch();
  take(4); // One input tree context.
  const nullifierAccounts = await Promise.all(
    nullifiers.map((hash) => nullifierAddress(expected.tree, hash)),
  );
  const ownerAccounts = accounts.slice(prefix.length + inputs);
  if (
    offset !== data.length ||
    !nullifierAccounts.every((key, index) => {
      const meta = accounts[prefix.length + index];
      return meta?.address === key && meta.role === AccountRole.WRITABLE;
    }) ||
    ownerAccounts.length > 1 ||
    ownerAccounts.some(
      (meta) => meta.address !== expected.sender || meta.role !== AccountRole.WRITABLE_SIGNER,
    )
  )
    throw receiptMismatch();
  return { treasurySlots, txViewingPublicKey, salt };
}

async function mainnetRpc(url: string) {
  await verifyCluster(url, "mainnet");
  return createSolanaRpc(url);
}

type PilotRpc = Awaited<ReturnType<typeof mainnetRpc>>;

async function publicAccount(rpc: PilotRpc, key: Address) {
  try {
    const { value } = await rpc
      .getAccountInfo(key, { commitment: "finalized", encoding: "base64" })
      .send({ abortSignal: AbortSignal.timeout(rpcTimeout) });
    if (value === null) return undefined;
    const record = rpcAccount.parse(value);
    return {
      owner: address(record.owner),
      lamports: record.lamports,
      data: Buffer.from(record.data[0], "base64"),
    };
  } catch {
    throw new SonnelyError("Could not verify Privacy Rings mainnet account data.", 503);
  }
}

async function verifyPilotOpening(
  input: PilotDraftInput,
  rpc: PilotRpc,
  parsed: Awaited<ReturnType<typeof readPilotWire>>,
) {
  const [
    { bytes16, bytes32, bytes33, ShieldedPublicKey, ViewingKey, X25519PublicKey },
    { decodeConfidential, decodeOutputData, EncryptedScheme, initializePoseidon, Utxo },
    { decodeSplAssetRegistry, InstructionTag, SHIELDED_POOL_PROGRAM_ID },
    { getNullifierPdaAddress, getSplAssetRegistryAddress, getTreeAddress },
    { fetchUserRecord },
  ] = await Promise.all([
    import("@heliuslabs/spr/keypair"),
    import("@heliuslabs/spr/transaction"),
    import("@heliuslabs/spr/interface"),
    import("@heliuslabs/spr/addresses"),
    import("@heliuslabs/spr/wallet"),
  ]);
  const treasury = address(input.treasury);
  if (parsed.sender === treasury) throw receiptMismatch();
  const tree = await getTreeAddress(defaultTreeId);
  const transfer = await readPoolTransfer(
    parsed.pool,
    { sender: parsed.sender, treasury, tree, transactTag: InstructionTag.transact },
    getNullifierPdaAddress,
  );
  let record: Awaited<ReturnType<typeof fetchUserRecord>>;
  try {
    const mint = address(mainnetMint);
    const [treasuryRecord, assetRecord] = await Promise.all([
      fetchUserRecord({ rpc: { getAccount: (key) => publicAccount(rpc, key) }, owner: treasury }),
      publicAccount(rpc, await getSplAssetRegistryAddress(mint)),
    ]);
    if (!treasuryRecord || assetRecord?.owner !== SHIELDED_POOL_PROGRAM_ID) throw new Error();
    const asset = decodeSplAssetRegistry(assetRecord.data);
    if (asset.mint !== mint || asset.assetId !== usdcAssetId) throw new Error();
    record = treasuryRecord;
    await initializePoseidon();
  } catch {
    throw new SonnelyError(
      "The treasury and mainnet USDC Privacy Rings accounts could not be verified.",
      503,
    );
  }

  let disclosure: Buffer | undefined;
  let viewingBytes: ReturnType<typeof bytes32> | undefined;
  let viewing: ReturnType<typeof ViewingKey.fromBytes> | undefined;
  let clear: Uint8Array | undefined;
  let blinding: Uint8Array | undefined;
  let utxo: InstanceType<typeof Utxo> | undefined;
  try {
    disclosure = Buffer.from(viewingKeyFormat.parse(input.transactionViewingKey), "base64");
    if (disclosure.length !== 32 || disclosure.toString("base64") !== input.transactionViewingKey)
      throw receiptMismatch();
    viewingBytes = bytes32(disclosure);
    viewing = ViewingKey.fromBytes(viewingBytes);
    if (!Buffer.from(viewing.publicKey().toBytes()).equals(transfer.txViewingPublicKey))
      throw receiptMismatch();
    // The pinned SDK tags random padding with a real participant's address.
    // Only the real treasury output carries the treasury's exact viewing key.
    const matching = transfer.treasurySlots.flatMap((slot) => {
      try {
        const frame = decodeOutputData(slot.payload);
        return frame.encoding === "encrypted" &&
          frame.scheme === EncryptedScheme.confidential &&
          frame.body.length > 33 &&
          Buffer.from(frame.body.subarray(0, 33)).equals(record.viewingPublicKey)
          ? [{ ...slot, ciphertext: frame.body.subarray(33) }]
          : [];
      } catch {
        return [];
      }
    });
    if (matching.length !== 1) throw receiptMismatch();
    const [note] = matching;
    const recipientKey = X25519PublicKey.fromBytes(bytes33(record.viewingPublicKey));
    const plaintext = viewing.decryptSlotEphemeral(
      recipientKey,
      note.ciphertext,
      bytes16(transfer.salt),
      note.position,
    );
    clear = plaintext;
    const decoded = decodeConfidential(plaintext);
    blinding = decoded.blinding;
    if (
      decoded.assetId !== usdcAssetId ||
      decoded.amount !== BigInt(PRIVACY_RINGS_PILOT_AMOUNT) ||
      decoded.ringProgramId !== undefined ||
      !decoded.data.isEmpty()
    )
      throw receiptMismatch();
    utxo = new Utxo({
      asset: address(mainnetMint),
      amount: decoded.amount,
      blinding: decoded.blinding,
      owner: ShieldedPublicKey.fromEd25519(bytes32(Uint8Array.from(addressBytes.encode(treasury)))),
    });
    const commitment = utxo.hash(record.nullifierPublicKey, defaultTreeId);
    if (!Buffer.from(commitment).equals(note.hash)) throw receiptMismatch();
  } catch {
    throw receiptMismatch(
      "The disclosed transaction does not pay exactly 0.01 confidential USDC to the treasury.",
    );
  } finally {
    utxo?.blinding.fill(0);
    blinding?.fill(0);
    clear?.fill(0);
    viewing?.destroy();
    viewingBytes?.fill(0);
    disclosure?.fill(0);
  }
}

function payerDebit(before: unknown, after: unknown) {
  if (typeof before !== "bigint" || typeof after !== "bigint" || before < after || after < 0n)
    throw new SonnelyError("Solana RPC could not verify the payer’s balance change.", 503);
  return before - after;
}

export async function verifyPrivacyRingsPilotDraft(input: PilotDraftInput) {
  const parsed = await readPilotWire(input);
  if (parsed.wire.signatures[parsed.sender] !== null)
    throw receiptMismatch("Prepare an unsigned payment first.");
  const rpc = await mainnetRpc(input.rpc);
  await verifyPilotOpening(input, rpc, parsed);
  try {
    const message = Buffer.from(parsed.wire.messageBytes).toString("base64") as TransactionMessageBytesBase64;
    const transaction = getBase64EncodedWireTransaction(parsed.wire);
    const [fee, simulation] = await Promise.all([
      rpc
        .getFeeForMessage(message, { commitment: "confirmed" })
        .send({ abortSignal: AbortSignal.timeout(rpcTimeout) }),
      rpc
        .simulateTransaction(transaction, {
          commitment: "confirmed",
          encoding: "base64",
          sigVerify: false,
          replaceRecentBlockhash: false,
        })
        .send({ abortSignal: AbortSignal.timeout(rpcTimeout) }),
    ]);
    if (simulation.value.err !== null)
      throw receiptMismatch("The confidential USDC payment did not pass simulation.");
    const debit = payerDebit(simulation.value.preBalances?.[0], simulation.value.postBalances?.[0]);
    if (typeof fee.value !== "bigint" || fee.value <= 0n || debit < fee.value)
      throw new SonnelyError("Solana RPC could not verify the payment fee.", 503);
    if (debit > maxDebit || fee.value > maxDebit)
      throw receiptMismatch("The estimated SOL debit exceeds this pilot’s limit of 0.00002 SOL.");
    const { value } = await rpc
      .getLatestBlockhash({ commitment: "confirmed", minContextSlot: simulation.context.slot })
      .send({ abortSignal: AbortSignal.timeout(rpcTimeout) });
    if (typeof value.lastValidBlockHeight !== "bigint" || value.lastValidBlockHeight <= 0n)
      throw new SonnelyError("Solana RPC could not verify the blockhash lifetime.", 503);
    return {
      messageHash: parsed.messageHash,
      feeLamports: fee.value.toString(),
      payerDebitLamports: debit.toString(),
      blockhash: parsed.blockhash,
      lastValidBlockHeight: value.lastValidBlockHeight.toString(),
    };
  } catch (error) {
    if (error instanceof SonnelyError) throw error;
    throw new SonnelyError("Solana RPC could not simulate the exact pilot payment.", 503);
  }
}

export async function verifyPrivacyRingsPilotSignedWire(input: SignedPilotInput) {
  const { wire, sender, messageHash, blockhash } = await readPilotWire(input);
  const signed = wire.signatures[sender];
  if (
    messageHash !== input.messageHash ||
    !signed ||
    !(await verifySignature(await getPublicKeyFromAddress(sender), signed, wire.messageBytes))
  )
    throw receiptMismatch("The wallet did not sign the reviewed transaction.");
  return { signature: getBase58Decoder().decode(signed), blockhash };
}

export async function verifyPrivacyRingsPilotReceipt(input: PilotReceiptInput) {
  const rpc = await mainnetRpc(input.rpc);
  let finalized;
  try {
    finalized = await rpc
      .getTransaction(signature(input.signature), {
        commitment: "finalized",
        encoding: "base64",
        maxSupportedTransactionVersion: 1,
      })
      .send({ abortSignal: AbortSignal.timeout(rpcTimeout) });
  } catch {
    throw new SonnelyError("Solana RPC could not check the confidential payment.", 503);
  }
  if (!finalized) throw receiptMismatch("The confidential payment is awaiting Solana finality.");
  if (
    finalized.version !== 1 ||
    finalized.meta?.err !== null ||
    finalized.transaction[1] !== "base64" ||
    typeof finalized.blockTime !== "bigint" ||
    typeof finalized.slot !== "bigint" ||
    !Number.isSafeInteger(input.createdAt) ||
    finalized.blockTime < BigInt(Math.floor(input.createdAt / 1000) - 30) ||
    input.sender === input.treasury
  )
    throw receiptMismatch();
  const signed = await verifyPrivacyRingsPilotSignedWire({ ...input, transaction: finalized.transaction[0] });
  if (
    signed.signature !== input.signature ||
    payerDebit(finalized.meta.preBalances?.[0], finalized.meta.postBalances?.[0]) > maxDebit
  )
    throw receiptMismatch();
  return { signature: signed.signature, slot: finalized.slot.toString() };
}
