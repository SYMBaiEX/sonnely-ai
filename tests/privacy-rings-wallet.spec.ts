import { generateKeyPairSync, sign } from "node:crypto";
import {
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageConfig,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { expect, test } from "@playwright/test";
import { fixtureWallet } from "./fixtures/wallets";

for (const scenario of [
  { title: "registers through a single action with v1", version: 1 },
  { title: "registers through a single action with v0", version: 0 },
  { title: "stops when Phantom rejects the setup message", version: 0, failure: "phantom" },
  { title: "stops when the simulated network fee is above the limit", version: 1, failure: "fee" },
  { title: "stops when the simulated account rent is above the limit", version: 1, failure: "rent" },
] as const) {
  test(`treasury wallet ${scenario.title}`, async ({ page }) => {
    const { version } = scenario;
    const failure = "failure" in scenario ? scenario.failure : undefined;
    const walletName = failure === "phantom" ? "Phantom" : "Treasury fixture";
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const [
      { getRegisterInstructionAsync },
      { bytes32, ed25519DerivationMessage, initializePoseidon },
      { LocalShieldedKeys },
      { getUserRecordAddress },
    ] = await Promise.all([
      import("@heliuslabs/spr/instructions"),
      import("@heliuslabs/spr/keypair"),
      import("@heliuslabs/spr/transaction"),
      import("@heliuslabs/spr/addresses"),
    ]);
    const publicBytes = Uint8Array.from(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
    const treasury = address(getBase58Decoder().decode(publicBytes));
    const registryAddress = await getUserRecordAddress(treasury);
    const derivationMessage = ed25519DerivationMessage(bytes32(publicBytes));
    const seed = sign(null, derivationMessage, privateKey);
    await initializePoseidon();
    const keys = LocalShieldedKeys.fromDerivationSeed({ solanaPublicKey: treasury, derivationSeed: seed });
    const identity = keys.address();
    const nullifierPublicKey = identity.nullifierPublicKey;
    const viewingPublicKey = identity.viewingPublicKey.toBytes();
    keys.destroy();
    seed.fill(0);
    const instruction = await getRegisterInstructionAsync({
      owner: treasury,
      payer: treasury,
      nullifierPublicKey,
      viewingPublicKey,
    });
    const message =
      version === 1
        ? setTransactionMessageConfig(
            { computeUnitLimit: 100_000, loadedAccountsDataSizeLimit: 128 * 1024 },
            createTransactionMessage({ version }),
          )
        : createTransactionMessage({ version });
    const transaction = pipe(
      message,
      (tx) => setTransactionMessageFeePayer(treasury, tx),
      (tx) => appendTransactionMessageInstructions([instruction], tx),
      (tx) =>
        setTransactionMessageLifetimeUsingBlockhash(
          {
            blockhash: blockhash("3kHMwG9XfUx7LVZ1wNfgCpYHPKUhEgNUoFHDMFGaCH5q"),
            lastValidBlockHeight: 100n,
          },
          tx,
        ),
      compileTransaction,
      getBase64EncodedWireTransaction,
    );

    let prepared = false;
    let requestedSetup = false;
    let sent = false;
    await page.exposeFunction("signPrivacyFixture", (bytes: number[]) => {
      requestedSetup = true;
      expect(Uint8Array.from(bytes)).toEqual(derivationMessage);
      if (failure === "phantom") throw new Error("You cannot sign solana transactions using sign message.");
      return [...sign(null, Uint8Array.from(bytes), privateKey)];
    });
    await page.exposeFunction("sendPrivacyFixture", (bytes: number[]) => {
      expect(prepared).toBe(true);
      expect(Buffer.from(bytes).toString("base64")).toBe(transaction);
      sent = true;
      return Array(64).fill(18);
    });
    await page.addInitScript(
      ({ treasury, publicBytes, version, walletName }) => {
        const chain = "solana:mainnet";
        const account = {
          address: treasury,
          publicKey: Uint8Array.from(publicBytes),
          chains: [chain],
          features: ["solana:signMessage", "solana:signAndSendTransaction"],
        };
        const browser = window as typeof window & {
          signPrivacyFixture: (bytes: number[]) => Promise<number[]>;
          sendPrivacyFixture: (bytes: number[]) => Promise<number[]>;
        };
        let accounts: (typeof account)[] = [];
        const wallet = {
          name: walletName,
          version: "1.0.0",
          icon: "data:image/png;base64,",
          get accounts() {
            return accounts;
          },
          chains: [chain],
          features: {
            "standard:connect": {
              version: "1.0.0",
              connect: async () => {
                accounts = [account];
                return { accounts };
              },
            },
            "solana:signMessage": {
              version: "1.1.0",
              signMessage: async ({ message }: { message: Uint8Array }) => [
                {
                  signedMessage: message,
                  signature: Uint8Array.from(await browser.signPrivacyFixture([...message])),
                },
              ],
            },
            "solana:signAndSendTransaction": {
              version: "1.0.0",
              supportedTransactionVersions: version === 1 ? [0, 1] : [0],
              signAndSendTransaction: async (input: { chain: string; transaction: Uint8Array }) => {
                if (input.chain !== chain) throw new Error("Wrong network");
                return [
                  { signature: Uint8Array.from(await browser.sendPrivacyFixture([...input.transaction])) },
                ];
              },
            },
          },
        };
        window.addEventListener("wallet-standard:app-ready", (event) => {
          (event as CustomEvent).detail.register(wallet);
        });
      },
      { treasury, publicBytes: [...publicBytes], version, walletName },
    );
    await page.route("**/api/sonnely/session", (route) =>
      route.fulfill({
        json: {
          enabled: true,
          cluster: "mainnet",
          profile: { wallet: fixtureWallet, role: "admin", name: "", balance: 0, onboarding: "later" },
        },
      }),
    );
    await page.route("**/api/sonnely/admin", (route) => route.fulfill({ status: 503, json: {} }));
    await page.route("**/api/sonnely/admin-crm?*", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/sonnely/admin-privacy-rings", (route) => {
      const status = {
        cluster: "mainnet",
        treasury,
        registered: sent,
        canPrepare: !sent,
        ...(sent ? { registryAddress } : {}),
      };
      if (route.request().method() === "GET") return route.fulfill({ json: status });
      expect(route.request().postDataJSON()).toEqual({
        treasury,
        version,
        nullifierPublicKey: Buffer.from(nullifierPublicKey).toString("base64"),
        viewingPublicKey: Buffer.from(viewingPublicKey).toString("base64"),
      });
      prepared = true;
      return route.fulfill({
        json: {
          ...status,
          version,
          transaction,
          feeLamports: failure === "fee" ? "10001" : "5000",
          rentLamports: failure === "rent" ? "1990001" : "1158240",
        },
      });
    });

    await page.goto("/console/admin/privacy-rings");
    await expect(page.getByRole("button", { name: "Register", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: `Connect ${walletName}` }).click();
    await expect(page.getByText(/Maximum simulated cost of 0.002 SOL/)).toBeVisible();
    expect(requestedSetup).toBe(false);
    expect(prepared).toBe(false);
    expect(sent).toBe(false);
    await page.getByRole("button", { name: "Register", exact: true }).click();
    const error = page.getByRole("region", { name: "Privacy Rings", exact: true }).getByRole("alert");
    if (failure === "phantom") {
      await expect(error).toContainText("Phantom blocked the Privacy Rings setup message.");
      expect(requestedSetup).toBe(true);
      expect(prepared).toBe(false);
      expect(sent).toBe(false);
      await page.getByRole("button", { name: "Change treasury wallet" }).click();
      await expect(page.getByRole("button", { name: "Connect Phantom" })).toBeVisible();
      return;
    }
    if (failure) {
      await expect(error).toContainText("exceeds the approved fee or rent limit");
      expect(prepared).toBe(true);
      expect(sent).toBe(false);
      return;
    }
    await expect(
      page.getByRole("status").filter({ hasText: "Treasury registration finalized." }),
    ).toBeVisible();
    await expect(page.getByText("0.000005 SOL", { exact: true })).toBeVisible();
    await expect(page.getByText("0.00115824 SOL", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /View finalized registry/ })).toHaveAttribute(
      "href",
      `https://explorer.solana.com/address/${registryAddress}`,
    );
    await expect(page.getByRole("link", { name: /View transaction/ })).toHaveAttribute(
      "href",
      `https://explorer.solana.com/tx/${getBase58Decoder().decode(new Uint8Array(64).fill(18))}`,
    );
    expect(sent).toBe(true);
  });
}
