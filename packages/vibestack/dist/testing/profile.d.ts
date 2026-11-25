/** Fixed exploration profiles shared by Vitest and the spec command. `explore` is the seconds Bombadil runs on a page, Chrome's start included. */
export type TestProfile = "normal" | "nightly";
export declare const profiles: Readonly<{
    normal: Readonly<{
        runs: 1000;
        seed: 1;
        explore: 60;
    }>;
    nightly: Readonly<{
        runs: 20000;
        seed: 2;
        explore: 300;
    }>;
}>;
export declare const profile: (name?: TestProfile) => Readonly<{
    runs: 1000;
    seed: 1;
    explore: 60;
}> | Readonly<{
    runs: 20000;
    seed: 2;
    explore: 300;
}>;
