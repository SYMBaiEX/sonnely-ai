type Stamps = Iterable<readonly [string, string]>;
export type ParsedStamp = readonly [file: string, empty: boolean, dev: bigint, ino: bigint, size: bigint, mtimeNs: bigint, ctimeNs: bigint];
export declare function fileStamp(file: string, follow?: boolean): string;
export declare function parseStamps(entries: Stamps): ParsedStamp[];
export declare function sameParsed(entries: readonly ParsedStamp[], follow: boolean): boolean;
export declare const sameFiles: (files: Stamps, links: Stamps) => boolean;
export declare function cacheCredentials(env: NodeJS.ProcessEnv, args: string[], declared: string | undefined, credentials: {
    apiUrl: string;
    writeToken: string;
}): NodeJS.ProcessEnv;
export declare function packageVersion(dep: string): string;
export interface DafnyInstall {
    launchers: string[];
    assemblies: string;
    runtime: string[];
    trees: Map<string, string[]>;
    files: string[];
    stamps: Map<string, string>;
    at: string;
    unchanged: () => boolean;
}
export declare function readDafnyInstallation(): DafnyInstall | {
    at: string;
    files?: undefined;
};
export declare function readDafnyVersion(inst: DafnyInstall | undefined): Promise<{
    version?: string;
    problem?: string;
}>;
export declare function readDafnyIdentity(inst: DafnyInstall | undefined): Promise<{
    version: string | undefined;
    launchers: string[];
    assemblies: string;
    runtime: string[][];
}>;
export declare function solverCandidates(): string[];
export declare const solverStamp: (candidates: string[]) => string;
export declare function resolveSolver(onCandidates?: (stampText: string) => void): Promise<{
    path: string;
    version: string;
}>;
export declare function findVibelangBinary(): Promise<string | null>;
export declare function toolchainFingerprint(): Promise<{
    platform: NodeJS.Platform;
    arch: NodeJS.Architecture;
    node: {
        version: string;
        digest: string;
    };
    dafny: {
        version: string | undefined;
        launchers: string[];
        assemblies: string;
        runtime: string[][];
    } | null;
    z3: {
        version: string;
        digest: string;
    } | null;
    vibelang: {
        version: string;
        digest: string;
    } | null;
    packages: string[];
}>;
export {};
