// Synthetic public addresses for local tests. The signing keys were discarded.
export const fixtureWallet = "4mXbaPHhmW9bZMdSAd9NEpdL5q3gjAcEdZyRPYhMUAGk";

export function localFixtureWallets() {
  return {
    admin: process.env.SONNELY_TEST_ADMIN_WALLET ?? fixtureWallet,
    treasury: process.env.SONNELY_TEST_TREASURY_WALLET ?? "X7D5MRGHootjNgKWSgG2Q79f2jHiHpSfduei8t9J4Hg",
    profit: process.env.SONNELY_TEST_PROFIT_WALLET ?? "8RFMcU7Ai7wtRsJTZbF9L8MsaiSZ1kefdDfNSCRZBDht",
  };
}
