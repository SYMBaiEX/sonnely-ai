"use client";

import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  bytesEqual,
  compileTransaction,
  decompileTransactionMessage,
  getBase64Decoder,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getPublicKeyFromAddress,
  getTransactionDecoder,
  getTransactionSize,
  isAddress,
  isTransactionModifyingSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  verifySignature,
  type Transaction,
} from "@solana/kit";
import { SolanaSignMessage, SolanaSignTransaction } from "@solana/wallet-standard-features";
import type { WalletKeys } from "@heliuslabs/spr/wallet";
import { z } from "zod";
import { confidentialPilotAmount, type ConfidentialPilotOrder } from "@/lib/confidential-pilot-types";
import { solanaWalletClients } from "./solana-wallet";
import { request } from "./wallet";

const client = solanaWalletClients.mainnet;
const mainnetChain = "solana:mainnet";
const mainnetUsdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const memoProgram = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const heliusRpc = "https://mainnet.helius-rpc.com";
const sprEndpoint = heliusRpc + "/v1/spr";
const policyEndpoint = "https://d3gbdb0egjwcw9.cloudfront.net/tee-policy/mainnet.json";
const allowedHeaders = new Set([
  "accept",
  "content-type",
  "x-sync",
  "x-async",
  "spr-tee",
  "spr-tee-enc",
  "spr-tee-ciphertext",
]);
const indexerPath =
  /^\/v1\/spr\/(getEncryptedUtxosByTags|getShieldedTransactionsByTags|getShieldedTransactionsByNullifiers|getUserRecords)$/;
const proverPath = /^\/v1\/spr\/(attestation|prove\/transfer_confidential_\d+_\d+\/(indexed|status))$/;
const lamports = z
  .string()
  .regex(/^\d{1,15}$/)
  .refine((value) => Number(value) <= 20_000);
const quote = z
  .object({
    feeLamports: lamports,
    payerDebitLamports: lamports,
    approval: z.string().min(1).max(4096),
  })
  .refine((value) => Number(value.payerDebitLamports) >= Number(value.feeLamports));

export type ConfidentialPilotDraft = z.infer<typeof quote> & { transaction: string };

export function confidentialPilotWalletIssue(payer: string, connected = client.wallet.getState().connected) {
  if (connected?.account.address !== payer || !connected.account.chains.includes(mainnetChain))
    return "Connect the Solana mainnet wallet you used to sign in.";
  if (/^Phantom\b/i.test(connected.wallet.name))
    return "Phantom blocks the required Privacy Rings setup message. Connect the same account using a compatible wallet.";
  if (!connected.account.features.includes(SolanaSignMessage))
    return "This wallet does not support the message signing needed to open its private balance.";
  if (
    !connected.supportedTransactionVersions.has(1) ||
    !connected.account.features.includes(SolanaSignTransaction) ||
    !connected.signer ||
    !isTransactionModifyingSigner(connected.signer)
  )
    return "Choose a wallet that can sign Solana v1 transactions for Sonnely to submit.";
  return undefined;
}

function requireWallet(payer: string) {
  const { connected } = client.wallet.getState();
  const issue = confidentialPilotWalletIssue(payer, connected);
  if (issue || !connected?.signer || !isTransactionModifyingSigner(connected.signer))
    throw new Error(issue || "The connected wallet cannot sign the confidential payment.");
  return { account: connected.account, signer: connected.signer };
}

function requireOrder(order: ConfidentialPilotOrder) {
  if (
    order.cluster !== "mainnet" ||
    order.mint !== mainnetUsdc ||
    order.amount !== confidentialPilotAmount ||
    order.status !== "pending" ||
    order.submission ||
    order.signature ||
    order.payer === order.treasury ||
    !isAddress(order.payer) ||
    !isAddress(order.treasury) ||
    !isAddress(order.reference)
  )
    throw new Error("This confidential USDC order is unavailable.");
  return { payer: address(order.payer), treasury: address(order.treasury), mint: address(order.mint) };
}

function relay(reference: string, signal?: AbortSignal): typeof fetch {
  return async (input, init) => {
    if (input instanceof Request) throw new Error("Unexpected Privacy Rings request.");
    const url = new URL(input);
    const method = init?.method?.toUpperCase() ?? "GET";
    const service =
      url.href === policyEndpoint && method === "GET"
        ? "policy"
        : url.origin !== heliusRpc
          ? undefined
          : url.pathname === "/" && method === "POST"
            ? "rpc"
            : indexerPath.test(url.pathname) && method === "POST"
              ? "indexer"
              : proverPath.test(url.pathname)
                ? "prover"
                : undefined;
    if (!service || !["GET", "POST"].includes(method)) throw new Error("Unexpected Privacy Rings endpoint.");
    const headers = Object.fromEntries(
      [...new Headers(init?.headers)].filter(([name]) => allowedHeaders.has(name)),
    );
    if (headers["content-type"] === "application/json; charset=utf-8")
      headers["content-type"] = "application/json";
    const body = init?.body;
    if (body !== undefined && body !== null && typeof body !== "string" && !(body instanceof Uint8Array))
      throw new Error("Unexpected Privacy Rings request body.");
    // Browser-side signed TEE policy verification and HPKE remain inside the SDK.
    // Protect the witness from the relay by refusing any plaintext proving request.
    if (
      service === "prover" &&
      url.pathname.includes("/prove/") &&
      (!headers["spr-tee"] ||
        !headers["spr-tee-enc"] ||
        (method === "POST"
          ? headers["content-type"] !== "application/octet-stream"
          : !headers["spr-tee-ciphertext"]))
    )
      throw new Error("An attested Privacy Rings prover is required.");

    const requestSignal =
      signal && init?.signal ? AbortSignal.any([signal, init.signal]) : (signal ?? init?.signal);
    return fetch("/api/sonnely/confidential-pilot/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: requestSignal,
      body: JSON.stringify({
        reference,
        service,
        method,
        path: url.pathname,
        query: url.search,
        headers,
        body:
          body == null
            ? undefined
            : getBase64Decoder().decode(typeof body === "string" ? new TextEncoder().encode(body) : body),
      }),
    });
  };
}

function approvalMemo(reference: string) {
  return new TextEncoder().encode(`sonnely:privacy:pilot:v1:${reference}`);
}

function readUnsignedTransfer(transaction: Transaction, payer: string) {
  const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  if (
    compiled.version !== 1 ||
    compiled.staticAccounts[0] !== payer ||
    compiled.header.numSignerAccounts !== 1 ||
    Object.keys(transaction.signatures).length !== 1 ||
    transaction.signatures[address(payer)] !== null ||
    getTransactionSize(transaction) > 4096
  )
    throw new Error("The prepared confidential transaction does not match the connected wallet.");
  return decompileTransactionMessage(compiled);
}

export async function prepareConfidentialPilot(
  order: ConfidentialPilotOrder,
  signal?: AbortSignal,
): Promise<ConfidentialPilotDraft> {
  const { payer, treasury, mint } = requireOrder(order);
  const { account, signer } = requireWallet(payer);
  const [
    { createSprClient, Wallet },
    { SignedTeePolicy },
    { bytes32, ed25519DerivationMessage },
    { approveIntent, buildTransferTransaction, LocalKeys, resolveRegisteredAddress, syncWallet },
    { SHIELDED_POOL_PROGRAM_ID },
  ] = await Promise.all([
    import("@heliuslabs/spr"),
    import("@heliuslabs/spr/client"),
    import("@heliuslabs/spr/keypair"),
    import("@heliuslabs/spr/wallet"),
    import("@heliuslabs/spr/interface"),
  ]);
  signal?.throwIfAborted();
  const spr = await createSprClient({
    solanaRpcUrl: heliusRpc,
    indexerUrl: sprEndpoint,
    proverUrl: sprEndpoint,
    proverTee: SignedTeePolicy.forNetwork("mainnet"),
    commitment: "confirmed",
    fetch: relay(order.reference, signal),
  });
  const context = { signal };
  const [sender, recipient] = await Promise.all([
    resolveRegisteredAddress({ rpc: spr, owner: payer }, context),
    resolveRegisteredAddress({ rpc: spr, owner: treasury }, context),
    spr.attestProver(context),
  ]);
  if (!sender || !recipient)
    throw new Error("Both the sender and Sonnely treasury need Privacy Rings registration.");
  signal?.throwIfAborted();
  if (requireWallet(payer).account !== account) throw new Error("The connected wallet changed.");
  const authorization = await client.wallet
    .signMessage(ed25519DerivationMessage(bytes32(Uint8Array.from(account.publicKey))), {
      abortSignal: signal,
    })
    .catch(() => {
      throw new Error("The wallet could not sign the exact Privacy Rings setup message.");
    });
  const seed = Uint8Array.from(authorization);
  if (authorization instanceof Uint8Array) authorization.fill(0);
  const local = (() => {
    try {
      return LocalKeys.fromDerivationSeed({ solanaPublicKey: payer, derivationSeed: seed }, spr.proofService);
    } catch {
      throw new Error("This wallet cannot produce the exact Privacy Rings setup signature.");
    } finally {
      seed.fill(0);
    }
  })();

  let transferViewingKey: Uint8Array | undefined;
  try {
    const identity = local.address();
    if (!bytesEqual(identity.toBytes(), sender.address.toBytes()))
      throw new Error("This wallet’s setup key does not match its registered Privacy Rings address.");
    const wallet = new Wallet({ identity });
    await syncWallet({ client: spr, wallet, keys: local }, context);
    const amount = BigInt(order.amount);
    const usdcBalance = wallet.balances(true).find((balance) => balance.mint === mint)?.amount ?? 0n;
    if (usdcBalance < amount) throw new Error("Your private USDC balance must cover the 0.01 USDC payment.");

    const keys: WalletKeys & Pick<typeof local, "proveIndexed"> = {
      address: local.address.bind(local),
      viewingPublicKeys: local.viewingPublicKeys.bind(local),
      decrypt: local.decrypt.bind(local),
      derive: local.derive.bind(local),
      prove: local.prove.bind(local),
      proveMerge: local.proveMerge.bind(local),
      proveIndexed: local.proveIndexed.bind(local),
      async transactionKeys(requests) {
        const minted = await local.transactionKeys(requests);
        // Only the SDK's payment assembly can create this key. The separate
        // sync above uses local directly, so history keys are never captured.
        if (minted.length !== 1 || transferViewingKey) {
          minted.forEach((key) => key.destroy());
          throw new Error("Could not identify the viewing key for this transfer.");
        }
        transferViewingKey = minted[0].secretBytes();
        return minted;
      },
    };
    const built = await buildTransferTransaction(
      {
        client: spr,
        wallet,
        keys,
        feePayer: payer,
        recipient: recipient.address,
        asset: mint,
        amount,
        approve: async ({ solanaPublicKey, intent }) => {
          if (
            solanaPublicKey !== payer ||
            intent.kind !== "transfer" ||
            intent.asset !== mint ||
            intent.amount !== amount ||
            !bytesEqual(intent.recipient.toBytes(), recipient.address.toBytes())
          )
            throw new Error("The Privacy Rings transfer does not match this checkout.");
          return approveIntent(intent);
        },
      },
      context,
    );
    assertIsTransactionWithBlockhashLifetime(built);
    const message = readUnsignedTransfer(built, payer);
    if (
      message.instructions.length !== 1 ||
      message.instructions[0].programAddress !== SHIELDED_POOL_PROGRAM_ID ||
      !transferViewingKey
    )
      throw new Error("The private transfer does not match the expected Privacy Rings instruction.");
    const withMemo = compileTransaction(
      appendTransactionMessageInstructions(
        [{ programAddress: memoProgram, data: approvalMemo(order.reference) }],
        setTransactionMessageLifetimeUsingBlockhash(built.lifetimeConstraint, message),
      ),
    );
    readUnsignedTransfer(withMemo, payer);
    signal?.throwIfAborted();
    if (requireWallet(payer).signer !== signer) throw new Error("The connected wallet changed.");
    const transaction = getBase64EncodedWireTransaction(withMemo);
    const checked = quote.parse(
      await request<unknown>("confidential-pilot/simulate", {
        reference: order.reference,
        transaction,
        transactionViewingKey: getBase64Decoder().decode(transferViewingKey),
      }),
    );
    signal?.throwIfAborted();
    return { transaction, ...checked };
  } finally {
    transferViewingKey?.fill(0);
    local.destroy();
  }
}

export async function signConfidentialPilot(order: ConfidentialPilotOrder, draft: ConfidentialPilotDraft) {
  const { payer } = requireOrder(order);
  quote.parse(draft);
  const { signer } = requireWallet(payer);
  const prepared = getTransactionDecoder().decode(getBase64Encoder().encode(draft.transaction));
  const message = readUnsignedTransfer(prepared, payer);
  const { SHIELDED_POOL_PROGRAM_ID } = await import("@heliuslabs/spr/interface");
  const [transfer, memo] = message.instructions;
  if (
    message.instructions.length !== 2 ||
    transfer.programAddress !== SHIELDED_POOL_PROGRAM_ID ||
    memo.programAddress !== memoProgram ||
    memo.accounts?.length ||
    !memo.data ||
    !bytesEqual(memo.data, approvalMemo(order.reference)) ||
    requireWallet(payer).signer !== signer
  )
    throw new Error("The simulated transaction no longer matches this payment.");
  const [signed] = await signer.modifyAndSignTransactions([prepared]);
  const signature = signed?.signatures[payer];
  if (
    !signed ||
    !signature ||
    Object.keys(signed.signatures).length !== 1 ||
    !bytesEqual(signed.messageBytes, prepared.messageBytes) ||
    !(await verifySignature(await getPublicKeyFromAddress(payer), signature, prepared.messageBytes))
  )
    throw new Error("The wallet changed the simulated transaction or returned an invalid signature.");
  return getBase64EncodedWireTransaction(signed);
}
