export type VibestackMode = "vibelang" | "typescript" | "specs-only";
export type TypesStageMode = "vibelang" | "tsc" | "skip";
export type TestsStageMode = "vitest" | "custom" | "skip";
export type ExploreStageMode = "auto" | "skip";
export interface VibestackSpecConfig {
    dir?: string;
    exclude?: string[];
    owners?: Record<string, string>;
}
export interface VibestackStagesConfig {
    types?: TypesStageMode;
    tests?: TestsStageMode;
    explore?: ExploreStageMode;
}
export interface VibestackConfig {
    mode?: VibestackMode;
    spec?: VibestackSpecConfig;
    cacheDir?: string;
    stages?: VibestackStagesConfig;
}
export interface ResolvedVibestackConfig {
    mode: VibestackMode;
    spec: {
        dir: string;
        exclude: string[];
        owners: Record<string, string>;
    };
    cacheDir: string;
    stages: {
        types: TypesStageMode;
        tests: TestsStageMode;
        explore: ExploreStageMode;
    };
}
export declare function defineConfig(config: VibestackConfig): VibestackConfig;
export declare function loadConfig(root: string): ResolvedVibestackConfig;
export declare function isExcludedSpecPath(relPosixPath: string, specConfig: Pick<ResolvedVibestackConfig["spec"], "dir" | "exclude">): boolean;
export declare function cacheDirectory(root: string): string;
