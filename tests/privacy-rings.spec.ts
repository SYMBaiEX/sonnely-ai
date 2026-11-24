import { expect, test } from "@playwright/test";
import {
  address,
  decompileTransactionMessage,
  getAddressEncoder,
  getCompiledTransactionMessageDecoder,
  getProgramDerivedAddress,
  getTransactionDecoder,
} from "@solana/kit";
import { prepareTreasuryPrivacyRingsRegistration, treasuryPrivacyRingsStatus } from "../lib/privacy-rings";
import { fixtureWallet } from "./fixtures/wallets";

test("treasury registration returns only the exact simulated unsigned v1 or v0 draft", async () => {
  const { bytes32, ViewingKey } = await import("@heliuslabs/spr/keypair");
  const { USER_REGISTRY_PROGRAM_ID } = await import("@heliuslabs/spr/interface");
  const owner = address(fixtureWallet);
  const ownerBytes = Uint8Array.from(getAddressEncoder().encode(owner));
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: USER_REGISTRY_PROGRAM_ID,
    seeds: ["zolana/registry/v0", ownerBytes],
  });
  const viewing = ViewingKey.fromBytes(bytes32(new Uint8Array(32).fill(17)));
  const viewingPublicKey = Buffer.from(viewing.publicKey().toBytes());
  viewing.destroy();
  const nullifierPublicKey = Buffer.alloc(32, 1);
  const args = {
    treasury: owner,
    viewingPublicKey: viewingPublicKey.toString("base64"),
    nullifierPublicKey: nullifierPublicKey.toString("base64"),
  };
  const registry = {
    owner: USER_REGISTRY_PROGRAM_ID,
    executable: false,
    lamports: 1_158_240,
    rentEpoch: 0,
    data: [
      Buffer.concat([
        Buffer.from([1]),
        ownerBytes,
        Buffer.from([bump]),
        nullifierPublicKey,
        viewingPublicKey,
        Buffer.from([0]),
      ]).toString("base64"),
      "base64",
    ],
  };
  const priorEnv = { ...process.env };
  const fetchOriginal = globalThis.fetch;
  let registered = false;
  let simulationError: string | null = null;
  let simulated: string | undefined;
  let feeMessage: string | undefined;
  try {
    process.env.SOLANA_TREASURY = owner;
    process.env.SOLANA_BILLING_CLUSTER = "mainnet";
    process.env.SOLANA_RPC_URL = "https://rpc.example";
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      const context = (value: unknown) => ({ context: { slot: 12 }, value });
      let result: unknown;
      if (request.method === "getGenesisHash") {
        result = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
      } else if (request.method === "getAccountInfo") {
        expect(request.params[0]).toBe(pda);
        result = context(registered ? registry : null);
      } else if (request.method === "getLatestBlockhash") {
        result = context({ blockhash: owner, lastValidBlockHeight: 123 });
      } else if (request.method === "getFeeForMessage") {
        feeMessage = request.params[0];
        result = context(5000);
      } else {
        expect(request.method).toBe("simulateTransaction");
        expect(request.params[1]).toMatchObject({
          encoding: "base64",
          replaceRecentBlockhash: false,
          sigVerify: false,
          accounts: { addresses: [pda], encoding: "base64" },
        });
        simulated = request.params[0];
        result = context({ err: simulationError, accounts: [registry] });
      }
      return Response.json({ jsonrpc: "2.0", id: request.id, result });
    };

    await expect(treasuryPrivacyRingsStatus()).resolves.toEqual({
      cluster: "mainnet",
      treasury: owner,
      registered: false,
      canPrepare: true,
    });
    for (const version of [1, 0] as const) {
      const draft = await prepareTreasuryPrivacyRingsRegistration({ ...args, version });
      expect(draft).toMatchObject({
        cluster: "mainnet",
        treasury: owner,
        version,
        feeLamports: "5000",
        rentLamports: "1158240",
      });
      expect(draft.transaction).toBe(simulated);
      const tx = getTransactionDecoder().decode(Buffer.from(draft.transaction, "base64"));
      expect(Buffer.from(tx.messageBytes).toString("base64")).toBe(feeMessage);
      expect(Object.entries(tx.signatures)).toEqual([[owner, null]]);
      const message = decompileTransactionMessage(
        getCompiledTransactionMessageDecoder().decode(tx.messageBytes),
      );
      expect(message.version).toBe(version);
      expect(message.feePayer.address).toBe(owner);
      expect(message.instructions).toHaveLength(1);
      const [register] = message.instructions;
      expect(register.programAddress).toBe(USER_REGISTRY_PROGRAM_ID);
      expect(Buffer.from(register.data!)).toEqual(
        Buffer.concat([Buffer.from([0]), nullifierPublicKey, viewingPublicKey]),
      );
    }
    await expect(
      prepareTreasuryPrivacyRingsRegistration({ ...args, derivationSignature: [] }),
    ).rejects.toThrow();
    await expect(prepareTreasuryPrivacyRingsRegistration({ ...args, treasury: pda })).rejects.toMatchObject({
      status: 403,
    });
    simulationError = "InsufficientFundsForFee";
    await expect(prepareTreasuryPrivacyRingsRegistration(args)).rejects.toThrow("did not pass simulation");
    registered = true;
    await expect(treasuryPrivacyRingsStatus()).resolves.toMatchObject({
      registered: true,
      canPrepare: false,
    });
    await expect(prepareTreasuryPrivacyRingsRegistration(args)).rejects.toMatchObject({ status: 409 });
  } finally {
    globalThis.fetch = fetchOriginal;
    process.env = priorEnv;
  }
});
