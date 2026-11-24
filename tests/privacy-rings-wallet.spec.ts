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
import { getRegisterInstructionAsync } from "@heliuslabs/spr/instructions";
import { bytes32, ed25519DerivationMessage, initializePoseidon } from "@heliuslabs/spr/keypair";
import { LocalShieldedKeys } from "@heliuslabs/spr/transaction";
import { expect, test } from "@playwright/test";
import { fixtureWallet } from "./fixtures/wallets";

for (const version of [1, 0] as const) {
  test(`treasury wallet derives keys locally, then separately reviews and approves v${version}`, async ({
    page,
  }) => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicBytes = Uint8Array.from(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
    const treasury = address(getBase58Decoder().decode(publicBytes));
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
    let sent = false;
    await page.exposeFunction("signPrivacyFixture", (bytes: number[]) => {
      expect(Uint8Array.from(bytes)).toEqual(derivationMessage);
      return [...sign(null, Uint8Array.from(bytes), privateKey)];
    });
    await page.exposeFunction("sendPrivacyFixture", (bytes: number[]) => {
      expect(prepared).toBe(true);
      expect(Buffer.from(bytes).toString("base64")).toBe(transaction);
      sent = true;
      return Array(64).fill(18);
    });
    await page.addInitScript(
      ({ treasury, publicBytes, version }) => {
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
          name: "Treasury fixture",
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
      { treasury, publicBytes: [...publicBytes], version },
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
      const status = { cluster: "mainnet", treasury, registered: sent, canPrepare: !sent };
      if (route.request().method() === "GET") return route.fulfill({ json: status });
      expect(route.request().postDataJSON()).toEqual({
        treasury,
        version,
        nullifierPublicKey: Buffer.from(nullifierPublicKey).toString("base64"),
        viewingPublicKey: Buffer.from(viewingPublicKey).toString("base64"),
      });
      prepared = true;
      return route.fulfill({
        json: { ...status, version, transaction, feeLamports: "5000", rentLamports: "1158240" },
      });
    });

    await page.goto("/console/admin/privacy-rings");
    await expect(page.getByRole("button", { name: "Approve registration in wallet" })).toHaveCount(0);
    await page.getByRole("button", { name: "Connect Treasury fixture" }).click();
    await page.getByRole("button", { name: "Prepare registration" }).click();
    await expect(page.getByRole("heading", { name: "Review registration" })).toBeFocused();
    await expect(page.getByText("0.000005 SOL", { exact: true })).toBeVisible();
    await expect(page.getByText("0.00115824 SOL", { exact: true })).toBeVisible();
    expect(prepared).toBe(true);
    expect(sent).toBe(false);
    await page.getByRole("button", { name: "Approve registration in wallet" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Treasury registration finalized." }),
    ).toBeVisible();
    expect(sent).toBe(true);
  });
}
