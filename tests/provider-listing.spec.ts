import { generateKeyPair, getAddressFromPublicKey, signBytes } from "@solana/kit";
import { expect, test } from "@playwright/test";
import bs58 from "bs58";
import { providerListingMessage, verifyProviderListing, type ProviderListing } from "../lib/provider-listing";

test("independent operators can sign the same model artifact with separate prices and endpoints", async () => {
  const now = 1_800_000_000;
  const key = await generateKeyPair();
  const otherKey = await generateKeyPair();
  const listing = {
    version: 1,
    network: "devnet",
    operator_wallet: await getAddressFromPublicKey(key.publicKey),
    model_id: "example/model",
    artifact_sha256: "9".repeat(64),
    endpoint: "https://one.example/v1/chat/completions",
    input_nanousd_per_token: 100,
    cached_input_nanousd_per_token: 20,
    output_nanousd_per_token: 300,
    revision: 1,
    expires_at: now + 60,
    status: "active",
  } as const satisfies ProviderListing;
  const payload = providerListingMessage(listing);
  const fields = [
    1,
    "devnet",
    listing.operator_wallet,
    "example/model",
    "9".repeat(64),
    "https://one.example/v1/chat/completions",
    100,
    20,
    300,
    1,
    now + 60,
    "active",
  ];
  expect(new TextDecoder().decode(payload)).toBe(
    "Sonnely Inference Provider Listing\n" + JSON.stringify(fields),
  );
  const signed = { listing, signature: bs58.encode(await signBytes(key.privateKey, payload)) };
  expect(await verifyProviderListing(signed, "devnet", now)).toEqual(listing);

  const otherListing = {
    ...listing,
    operator_wallet: await getAddressFromPublicKey(otherKey.publicKey),
    endpoint: "https://two.example/v1/chat/completions",
    output_nanousd_per_token: 240,
  };
  const otherSigned = {
    listing: otherListing,
    signature: bs58.encode(await signBytes(otherKey.privateKey, providerListingMessage(otherListing))),
  };
  expect(await verifyProviderListing(otherSigned, "devnet", now)).toEqual(otherListing);

  const revoked = { ...listing, revision: 2, status: "revoked" } as const;
  const revocation = {
    listing: revoked,
    signature: bs58.encode(await signBytes(key.privateKey, providerListingMessage(revoked))),
  };
  expect(await verifyProviderListing(revocation, "devnet", now)).toEqual(revoked);

  expect(await verifyProviderListing({ ...signed, listing: otherListing }, "devnet", now)).toBeNull();
  expect(await verifyProviderListing({ ...signed, listing: revoked }, "devnet", now)).toBeNull();
  expect(await verifyProviderListing(signed, "mainnet-beta", now)).toBeNull();
  expect(await verifyProviderListing(signed, "devnet", listing.expires_at)).toBeNull();
  for (const changes of [
    { endpoint: "http://one.example/" },
    { endpoint: "https://user:password@one.example/" },
    { endpoint: "https://one.example/?key=secret" },
    { input_nanousd_per_token: -10 },
    { artifact_sha256: "different" },
  ]) {
    expect(
      await verifyProviderListing({ ...signed, listing: { ...listing, ...changes } }, "devnet", now),
    ).toBeNull();
  }
});
