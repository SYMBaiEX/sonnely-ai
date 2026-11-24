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
import { z } from "zod";

export const offchainSignInFormat = z.object({
  kind: z.literal("offchainMessage"),
  messageVersion: z.literal(1),
});

export async function verifyWalletSignIn(
  input: SolanaSignInInput & { address: string; domain: string },
  signature: Uint8Array,
  signedMessage?: Uint8Array,
  signedMessageFormat?: z.infer<typeof offchainSignInFormat>,
) {
  const expectedMessage = createSignInMessageText(input);
  if (!signedMessageFormat) {
    return verifySignIn(input, {
      account: { address: input.address, publicKey: bs58.decode(input.address), chains: [], features: [] },
      signedMessage: signedMessage ?? new TextEncoder().encode(expectedMessage),
      signature,
    });
  }
  if (!signedMessage) return false;
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
