import { generateKeyPairSync, sign } from "node:crypto";
import { address, getOffchainMessageEncoder } from "@solana/kit";
import { createSignInMessageText } from "@solana/wallet-standard-util";
import { expect, test } from "@playwright/test";
import bs58 from "bs58";
import { verifyWalletSignIn } from "../lib/solana-sign-in";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const wallet = address(bs58.encode(publicKey.export({ format: "der", type: "spki" }).subarray(-32)));
const input = {
  address: wallet,
  domain: "sonnely.com",
  uri: "https://sonnely.com",
  version: "1",
  nonce: "testNonce123",
};

test("sign-in verifies the exact off-chain challenge and its sole required signer", async () => {
  const format = { kind: "offchainMessage", messageVersion: 1 } as const;
  const content = createSignInMessageText(input);
  const encode = (text: string, signers = [wallet]) =>
    Uint8Array.from(getOffchainMessageEncoder().encode({
      version: 1,
      content: text,
      requiredSignatories: signers.map((address) => ({ address })),
    }));
  const message = encode(content);
  const signature = sign(null, message, privateKey);
  await expect(verifyWalletSignIn(input, signature, message, format)).resolves.toBe(true);
  await expect(verifyWalletSignIn({ ...input, nonce: "otherNonce456" }, signature, message, format)).resolves.toBe(false);
  await expect(verifyWalletSignIn(input, signature, message)).resolves.toBe(false);
  await expect(verifyWalletSignIn(input, signature, undefined, format)).resolves.toBe(false);
  await expect(verifyWalletSignIn(input, signature, message.slice(0, 12), format)).resolves.toBe(false);
  await expect(verifyWalletSignIn(input, new Uint8Array(64), message, format)).resolves.toBe(false);
  const extraSigner = encode(content, [wallet, address("11111111111111111111111111111111")]);
  await expect(verifyWalletSignIn(input, sign(null, extraSigner, privateKey), extraSigner, format)).resolves.toBe(false);
});

test("standard message signing verifies the canonical SiWS challenge", async () => {
  const message = new TextEncoder().encode(createSignInMessageText(input));
  const signature = sign(null, message, privateKey);
  await expect(verifyWalletSignIn(input, signature)).resolves.toBe(true);
  await expect(verifyWalletSignIn(input, signature, message)).resolves.toBe(true);
  await expect(verifyWalletSignIn({ ...input, domain: "example.com" }, signature)).resolves.toBe(false);
});
