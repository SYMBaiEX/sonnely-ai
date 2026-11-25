export const profiles = Object.freeze({
    normal: Object.freeze({ runs: 1_000, seed: 1, explore: 60 }),
    nightly: Object.freeze({ runs: 20_000, seed: 2, explore: 300 }),
});
export const profile = (name = "normal") => profiles[name];
