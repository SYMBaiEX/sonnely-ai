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
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  setTransactionMessageConfig,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransaction,
} from "@solana/kit";
import {
  privacyRingsPilotMemo,
  verifyPrivacyRingsPilotDraft,
  verifyPrivacyRingsPilotReceipt,
  verifyPrivacyRingsPilotSignedWire,
} from "../lib/privacy-rings-receipt";
import { mainnetMint } from "../lib/payments";
import { fixtureWallet } from "./fixtures/wallets";

test("selective disclosure authenticates the exact unsigned payment and finalized signed message", async () => {
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
  const keypair = await generateKeyPair();
  const sender = await getAddressFromPublicKey(keypair.publicKey);
  const treasury = address(fixtureWallet);
  const reference = address("11111111111111111111111111111111");
  const mint = address(mainnetMint);
  const tree = await getTreeAddress(0);
  const treasuryBytes = bytes32(Uint8Array.from(getAddressEncoder().encode(treasury)));
  const mintBytes = Buffer.from(getAddressEncoder().encode(mint));
  const commitmentPublicKey = bytes32(new Uint8Array(32).fill(1));
  const receivingKey = ViewingKey.fromBytes(bytes32(new Uint8Array(32).fill(17)));
  const disclosure = ViewingKey.fromBytes(bytes32(new Uint8Array(32).fill(19)));
  const viewingPublicKey = receivingKey.publicKey();
  receivingKey.destroy();
  const treasuryIdentity = ShieldedAddress.fromPublicKeys(
    ShieldedPublicKey.fromEd25519(treasuryBytes),
    commitmentPublicKey,
    viewingPublicKey,
  );
  const disclosureBytes = disclosure.secretBytes();
  const transactionViewingKey = Buffer.from(disclosureBytes).toString("base64");
  disclosureBytes.fill(0);
  const [registryAddress, bump] = await getProgramDerivedAddress({
    programAddress: USER_REGISTRY_PROGRAM_ID,
    seeds: ["zolana/registry/v0", treasuryBytes],
  });
  const assetRegistry = await getSplAssetRegistryAddress(mint);
  const registryData = Buffer.concat([
    Buffer.from([1]),
    treasuryBytes,
    Buffer.from([bump]),
    commitmentPublicKey,
    viewingPublicKey.toBytes(),
    Buffer.from([0]),
  ]);
  const assetData = Buffer.alloc(48);
  assetData[0] = StateDiscriminator.splAssetRegistry;
  mintBytes.copy(assetData, 8);
  assetData.writeBigUInt64LE(3n, 40);
  const senderAccount = (bytes: Buffer, program: string) => ({
    data: [bytes.toString("base64"), "base64"],
    lamports: 1_158_240,
    owner: program,
    executable: false,
  });

  async function draftMessage(
    amount: bigint,
    options: { corruptCommitment?: boolean; exactSpend?: boolean; duplicateRecipient?: boolean } = {},
  ) {
    const position = options.exactSpend ? 0 : 1;
    const salt = bytes16(new Uint8Array(16).fill(3));
    const blinding = bytes32(new Uint8Array(32).fill(4));
    const output = createProofOutput({
      asset: mint,
      amount: options.corruptCommitment ? amount - 1n : amount,
      blinding,
      ownerAddress: treasuryIdentity,
    });
    const payload = encodeOutputData(
      EncryptedScheme.confidential,
      encryptConfidential(
        disclosure,
        viewingPublicKey,
        { assetId: 3n, amount, blinding, data: new Data() },
        salt,
        position,
      ),
      "encrypted",
    );
    const recipient = {
      utxoHash: output.hash(0),
      ownerTag: { kind: "inline" as const, value: treasuryBytes },
      data: payload,
    };
    const change = {
      utxoHash: bytes32(new Uint8Array(32).fill(5)),
      ownerTag: { kind: "account" as const, index: 0 },
    };
    const padding = { ...recipient, data: new Uint8Array(payload.length).fill(0xf7) };
    const instruction = await transactInstruction({
      payer: sender,
      ownerSigners: [sender],
      outputTree: tree,
      inputTree: tree,
      data: {
        expiryUnixTs: 2n ** 64n - 1n,
        txViewingPk: disclosure.publicKey().toBytes(),
        salt,
        interfaceTransfers: [],
        outputs: options.duplicateRecipient
          ? [recipient, recipient]
          : options.exactSpend
            ? [recipient, padding]
            : [change, recipient],
        messages: [],
        privateTxHash: bytes32(new Uint8Array(32).fill(6)),
        circuit: { kind: "confidentialSigner", inputs: 1, outputs: 2, publicAssetSlots: 2 },
        proof: {
          a: bytes32(new Uint8Array(32)),
          b: new Uint8Array(128) as Parameters<typeof transactInstruction>[0]["data"]["proof"]["b"],
          c: bytes32(new Uint8Array(32)),
        },
        inputs: [{ nullifierHash: bytes32(new Uint8Array(32).fill(7)), treeIndex: 0 }],
        treeContexts: [{ utxoTreeRootIndex: 0, nullifierTreeRootIndex: 0 }],
      },
    });
    const message = setTransactionMessageLifetimeUsingBlockhash(
      { blockhash: blockhash(reference), lastValidBlockHeight: 123n },
      setTransactionMessageFeePayer(sender, createTransactionMessage({ version: 1 })),
    );
    return compileTransaction(
      setTransactionMessageConfig(
        { computeUnitLimit: 500_000, loadedAccountsDataSizeLimit: 64 * 1024 * 1024 },
        appendTransactionMessageInstructions(
          [
            instruction,
            {
              programAddress: address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
              data: new TextEncoder().encode(privacyRingsPilotMemo(reference)),
            },
          ],
          message,
        ),
      ),
    );
  }

  const createdAt = 1_800_000_000_000;
  const rpc = "https://rpc.example";
  const input = { sender, treasury, reference, rpc };
  const original = globalThis.fetch;
  let simulationDebit = 10_000;
  let finalizedWire: string | undefined;
  let simulated: string | undefined;
  let blockTime = Math.floor(createdAt / 1000);
  try {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      const context = (value: unknown) => ({ context: { slot: 12 }, value });
      const result = (() => {
        switch (request.method) {
          case "getGenesisHash":
            return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
          case "getAccountInfo":
            // Kit omits the commitment parameter for the RPC default, finalized.
            expect(request.params[1].commitment ?? "finalized").toBe("finalized");
            expect([assetRegistry, registryAddress]).toContain(request.params[0]);
            return context(
              request.params[0] === registryAddress
                ? senderAccount(registryData, USER_REGISTRY_PROGRAM_ID)
                : senderAccount(assetData, SHIELDED_POOL_PROGRAM_ID),
            );
          case "getFeeForMessage":
            return context(5_000);
          case "simulateTransaction":
            expect(request.params[1]).toMatchObject({
              encoding: "base64",
              sigVerify: false,
              replaceRecentBlockhash: false,
            });
            simulated = request.params[0];
            return context({ err: null, preBalances: [100_000], postBalances: [100_000 - simulationDebit] });
          case "getLatestBlockhash":
            return context({ blockhash: reference, lastValidBlockHeight: 120 });
          case "getTransaction":
            expect(request.params[1].commitment ?? "finalized").toBe("finalized");
            expect(request.params[1]).toMatchObject({
              encoding: "base64",
              maxSupportedTransactionVersion: 1,
            });
            return finalizedWire
              ? {
                  transaction: [finalizedWire, "base64"],
                  version: 1,
                  slot: 12,
                  blockTime,
                  meta: { err: null, preBalances: [100_000], postBalances: [90_000] },
                }
              : null;
          default:
            throw new Error("Unexpected pilot RPC call");
        }
      })();
      return Response.json({ jsonrpc: "2.0", id: request.id, result });
    };
    const tx = await draftMessage(10_000n);
    const transaction = getBase64EncodedWireTransaction(tx);
    const draft = await verifyPrivacyRingsPilotDraft({ ...input, transaction, transactionViewingKey });
    expect(draft).toMatchObject({
      feeLamports: "5000",
      payerDebitLamports: "10000",
      blockhash: reference,
      lastValidBlockHeight: "120",
    });
    expect(simulated).toBe(transaction);
    const transactionInputs = { ...input, transactionViewingKey };
    const wrongAmount = getBase64EncodedWireTransaction(await draftMessage(10_001n));
    await expect(
      verifyPrivacyRingsPilotDraft({ ...transactionInputs, transaction: wrongAmount }),
    ).rejects.toThrow("exactly 0.01");
    const wrongCommitment = getBase64EncodedWireTransaction(
      await draftMessage(10_000n, { corruptCommitment: true }),
    );
    await expect(
      verifyPrivacyRingsPilotDraft({ ...transactionInputs, transaction: wrongCommitment }),
    ).rejects.toThrow("exactly 0.01");
    const exactSpend = getBase64EncodedWireTransaction(await draftMessage(10_000n, { exactSpend: true }));
    await expect(
      verifyPrivacyRingsPilotDraft({ ...transactionInputs, transaction: exactSpend }),
    ).resolves.toMatchObject({ feeLamports: "5000" });
    const duplicateRecipient = getBase64EncodedWireTransaction(
      await draftMessage(10_000n, { duplicateRecipient: true }),
    );
    await expect(
      verifyPrivacyRingsPilotDraft({ ...transactionInputs, transaction: duplicateRecipient }),
    ).rejects.toThrow("exactly 0.01");
    await expect(
      verifyPrivacyRingsPilotDraft({
        ...transactionInputs,
        transaction,
        transactionViewingKey: Buffer.alloc(32).toString("base64"),
      }),
    ).rejects.toThrow("exactly 0.01");
    simulationDebit = 20_001;
    await expect(verifyPrivacyRingsPilotDraft({ ...transactionInputs, transaction })).rejects.toThrow(
      "exceeds",
    );
    const signedWire = getBase64EncodedWireTransaction(await signTransaction([keypair], tx));
    const { signature } = await verifyPrivacyRingsPilotSignedWire({
      ...input,
      transaction: signedWire,
      messageHash: draft.messageHash,
    });
    const receipt = { ...input, signature, createdAt, messageHash: draft.messageHash };
    await expect(verifyPrivacyRingsPilotReceipt(receipt)).rejects.toThrow("awaiting Solana finality");
    finalizedWire = signedWire;
    await expect(verifyPrivacyRingsPilotReceipt(receipt)).resolves.toEqual({ signature, slot: "12" });
    await expect(verifyPrivacyRingsPilotReceipt({ ...receipt, messageHash: "1".repeat(64) })).rejects.toThrow(
      "reviewed transaction",
    );
    await expect(verifyPrivacyRingsPilotReceipt({ ...receipt, reference: treasury })).rejects.toThrow(
      "does not match",
    );
    blockTime -= 60;
    await expect(verifyPrivacyRingsPilotReceipt(receipt)).rejects.toThrow("does not match");
  } finally {
    disclosure.destroy();
    globalThis.fetch = original;
  }
});
