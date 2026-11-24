"use client";

import {
  AccountRole,
  address,
  bytesEqual,
  createClient,
  decompileTransactionMessage,
  getBase58Decoder,
  getBase64Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  isAddress,
  isTransactionSendingSigner,
  type Transaction,
} from "@solana/kit";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { useConnectedWallet, useWallets } from "@solana/kit-plugin-wallet/react";
import { SolanaSignAndSendTransaction, SolanaSignMessage } from "@solana/wallet-standard-features";
import type { Bytes32, Bytes33 } from "@heliuslabs/spr/keypair";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { solDecimal } from "@/lib/sol-quote";
import { Pill, Skeleton } from "./admin/ui";
import { CopyButton } from "./shared";
import { request } from "./wallet";

const route = "admin-privacy-rings";
const chain = "solana:mainnet";
const client = createClient().use(
  walletSigner({
    chain,
    storage: null,
    filter: (wallet) =>
      wallet.features.includes(SolanaSignMessage) && wallet.features.includes(SolanaSignAndSendTransaction),
  }),
);

const statusSchema = z.object({
  cluster: z.literal("mainnet"),
  treasury: z.string().refine(isAddress),
  registered: z.boolean(),
  canPrepare: z.boolean(),
});
const lamports = z.string().regex(/^\d{1,15}$/);
const preparationSchema = statusSchema.pick({ cluster: true, treasury: true }).extend({
  version: z.union([z.literal(0), z.literal(1)]),
  transaction: z.string().min(1).max(5500),
  feeLamports: lamports,
  rentLamports: lamports,
});
type RegistryStatus = z.infer<typeof statusSchema>;
type Registration = Omit<z.infer<typeof preparationSchema>, "transaction"> & { transaction: Transaction };
type WalletOption = ReturnType<typeof useWallets>[number];

async function readRegistrationStatus() {
  return statusSchema.parse(await request<unknown>(route));
}

function registrationVersion(versions?: ReadonlySet<unknown>) {
  if (versions?.has(1)) return 1;
  if (versions?.has(0)) return 0;
}

function requireTreasuryWallet(treasury: string) {
  const { connected } = client.wallet.getState();
  const version = registrationVersion(connected?.supportedTransactionVersions);
  if (
    !connected ||
    connected.account.address !== treasury ||
    !connected.account.chains.includes(chain) ||
    !connected.account.features.includes(SolanaSignMessage) ||
    version === undefined ||
    !connected.signer ||
    !isTransactionSendingSigner(connected.signer)
  ) {
    throw new Error(
      "Connect the treasury account with a wallet that supports mainnet message signing and v0 or v1 transactions.",
    );
  }
  return { account: connected.account, signer: connected.signer, version };
}

async function prepareRegistration(treasury: string): Promise<Registration> {
  const { account, version } = requireTreasuryWallet(treasury);
  const [
    { bytes32, ed25519DerivationMessage, initializePoseidon },
    { LocalShieldedKeys },
    { getRegisterInstructionAsync },
  ] = await Promise.all([
    import("@heliuslabs/spr/keypair"),
    import("@heliuslabs/spr/transaction"),
    import("@heliuslabs/spr/instructions"),
  ]);
  await initializePoseidon();
  if (requireTreasuryWallet(treasury).account !== account)
    throw new Error("The connected treasury wallet changed.");

  const signed = await client.wallet.signMessage(
    ed25519DerivationMessage(bytes32(Uint8Array.from(account.publicKey))),
  );
  const seed = Uint8Array.from(signed);
  if (signed instanceof Uint8Array) signed.fill(0);
  const owner = address(treasury);
  let publicKeys: { nullifierPublicKey: Bytes32; viewingPublicKey: Bytes33 };
  try {
    const keys = LocalShieldedKeys.fromDerivationSeed({ solanaPublicKey: owner, derivationSeed: seed });
    try {
      const identity = keys.address();
      publicKeys = {
        nullifierPublicKey: identity.nullifierPublicKey,
        viewingPublicKey: identity.viewingPublicKey.toBytes(),
      };
    } finally {
      keys.destroy();
    }
  } catch {
    throw new Error("The wallet must sign the Privacy Rings setup message exactly. Try a compatible wallet.");
  } finally {
    seed.fill(0);
  }
  if (requireTreasuryWallet(treasury).account !== account)
    throw new Error("The connected treasury wallet changed.");

  const base64 = getBase64Decoder();
  const result = preparationSchema.parse(
    await request<unknown>(route, {
      treasury,
      version,
      nullifierPublicKey: base64.decode(publicKeys.nullifierPublicKey),
      viewingPublicKey: base64.decode(publicKeys.viewingPublicKey),
    }),
  );
  const wire = getBase64Encoder().encode(result.transaction);
  const transaction = getTransactionDecoder().decode(wire);
  const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  const expected = await getRegisterInstructionAsync({ ...publicKeys, owner, payer: owner });
  const message = decompileTransactionMessage(compiled);
  const [instruction] = message.instructions;
  const expectedAccounts = expected.accounts ?? [];
  if (
    result.treasury !== treasury ||
    result.version !== version ||
    wire.length > (version === 1 ? 4096 : 1232) ||
    compiled.version !== version ||
    compiled.header.numSignerAccounts !== 1 ||
    compiled.staticAccounts[0] !== treasury ||
    Object.keys(transaction.signatures).length !== 1 ||
    transaction.signatures[owner] !== null ||
    message.instructions.length !== 1 ||
    (message.version === 1 && Boolean(message.config?.priorityFeeLamports)) ||
    instruction?.programAddress !== expected.programAddress ||
    !instruction.data ||
    !expected.data ||
    !bytesEqual(instruction.data, expected.data) ||
    instruction.accounts?.length !== expectedAccounts.length ||
    !instruction.accounts?.every(
      (meta, index) =>
        meta.address === expectedAccounts[index].address &&
        meta.role ===
          (meta.address === treasury ? AccountRole.WRITABLE_SIGNER : expectedAccounts[index].role),
    )
  ) {
    throw new Error("The simulated transaction does not match this treasury’s Privacy Rings registration.");
  }
  return { ...result, transaction };
}

export function AdminPrivacyRings() {
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const [status, setStatus] = useState<RegistryStatus>();
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<Registration>();
  const [signature, setSignature] = useState("");
  const [pending, setPending] = useState<"connect" | "prepare" | "approve">();
  const [error, setError] = useState("");
  const review = useRef<HTMLHeadingElement>(null);
  const treasuryConnected = Boolean(
    status && connected?.account.address === status.treasury && connected.account.chains.includes(chain),
  );
  const canSign =
    treasuryConnected &&
    connected?.account.features.includes(SolanaSignMessage) &&
    registrationVersion(connected.supportedTransactionVersions) !== undefined &&
    connected.signer &&
    isTransactionSendingSigner(connected.signer);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    async function load() {
      try {
        const result = await readRegistrationStatus();
        if (!active) return;
        setStatus(result);
        setError("");
        if (signature && !result.registered && attempts++ < 18) timer = setTimeout(load, 5_000);
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : "Registration status is unavailable.");
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [revision, signature]);

  useEffect(() => {
    if (draft) review.current?.focus();
  }, [draft]);

  async function run(action: NonNullable<typeof pending>, task: () => Promise<void>) {
    setError("");
    setPending(action);
    try {
      await task();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The wallet action failed.");
    } finally {
      setPending(undefined);
    }
  }

  async function connectTreasury(wallet: WalletOption, treasury: string) {
    setDraft(undefined);
    const accounts = await client.wallet.connect(wallet);
    const account = accounts.find(
      (candidate) => candidate.address === treasury && candidate.chains.includes(chain),
    );
    if (!account) throw new Error("Select the configured treasury account in your wallet.");
    client.wallet.selectAccount(account);
    requireTreasuryWallet(treasury);
  }

  async function approveRegistration(registration: Registration) {
    const { signer, version } = requireTreasuryWallet(registration.treasury);
    const latest = await readRegistrationStatus();
    setStatus(latest);
    if (latest.registered) return;
    if (
      !latest.canPrepare ||
      latest.treasury !== registration.treasury ||
      version !== registration.version ||
      requireTreasuryWallet(registration.treasury).signer !== signer
    )
      throw new Error("The treasury or registration status changed. Refresh and prepare a new registration.");
    const [output] = await signer.signAndSendTransactions([registration.transaction]);
    if (output?.length !== 64)
      throw new Error(
        "The wallet returned no transaction signature. Check registration status before trying again.",
      );
    setSignature(getBase58Decoder().decode(output));
    setDraft(undefined);
  }

  return (
    <section className="panel stack-panel" aria-labelledby="privacy-rings-heading">
      <div className="between">
        <div>
          <h2 id="privacy-rings-heading">Privacy Rings</h2>
          <p className="caption">Register the treasury for confidential transfers on Solana.</p>
        </div>
        <button
          className="button quiet small"
          type="button"
          disabled={Boolean(pending)}
          onClick={() => setRevision((current) => current + 1)}
        >
          Refresh registration status
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!status && !error && <Skeleton rows={3} />}
      {status && (
        <>
          <dl className="admin-metrics">
            <div>
              <dt>Network</dt>
              <dd>Solana mainnet</dd>
            </div>
            <div>
              <dt>Treasury registration</dt>
              <dd>
                <Pill tone={status.registered ? "ok" : "warn"}>
                  {status.registered ? "Registered" : "Not registered"}
                </Pill>
              </dd>
            </div>
          </dl>
          <div className="cell-copy">
            <code style={{ overflowWrap: "anywhere" }}>{status.treasury}</code>
            <CopyButton label="Copy treasury address" value={status.treasury} />
          </div>
          {signature && (
            <p className="status" role="status">
              {status.registered
                ? "Treasury registration finalized. "
                : "Registration submitted. Waiting for Solana finality. "}
              <a
                className="text-link"
                href={`https://explorer.solana.com/tx/${signature}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction on Solana Explorer ↗
              </a>
            </p>
          )}
          {status.canPrepare && !status.registered && !signature && (
            <div className="stack-panel">
              {treasuryConnected ? (
                <p className="status" role="status">
                  Treasury wallet connected.
                </p>
              ) : (
                <>
                  <h3>Connect treasury wallet</h3>
                  <p className="caption">
                    Select the configured treasury account. Your administrator session stays active.
                  </p>
                  {wallets.length ? (
                    <div className="actions">
                      {wallets.map((wallet) => (
                        <button
                          key={wallet.name}
                          className="button quiet"
                          type="button"
                          disabled={Boolean(pending)}
                          onClick={() => void run("connect", () => connectTreasury(wallet, status.treasury))}
                        >
                          Connect {wallet.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="caption">
                      Open a Solana wallet with message signing and v0 or v1 transaction support.
                    </p>
                  )}
                </>
              )}
              {canSign && !draft && (
                <>
                  <p className="caption">
                    Approve the setup message only on your Sonnely Admin site. Your browser uses the signature
                    locally to derive public registration keys. The transaction and fees are reviewed
                    separately.
                  </p>
                  <div className="actions">
                    <button
                      className="button accent"
                      type="button"
                      disabled={Boolean(pending)}
                      onClick={() =>
                        void run("prepare", async () => setDraft(await prepareRegistration(status.treasury)))
                      }
                    >
                      {pending === "prepare" ? "Preparing registration…" : "Prepare registration"}
                    </button>
                  </div>
                </>
              )}
              {canSign && draft && draft.treasury === status.treasury && (
                <section className="checkout" aria-labelledby="registration-review-heading">
                  <h3 id="registration-review-heading" ref={review} tabIndex={-1}>
                    Review registration
                  </h3>
                  <p className="caption">
                    Create the Privacy Rings registry record with the treasury as the fee payer on Solana
                    mainnet.
                  </p>
                  <dl className="admin-metrics">
                    <div>
                      <dt>Network fee</dt>
                      <dd>{solDecimal(Number(draft.feeLamports))} SOL</dd>
                    </div>
                    <div>
                      <dt>Account rent</dt>
                      <dd>{solDecimal(Number(draft.rentLamports))} SOL</dd>
                    </div>
                  </dl>
                  <div className="actions">
                    <button
                      className="button accent"
                      type="button"
                      disabled={Boolean(pending)}
                      onClick={() => void run("approve", () => approveRegistration(draft))}
                    >
                      {pending === "approve" ? "Waiting for wallet…" : "Approve registration in wallet"}
                    </button>
                    <button
                      className="button quiet"
                      type="button"
                      disabled={Boolean(pending)}
                      onClick={() => setDraft(undefined)}
                    >
                      Discard preparation
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
