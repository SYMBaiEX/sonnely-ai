"use client";

import { createClient } from "@solana/kit";
import { walletSigner } from "@solana/kit-plugin-wallet";
import {
  SolanaSignAndSendTransaction,
  SolanaSignIn,
  SolanaSignMessage,
  SolanaSignOffchainMessage,
} from "@solana/wallet-standard-features";

export function canAuthenticateWallet(wallet: { features: readonly string[] }) {
  return wallet.features.some(
    (feature) =>
      feature === SolanaSignIn || feature === SolanaSignOffchainMessage || feature === SolanaSignMessage,
  );
}

function createWalletClient(cluster: "mainnet" | "devnet") {
  return createClient().use(
    walletSigner({
      chain: `solana:${cluster}`,
      filter: (wallet) =>
        canAuthenticateWallet(wallet) || wallet.features.includes(SolanaSignAndSendTransaction),
      storageKey: `sonnely.wallet.${cluster}`,
    }),
  );
}

export const solanaWalletClients = {
  mainnet: createWalletClient("mainnet"),
  devnet: createWalletClient("devnet"),
};

export const mobileAdapterName = "Mobile Wallet Adapter";

export function isMobileAdapter(name: string) {
  return name === mobileAdapterName || name === "Remote Mobile Wallet Adapter";
}

let mobileRegistration: Promise<void> | undefined;

export function registerMobileWallet(chain: "solana:mainnet" | "solana:devnet") {
  if (!window.isSecureContext || !/Android/i.test(navigator.userAgent)) return;
  mobileRegistration ??= import("@solana-mobile/wallet-standard-mobile")
    .then(({ registerMwa, createDefaultAuthorizationCache, createDefaultChainSelector }) => {
      registerMwa({
        appIdentity: { name: "Sonnely", uri: window.location.origin, icon: "/brand/sonnely-crimson-192.png" },
        chains: [chain],
        authorizationCache: createDefaultAuthorizationCache(),
        chainSelector: createDefaultChainSelector(),
      });
    })
    .catch(() => {
      mobileRegistration = undefined;
    });
}
