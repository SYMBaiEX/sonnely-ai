import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import {
  address,
  decompileTransactionMessage,
  getAddressEncoder,
  getCompiledTransactionMessageDecoder,
  getProgramDerivedAddress,
  getTransactionDecoder,
} from "@solana/kit";
import { prepareTreasuryPrivacyRingsRegistration, treasuryPrivacyRingsStatus } from "../lib/privacy-rings";
import { GET } from "../app/api/sonnely/[task]/route";
import { fixtureWallet, localFixtureWallets } from "./fixtures/wallets";

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
      registryAddress: pda,
    });
    await expect(prepareTreasuryPrivacyRingsRegistration(args)).rejects.toMatchObject({ status: 409 });
  } finally {
    globalThis.fetch = fetchOriginal;
    process.env = priorEnv;
  }
});

test("billing Privacy Rings status uses finalized records for the admin session wallet and treasury", async () => {
  const { USER_REGISTRY_PROGRAM_ID } = await import("@heliuslabs/spr/interface");
  const { treasury, profit: unrelatedWallet } = localFixtureWallets();
  const addressEncoder = getAddressEncoder();
  const treasuryBytes = Uint8Array.from(addressEncoder.encode(address(treasury)));
  const walletBytes = Uint8Array.from(addressEncoder.encode(address(fixtureWallet)));
  const [[treasuryRecord, treasuryBump], [walletRecord, walletBump]] = await Promise.all(
    [treasuryBytes, walletBytes].map((owner) =>
      getProgramDerivedAddress({
        programAddress: USER_REGISTRY_PROGRAM_ID,
        seeds: ["zolana/registry/v0", owner],
      }),
    ),
  );
  const registry = (owner: Uint8Array, bump: number) => ({
    owner: USER_REGISTRY_PROGRAM_ID,
    executable: false,
    lamports: 1_158_240,
    data: [
      Buffer.concat([
        Buffer.from([1]),
        Buffer.from(owner),
        Buffer.from([bump]),
        Buffer.alloc(32, 1),
        Buffer.from([4]),
        Buffer.alloc(32, 1),
        Buffer.from([0]),
      ]).toString("base64"),
      "base64",
    ],
  });
  const requestStatus = (authenticated: boolean) =>
    GET(
      new NextRequest(`http://localhost/api/sonnely/billing-privacy-rings?wallet=${unrelatedWallet}`, {
        headers: authenticated ? { cookie: "sonnely_session=test" } : undefined,
      }),
      { params: Promise.resolve({ task: "billing-privacy-rings" }) },
    );
  const priorEnv = { ...process.env };
  const fetchOriginal = globalThis.fetch;
  const reads: string[] = [];
  let role = "member";
  let accountForWallet: ReturnType<typeof registry> | null = null;
  try {
    process.env.CONVEX_URL = "https://convex.example";
    process.env.SONNELY_SERVICE_SECRET = "test".repeat(8);
    process.env.SOLANA_TREASURY = treasury;
    process.env.SOLANA_BILLING_CLUSTER = "mainnet";
    process.env.SOLANA_RPC_URL = "https://rpc.example";
    globalThis.fetch = async (url, init) => {
      const request = JSON.parse(String(init?.body));
      if (String(url) === "https://convex.example/api/query") {
        expect(request.path).toBe("sonnely:profile");
        return Response.json({ status: "success", value: { wallet: fixtureWallet, role } });
      }
      expect(String(url)).toBe("https://rpc.example");
      if (request.method === "getGenesisHash") {
        return Response.json({
          jsonrpc: "2.0",
          id: request.id,
          result: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
        });
      }
      expect(request.method).toBe("getAccountInfo");
      expect(request.params[1].commitment ?? "finalized").toBe("finalized");
      const pda = request.params[0];
      expect([treasuryRecord, walletRecord]).toContain(pda);
      reads.push(pda);
      const value = pda === treasuryRecord ? registry(treasuryBytes, treasuryBump) : accountForWallet;
      return Response.json({ jsonrpc: "2.0", id: request.id, result: { context: { slot: 12 }, value } });
    };

    expect((await requestStatus(false)).status).toBe(401);
    expect((await requestStatus(true)).status).toBe(403);
    expect(reads).toHaveLength(0);
    role = "admin";
    const response = await requestStatus(true);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      cluster: "mainnet",
      treasuryRegistered: true,
      walletRegistered: false,
    });
    expect(reads.sort()).toEqual([treasuryRecord, walletRecord].sort());

    accountForWallet = registry(treasuryBytes, walletBump);
    expect((await requestStatus(true)).status).toBe(503);
    accountForWallet = registry(walletBytes, walletBump);
    const bothRegistered = await requestStatus(true);
    expect(bothRegistered.status).toBe(200);
    await expect(bothRegistered.json()).resolves.toEqual({
      cluster: "mainnet",
      treasuryRegistered: true,
      walletRegistered: true,
    });
  } finally {
    globalThis.fetch = fetchOriginal;
    process.env = priorEnv;
  }
});
