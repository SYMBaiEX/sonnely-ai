import {
  address,
  assertOffchainMessageV1Equal,
  getOffchainMessageDecoder,
  getPublicKeyFromAddress,
  verifySignature,
  type SignatureBytes,
} from "@solana/kit";
import type { SolanaSignInInput } from "@solana/wallet-standard-features";
import { createSignInMessageText, verifySignIn } from "@solana/wallet-standard-util";
import bs58 from "bs58";
import { createHash, randomBytes } from "node:crypto";

export type SignInMessageInput = SolanaSignInInput & { address: string; domain: string };
export type OffchainSignInFormat = { kind: "offchainMessage"; messageVersion: 1 };

/** @throws {never} */
export function validWallet(wallet: unknown): wallet is string {
  if (typeof wallet !== "string" || wallet.length < 32 || wallet.length > 44) return false;
  try {
    return bs58.decode(wallet).length === 32;
  } catch {
    return false;
  }
}

/** @throws {never} */
export function newNonce() {
  return randomBytes(20).toString("hex");
}

/** @throws {never} */
export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

/** @throws {never} */
export function sessionDigest(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

/** @throws {never} */
export function signInMessage(input: SignInMessageInput) {
  return createSignInMessageText(input);
}

function bytes(input: unknown): Uint8Array | undefined {
  if (!Array.isArray(input) || input.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return undefined;
  return Uint8Array.from(input as number[]);
}

function offchainFormat(input: unknown): OffchainSignInFormat | undefined {
  const format = input as OffchainSignInFormat | undefined;
  return format?.kind === "offchainMessage" && format.messageVersion === 1 ? format : undefined;
}

/** Verify a Solana wallet signature over exactly the message text this challenge produced. */
export async function verifyWalletSignIn(
  input: SignInMessageInput,
  signatureInput: unknown,
  signedMessageInput?: unknown,
  signedMessageFormatInput?: unknown,
) {
  const signature = bytes(signatureInput);
  if (!signature || signature.length !== 64) return false;
  const signedMessage = bytes(signedMessageInput);
  const signedMessageFormat = offchainFormat(signedMessageFormatInput);
  const expectedMessage = createSignInMessageText(input);
  if (!signedMessageFormat) {
    return verifySignIn(input, {
      account: { address: input.address, publicKey: bs58.decode(input.address), chains: [], features: [] },
      signedMessage: signedMessage ?? new TextEncoder().encode(expectedMessage),
      signature,
    });
  }
  if (!signedMessage || signedMessage.length === 0 || signedMessage.length > 2048) return false;
  try {
    const signer = address(input.address);
    const message = getOffchainMessageDecoder().decode(signedMessage);
    if (message.version !== 1) return false;
    assertOffchainMessageV1Equal(message, {
      version: 1,
      requiredSignatories: [{ address: signer }],
      content: expectedMessage,
    });
    return await verifySignature(await getPublicKeyFromAddress(signer), signature as SignatureBytes, signedMessage);
  } catch {
    return false;
  }
}
