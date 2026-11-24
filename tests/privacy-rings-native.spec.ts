import { expect, test } from "@playwright/test";
import {
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  generateKeyPair,
  getAddressEncoder,
  getAddressFromPublicKey,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransaction,
} from "@solana/kit";
import { mainnetMint } from "../lib/payments";
import { verifyPrivacyRingsNativeReceipt } from "../lib/privacy-rings-native";
import { fixtureWallet } from "./fixtures/wallets";

test("native Privacy Rings claims require finalized owner-signed transfer and exact private USDC opening", async () => {
  const [
    { bytes16, bytes32, ShieldedAddress, ShieldedPublicKey, ViewingKey },
    { createProofOutput, Data, EncryptedScheme, initializePoseidon },
    { encodeOutputData, encryptConfidential },
    { getSplAssetRegistryAddress, getTreeAddress },
    { SHIELDED_POOL_PROGRAM_ID, USER_REGISTRY_PROGRAM_ID, StateDiscriminator, transactInstruction },
  ] = await Promise.all([
    import("@heliuslabs/spr/keypair"),
    import("@heliuslabs/spr/transaction"),
    import("@heliuslabs/spr/internal"),
    import("@heliuslabs/spr/addresses"),
    import("@heliuslabs/spr/interface"),
  ]);
  await initializePoseidon();
  const payerKeys = await generateKeyPair();
  const ownerKeys = await generateKeyPair();
  const payer = await getAddressFromPublicKey(payerKeys.publicKey);
  const otherOwner = await getAddressFromPublicKey(ownerKeys.publicKey);
  const treasury = address(fixtureWallet);
  const mint = address(mainnetMint);
  const tree = await getTreeAddress(0);
  const treasuryTag = bytes32(Uint8Array.from(getAddressEncoder().encode(treasury)));
  const nullifierPublicKey = bytes32(new Uint8Array(32).fill(1));
  const treasurySecret = bytes32(new Uint8Array(32).fill(11));
  const treasuryViewingKey = Buffer.from(treasurySecret).toString("base64");
  const treasuryViewer = ViewingKey.fromBytes(treasurySecret);
  treasurySecret.fill(0);
  const treasuryPublicKey = treasuryViewer.publicKey();
  treasuryViewer.destroy();
  const treasuryIdentity = ShieldedAddress.fromPublicKeys(
    ShieldedPublicKey.fromEd25519(treasuryTag),
    nullifierPublicKey,
    treasuryPublicKey,
  );
  const [registry, bump] = await getProgramDerivedAddress({
    programAddress: USER_REGISTRY_PROGRAM_ID,
    seeds: ["zolana/registry/v0", treasuryTag],
  });
  const assetRegistry = await getSplAssetRegistryAddress(mint);
  const registryBytes = Buffer.concat([
    Buffer.from([1]),
    treasuryTag,
    Buffer.from([bump]),
    nullifierPublicKey,
    treasuryPublicKey.toBytes(),
    Buffer.from([0]),
  ]);
  const assetBytes = Buffer.alloc(48);
  assetBytes[0] = StateDiscriminator.splAssetRegistry;
  Buffer.from(getAddressEncoder().encode(mint)).copy(assetBytes, 8);
  assetBytes.writeBigUInt64LE(3n, 40);

  async function signedTransfer(
    options: {
      amount?: bigint;
      assetId?: bigint;
      commitmentAmount?: bigint;
      owner?: typeof payer;
      publicLeg?: boolean;
      wrongViewingKey?: boolean;
      version?: 0 | 1;
    } = {},
  ) {
    const amount = options.amount ?? 5_000_000n;
    const owner = options.owner ?? payer;
    const salt = bytes16(new Uint8Array(16).fill(2));
    const blinding = bytes32(new Uint8Array(32).fill(4));
    const txViewing = ViewingKey.generate();
    const output = createProofOutput({
      asset: mint,
      amount: options.commitmentAmount ?? amount,
      blinding,
      ownerAddress: treasuryIdentity,
    });
    const payload = encodeOutputData(
      EncryptedScheme.confidential,
      encryptConfidential(
        txViewing,
        options.wrongViewingKey ? txViewing.publicKey() : treasuryPublicKey,
        { assetId: options.assetId ?? 3n, amount, blinding, data: new Data() },
        salt,
        1,
      ),
      "encrypted",
    );
    const txViewingPk = txViewing.publicKey().toBytes();
    txViewing.destroy();

    const pool = await transactInstruction({
      payer,
      ownerSigners: [owner],
      outputTree: tree,
      inputTree: tree,
      data: {
        expiryUnixTs: 2n ** 64n - 1n,
        txViewingPk,
        salt,
        interfaceTransfers: options.publicLeg ? [{ kind: "solWithdrawal", amount: 1n }] : [],
        outputs: [
          { utxoHash: bytes32(new Uint8Array(32).fill(5)), ownerTag: { kind: "account", index: 0 } },
          { utxoHash: output.hash(0), ownerTag: { kind: "inline", value: treasuryTag }, data: payload },
          // Wallet service-fee outputs and randomized padding are compatible.
          {
            utxoHash: bytes32(new Uint8Array(32).fill(6)),
            ownerTag: { kind: "inline", value: bytes32(new Uint8Array(32).fill(7)) },
          },
          {
            utxoHash: bytes32(new Uint8Array(32).fill(8)),
            ownerTag: { kind: "inline", value: treasuryTag },
            data: new Uint8Array(payload.length).fill(0xf7),
          },
        ],
        messages: [],
        privateTxHash: bytes32(new Uint8Array(32)),
        circuit: { kind: "confidentialSigner", inputs: 1, outputs: 4, publicAssetSlots: 2 },
        proof: {
          a: bytes32(new Uint8Array(32)),
          b: new Uint8Array(128) as Parameters<typeof transactInstruction>[0]["data"]["proof"]["b"],
          c: bytes32(new Uint8Array(32)),
        },
        inputs: [{ nullifierHash: bytes32(new Uint8Array(32).fill(9)), treeIndex: 0 }],
        treeContexts: [{ utxoTreeRootIndex: 0, nullifierTreeRootIndex: 0 }],
      },
    });
    const memo = {
      programAddress: address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      data: new Uint8Array([65]),
    };
    const message = setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: blockhash("11111111111111111111111111111111"),
        lastValidBlockHeight: 123n,
      },
      setTransactionMessageFeePayer(payer, createTransactionMessage({ version: options.version ?? 1 })),
    );
    const signed = await signTransaction(
      owner === payer ? [payerKeys] : [payerKeys, ownerKeys],
      compileTransaction(appendTransactionMessageInstructions([memo, pool, memo], message)),
    );
    return {
      wire: getBase64EncodedWireTransaction(signed),
      signature: getBase58Decoder().decode(signed.signatures[payer]!),
    };
  }

  const blockTime = 1_800_000_000;
  let transaction = await signedTransfer();
  let network = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
  let meta: { err: null | string } | undefined = { err: null };
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      let result;
      switch (request.method) {
        case "getGenesisHash":
          result = network;
          break;
        case "getTransaction":
          expect(request.params[1]).toMatchObject({ encoding: "base64", maxSupportedTransactionVersion: 1 });
          expect(request.params[1].commitment ?? "finalized").toBe("finalized");
          result =
            meta === undefined
              ? null
              : { transaction: [transaction.wire, "base64"], version: 1, slot: 12, blockTime, meta };
          break;
        case "getAccountInfo": {
          expect(request.params[1].minContextSlot).toBe(12);
          expect([registry, assetRegistry]).toContain(request.params[0]);
          const isRegistry = request.params[0] === registry;
          result = {
            context: { slot: 15 },
            value: {
              data: [(isRegistry ? registryBytes : assetBytes).toString("base64"), "base64"],
              lamports: 1_158_240,
              owner: isRegistry ? USER_REGISTRY_PROGRAM_ID : SHIELDED_POOL_PROGRAM_ID,
              executable: false,
            },
          };
          break;
        }
        default:
          throw new Error("Unexpected Solana request");
      }
      return Response.json({ jsonrpc: "2.0", id: request.id, result });
    };
    const args = {
      rpc: "https://rpc.example",
      sender: payer,
      treasury,
      amount: 5_000_000,
      createdAt: (blockTime - 1) * 1000,
      expiresAt: (blockTime + 60) * 1000,
    };
    const verify = (options: Partial<typeof args> & { treasuryViewingKey?: string } = {}) =>
      verifyPrivacyRingsNativeReceipt({ ...args, signature: transaction.signature, ...options });

    await expect(verify()).resolves.toEqual({
      signature: transaction.signature,
      slot: "12",
      blockTime,
      status: "treasury-review",
      reviewReason: "details-encrypted",
    });
    await expect(verify({ treasuryViewingKey })).resolves.toMatchObject({ status: "verified" });
    await expect(verify({ amount: 4_000_000, treasuryViewingKey })).resolves.toMatchObject({
      status: "treasury-review",
      reviewReason: "amount-mismatch",
    });
    await expect(verify({ treasuryViewingKey: Buffer.alloc(32, 12).toString("base64") })).rejects.toThrow(
      "finalized registry",
    );
    await expect(verify({ createdAt: (blockTime + 1) * 1000 })).rejects.toThrow("during this checkout");
    await expect(verify({ createdAt: blockTime * 1000 + 1 })).rejects.toThrow("during this checkout");
    await expect(verify({ expiresAt: blockTime * 1000 })).rejects.toThrow("during this checkout");
    await expect(
      verify({ createdAt: blockTime * 1000, expiresAt: blockTime * 1000 + 1 }),
    ).resolves.toMatchObject({ status: "treasury-review" });
    await expect(
      verify({ createdAt: (blockTime - 10) * 1000, expiresAt: (blockTime - 1) * 1000 }),
    ).rejects.toThrow("during this checkout");
    meta = undefined;
    await expect(verify()).rejects.toThrow("awaiting Solana finality");
    meta = { err: "BlockhashNotFound" };
    await expect(verify()).rejects.toThrow("successful, finalized");
    meta = { err: null };
    network = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
    await expect(verify()).rejects.toThrow("different network");
    network = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
    transaction = await signedTransfer({ owner: otherOwner });
    await expect(verify()).rejects.toThrow("not a matching private transfer");
    await expect(verify({ sender: otherOwner, treasuryViewingKey })).resolves.toMatchObject({
      status: "verified",
    });
    transaction = await signedTransfer({ publicLeg: true });
    await expect(verify()).rejects.toThrow("not a matching private transfer");
    transaction = await signedTransfer({ wrongViewingKey: true });
    await expect(verify()).rejects.toThrow("not a matching private transfer");
    transaction = await signedTransfer({ version: 0 });
    await expect(verify()).rejects.toThrow("not a matching private transfer");
    transaction = await signedTransfer({ commitmentAmount: 4_000_000n });
    await expect(verify({ treasuryViewingKey })).rejects.toThrow("on-chain treasury output");
    transaction = await signedTransfer({ assetId: 2n });
    await expect(verify({ treasuryViewingKey })).resolves.toMatchObject({
      status: "treasury-review",
      reviewReason: "asset-mismatch",
    });
  } finally {
    globalThis.fetch = original;
  }
});
