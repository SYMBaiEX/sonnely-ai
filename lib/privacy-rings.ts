import type { ShieldedAddress } from "@heliuslabs/spr/keypair";
import {
  address,
  compileTransaction,
  createSolanaRpc,
  decompileTransactionMessage,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  type Address,
  type Transaction,
  type TransactionMessageBytesBase64,
} from "@solana/kit";
import { z } from "zod";
import { address as addressSchema, billing, verifyCluster } from "./payments";
import { paymentTransactionVersion, type PaymentTransactionVersion } from "./payment-transaction";
import { SonnelyError } from "./sonnely-error";

const cluster = "mainnet";
const rpcTimeout = 10_000;
const publicKeyBytes = (length: number) =>
  z
    .base64()
    .length(44)
    .transform((value, context) => {
      const bytes = Buffer.from(value, "base64");
      if (bytes.length !== length || bytes.toString("base64") !== value || !bytes.some(Boolean)) {
        context.addIssue({ code: "custom", message: "Enter a valid Privacy Rings public key." });
        return z.NEVER;
      }
      return Uint8Array.from(bytes);
    });

const publicRegistration = z.strictObject({
  treasury: addressSchema,
  nullifierPublicKey: publicKeyBytes(32),
  viewingPublicKey: publicKeyBytes(33),
  version: paymentTransactionVersion.default(1),
});
const registryAccount = z.object({
  owner: addressSchema,
  lamports: z.bigint().nonnegative(),
  executable: z.literal(false),
  data: z.tuple([z.base64(), z.literal("base64")]),
});

function readRegistryAccount(value: unknown) {
  const account = registryAccount.parse(value);
  return {
    owner: address(account.owner),
    lamports: account.lamports,
    data: Buffer.from(account.data[0], "base64"),
  };
}

async function mainnetTreasury() {
  const config = billing();
  if (!config.rpc || !config.recipient || config.cluster !== cluster)
    throw new SonnelyError("Mainnet treasury configuration is unavailable.", 503);
  await verifyCluster(config.rpc, cluster);
  return { rpc: createSolanaRpc(config.rpc), treasury: address(config.recipient) };
}

type TreasuryRpc = Awaited<ReturnType<typeof mainnetTreasury>>["rpc"];

function registrationClient(rpc: TreasuryRpc, commitment: "finalized" | "confirmed") {
  return {
    async getAccount(account: Address) {
      const { value } = await rpc
        .getAccountInfo(account, { encoding: "base64", commitment })
        .send({ abortSignal: AbortSignal.timeout(rpcTimeout) });
      return value === null ? undefined : readRegistryAccount(value);
    },
    async getLatestBlockhash() {
      const { value } = await rpc
        .getLatestBlockhash({ commitment })
        .send({ abortSignal: AbortSignal.timeout(rpcTimeout) });
      return value;
    },
  };
}

export async function treasuryPrivacyRingsStatus() {
  const { rpc, treasury } = await mainnetTreasury();
  try {
    const [{ isWalletRegistered }, { getUserRecordAddress }] = await Promise.all([
      import("@heliuslabs/spr/wallet"),
      import("@heliuslabs/spr/addresses"),
    ]);
    const registered = await isWalletRegistered({
      rpc: registrationClient(rpc, "finalized"),
      owner: treasury,
    });
    return {
      cluster,
      treasury,
      registered,
      canPrepare: !registered,
      ...(registered ? { registryAddress: await getUserRecordAddress(treasury) } : {}),
    };
  } catch {
    throw new SonnelyError("The Privacy Rings treasury registry could not be verified.", 503);
  }
}

function registrationForVersion(draft: Transaction, version: PaymentTransactionVersion) {
  const compiled = getCompiledTransactionMessageDecoder().decode(draft.messageBytes);
  if (compiled.version !== 1)
    throw new SonnelyError("The Privacy Rings SDK returned an unexpected registration.", 503);
  if (version === 1) return draft;
  // The single registry instruction also fits version 0 for wallets that have yet to support version 1.
  const { feePayer, instructions, lifetimeConstraint } = decompileTransactionMessage(compiled);
  return compileTransaction({ version, feePayer, instructions, lifetimeConstraint });
}

export async function prepareTreasuryPrivacyRingsRegistration(raw: unknown) {
  const keys = publicRegistration.parse(raw);
  const { rpc, treasury } = await mainnetTreasury();
  if (keys.treasury !== treasury) throw new SonnelyError("Connect the configured treasury wallet.", 403);

  const [
    { bytes32, bytes33, ShieldedAddress, ShieldedPublicKey, X25519PublicKey },
    { buildRegistrationTransaction, decodeUserRecordAccount, WalletError },
    { getUserRecordAddress },
  ] = await Promise.all([
    import("@heliuslabs/spr/keypair"),
    import("@heliuslabs/spr/wallet"),
    import("@heliuslabs/spr/addresses"),
  ]);
  let identity: ShieldedAddress;
  try {
    identity = ShieldedAddress.fromPublicKeys(
      ShieldedPublicKey.fromEd25519(bytes32(Uint8Array.from(getAddressEncoder().encode(treasury)))),
      bytes32(keys.nullifierPublicKey),
      X25519PublicKey.fromBytes(bytes33(keys.viewingPublicKey)),
    );
  } catch {
    throw new SonnelyError("The treasury wallet returned invalid Privacy Rings public keys.");
  }

  const commitment = "confirmed";
  try {
    const built = await buildRegistrationTransaction({
      client: registrationClient(rpc, commitment),
      owner: treasury,
      payer: treasury,
      address: identity,
    });
    if (!built) throw new SonnelyError("The treasury is already registered with Privacy Rings.", 409);
    const draft = registrationForVersion(built, keys.version);
    const transaction = getBase64EncodedWireTransaction(draft);
    const recordAddress = await getUserRecordAddress(treasury);
    const message = Buffer.from(draft.messageBytes).toString("base64") as TransactionMessageBytesBase64;
    const [fee, simulation] = await Promise.all([
      rpc.getFeeForMessage(message, { commitment }).send({ abortSignal: AbortSignal.timeout(rpcTimeout) }),
      rpc
        .simulateTransaction(transaction, {
          commitment,
          encoding: "base64",
          sigVerify: false,
          replaceRecentBlockhash: false,
          accounts: { addresses: [recordAddress], encoding: "base64" },
        })
        .send({ abortSignal: AbortSignal.timeout(rpcTimeout) }),
    ]);
    if (simulation.value.err !== null) {
      throw new SonnelyError(
        "Registration did not pass simulation. Check the treasury’s SOL balance for the network fee and account rent.",
        409,
      );
    }
    const record = readRegistryAccount(simulation.value.accounts?.[0]);
    if (record.lamports <= 0n || typeof fee.value !== "bigint" || fee.value < 0n)
      throw new SonnelyError("Solana RPC could not verify the registration fee and rent.", 503);
    const decoded = decodeUserRecordAccount(record);
    if (
      decoded.owner !== treasury ||
      !Buffer.from(decoded.nullifierPublicKey).equals(keys.nullifierPublicKey) ||
      !Buffer.from(decoded.viewingPublicKey).equals(keys.viewingPublicKey)
    )
      throw new SonnelyError("Solana RPC returned an unexpected Privacy Rings registration.", 503);
    return {
      cluster,
      treasury,
      version: keys.version,
      transaction,
      feeLamports: fee.value.toString(),
      rentLamports: record.lamports.toString(),
    };
  } catch (error) {
    if (error instanceof SonnelyError) throw error;
    if (error instanceof WalletError && error.code === "WALLET_USER_RECORD_KEYS_MISMATCH")
      throw new SonnelyError("The treasury is already registered with Privacy Rings.", 409);
    throw new SonnelyError("The unsigned Privacy Rings registration could not be prepared.", 503);
  }
}
