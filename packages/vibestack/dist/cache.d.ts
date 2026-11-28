import { type Evaluator, executableDigest } from "./installed.ts";
import { cacheCredentials } from "./toolchain.ts";
export { cacheCredentials, executableDigest };
export declare const inSteadyCheck: () => boolean;
export declare function certifyInstallation(): void;
/** Run a check, which reads Dafny's installation once: its final certification checks that installation even after a wholly warm run. */
export declare const steady: <T>(run: () => Promise<T>) => Promise<T>;
export declare function withStableInstallation<T>(attempt: () => Promise<T>): Promise<T>;
declare const TOOL_PACKAGES: {
    readonly quint: "@informalsystems/quint";
    readonly lsc: "lemmascript";
};
type Isolated = {
    entry: string;
    script: string;
};
type Program = {
    exe: string;
    unchanged: () => boolean;
    verifyIsolated?: () => boolean;
} & ({
    id: string;
    isolated: Isolated;
} | {
    id: undefined;
    isolated?: never;
});
export declare const installedPackages: (exe: string, name: string) => string[];
export declare function installedProgram(root: string, tool: keyof typeof TOOL_PACKAGES): Program | undefined;
export declare function recoverIsolatedProgram(root: string, tool: keyof typeof TOOL_PACKAGES, current: Program): Program | undefined;
export declare function evaluatorForCheck(root: string): Evaluator | undefined;
export declare function stableInstallation(same: boolean): boolean;
/** The version of Dafny on the PATH, or why it could not be read: asked of Dafny only when its installation changed. */
export declare const dafnyVersion: () => Promise<{
    version?: string;
    problem?: string;
}>;
/** The verifier's launchers, managed assemblies, and any separately installed .NET host, by their bytes. */
export declare const dafnyIdentity: () => Promise<{
    version: string | undefined;
    launchers: string[];
    assemblies: string;
    runtime: string[][];
}>;
/** Dafny, told apart by its installation and the solver it is given. */
export declare const verifierIdentity: () => Promise<string>;
export declare function dafnyLauncher(): string;
export declare const solver: () => Promise<{
    path: string;
    version: string;
}>;
/** Every tool's script, where it is: a page that runs one of them may run any (explore.ts, `pageInputs`). */
export declare const toolScripts: () => string[];
/** The code of every tool, which such a page reads. */
export declare const toolsCode: () => string;
/** The stages whose results are remembered, and the runs of an outside tool any of them asks for (action.ts). */
declare const STAGES: readonly ["simulate", "prove", "types", "tests", "traces", "explore", "action"];
type Stage = (typeof STAGES)[number];
/** The remembered results of one check: whether it may read them, and every entry it read or wrote. */
export interface Memory {
    root: string;
    fresh: boolean;
    used: Set<string>;
    wrote?: boolean;
    actionSignal?: AbortSignal;
    actionProjection?: {
        version: string;
        encode: (value: unknown) => unknown;
    };
    /** Actual receipt bytes, including writes pending installation certification. */
    captureReceipt?: (receipt: {
        name: string;
        bytes: Uint8Array;
    }) => void;
}
/** An entry of `.spec-cache`: JSON, compressed, since a run of the simulator says megabytes. */
interface Entry {
    name: string;
    file: string;
    reusable: boolean;
    evaluator?: Evaluator;
}
export declare function withFormalCache<T>(directory: string, run: () => Promise<T>): Promise<T>;
export declare function entry(root: string, stage: Stage, key: (string | undefined)[], evaluates?: boolean): Promise<Entry>;
/** What an entry holds, or undefined. An entry that cannot be read, cut short by a kill or a full disk, is deleted and is a miss. */
export declare function recall<T>(memory: Memory, raw: Entry): T | undefined;
/** Remember `value` under an entry, unless this process cannot say which tools computed it: then the next check computes it again. */
export declare function store(memory: Memory, raw: Entry, value: unknown, source?: {
    program: Program;
    began: number;
} | "dafny"): void;
/**
 * `produce()`, or what it returned the last time for the same key, if that was
 * worth keeping. This is what keeps a check proportional to what changed. The
 * cache is a convenience: `accept` never reads it. Every entry read or written is recorded as used, so that a
 * full check keeps its results while pruning older branches and profiles. A result also names the entries its
 * producer used, the runs of tools beneath it, and a hit keeps those in use too: a change to these tools asks for the
 * result again, and finds the runs still there. Work delayed by a queue reads the same entry once more on admission.
 */
export declare function remembered<T>(memory: Memory, at: Entry | Promise<Entry>, produce: (memory: Memory) => T | Promise<T>, keep: (result: T) => boolean, schedule?: (work: (waited: boolean) => Promise<T>) => Promise<T>): Promise<T>;
export declare const isActionEntry: (name: string) => boolean;
/** Keep recent branches and profiles for a month, within 256 MiB; never evict this check's entries. */
export declare function collectGarbage(memory: Memory): void;
