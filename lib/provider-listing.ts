import { address, getPublicKeyFromAddress, signatureBytes, verifySignature } from "@solana/kit";
import bs58 from "bs58";
import { z } from "zod";

const wallet = z
  .string()
  .min(32)
  .max(44)
  .refine((value) => {
    try {
      address(value);
      return true;
    } catch {
      return false;
    }
  });

const httpsUrl = z
  .string()
  .max(1024)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.href === value &&
        !url.username &&
        !url.password &&
        !/[?#]/.test(value)
      );
    } catch {
      return false;
    }
  });

const listingSchema = z.strictObject({
  version: z.literal(1),
  network: z.enum(["devnet", "mainnet-beta"]),
  operator_wallet: wallet,
  model_id: z.string().regex(/^[a-zA-Z0-9._/-]{1,128}$/),
  artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  endpoint: httpsUrl,
  input_nanousd_per_token: z.int().nonnegative(),
  cached_input_nanousd_per_token: z.int().nonnegative(),
  output_nanousd_per_token: z.int().nonnegative(),
  revision: z.int().positive(),
  expires_at: z.int().positive(),
  status: z.enum(["active", "revoked"]),
});
const envelope = z.strictObject({
  listing: listingSchema,
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/),
});

export type ProviderListing = z.infer<typeof listingSchema>;

export function providerListingMessage(input: ProviderListing) {
  const listing = listingSchema.parse(input);
  // Use a fixed field order so a publisher and indexer can reproduce the same bytes.
  const fields = [
    listing.version,
    listing.network,
    listing.operator_wallet,
    listing.model_id,
    listing.artifact_sha256,
    listing.endpoint,
    listing.input_nanousd_per_token,
    listing.cached_input_nanousd_per_token,
    listing.output_nanousd_per_token,
    listing.revision,
    listing.expires_at,
    listing.status,
  ];
  return new TextEncoder().encode("Sonnely Inference Provider Listing\n" + JSON.stringify(fields));
}

export async function verifyProviderListing(
  input: unknown,
  network: ProviderListing["network"],
  now = Math.floor(Date.now() / 1_000),
) {
  const parsed = envelope.safeParse(input);
  if (!parsed.success) return null;
  const { listing, signature } = parsed.data;
  if (listing.network !== network || listing.expires_at <= now) return null;

  try {
    const key = await getPublicKeyFromAddress(address(listing.operator_wallet));
    const verified = await verifySignature(
      key,
      signatureBytes(bs58.decode(signature)),
      providerListingMessage(listing),
    );
    return verified ? listing : null;
  } catch {
    return null;
  }
}
