import type * as TS from "typescript";
import { writeWhole } from "./run.ts";
import { type Spec } from "./parse.ts";
import type { Result } from "./pipeline.ts";
import { type TestProfile } from "./testing/profile.ts";
export { writeWhole };
/** Load TypeScript lazily so commands that never touch it skip its startup cost. */
export declare const tsApi: () => typeof TS;
export declare const digest: (text: string) => string;
/** A hash of several texts, in which no two lists of texts give the same input. */
export declare const sha: (...parts: string[]) => string;
export declare const short: (text: string) => string;
export declare const indent: (s: string, by?: number) => string;
/** What each promise gives, once every one has finished: a failure is thrown only then, so that nothing is left running. */
export declare function allDone<const T extends readonly unknown[]>(promises: T): Promise<{
    -readonly [I in keyof T]: Awaited<T[I]>;
}>;
/** Files and symbolic links below a project directory, excluding directory entries. */
export declare const filesUnder: (root: string, dir: string) => string[];
export declare function pruneSidecars(dir: string): void;
/** What a package's tsconfig.json names: itself, the configurations it extends and the files it includes, VibeLang's among them. */
export declare function configured(dir: string): string[];
/** Resolve a project folder before a command reads or writes its files. */
export declare function projectRoot(directory: string, base?: string): string;
/** The directories a spec area may map to: an entry in `vibestack.json` `spec.owners` or `package.json` `specOwners`, or conventional `apps/<name>` and `packages/<name>`. */
export declare function specOwnerPaths(root: string, name: string): string[];
/**
 * The workspace package a spec belongs to by name, as a path from the root: `spec/<name>/…` is `apps/<name>` or
 * `packages/<name>`, if that is a package with no `spec/` of its own. The root's check generates into its `gen/` and
 * checks its code (SPEC.md, "One spec tree").
 */
export declare function owner(root: string, spec: string, observe?: (file: string) => void): string | undefined;
/**
 * The directories whose code a check reads, each as the prefix of a path from the root: "" for the root's own
 * `src/` and `test/`, then `apps/app/` for each package that owns a directory of the spec tree.
 */
export declare const codeDirs: (root: string) => string[];
/** Which of `codeDirs` a path from the root is in: the root holds no `apps/` or `packages/` code of its own. */
export declare const codeDirOf: (file: string) => string;
/** A file with `//@` under a `src/` the check reads; `file` is its path from the root (`src/x.ts`, `apps/app/src/x.ts`). */
export interface SrcFile {
    file: string;
    code: string;
    ts: boolean;
}
/** Every such file, read once: a check proves and reviews the same text, even if a file changes while it runs. */
export declare function readSrc(root: string): SrcFile[];
/** One result as `report` in spec.ts takes it. */
export type Reported<S extends Result["stage"] = Result["stage"]> = [ok: boolean, stage: S, summary: string, detail?: string, where?: string];
/** A directory's package.json, or nothing; one that is not JSON is refused with its path. */
/** A package's package.json, or nothing where it has none. */
export declare function manifest(dir: string): any;
/** A package's scripts. */
export declare const packageScripts: (root: string) => Record<string, string>;
/** The script that runs the package's app, for Studio's preview and the explore stage: `start`, or `dev` when that is not the studio. */
export declare function appScript(root: string): "start" | "dev" | undefined;
/** A terminal colour code, which development servers print around their address. */
export declare const COLOUR: RegExp;
/** The address a development server says it serves at, in a line it printed. @throws {never} */
export declare const servedAt: (line: string) => string | undefined;
/** `run()`, or what it returned the last time for the same fingerprint, if `keep` kept it then (cache.ts). */
export type Remember = <T>(fingerprint: string, run: () => Promise<T>, keep: (result: T) => boolean) => Promise<T>;
/**
 * What a fingerprint covers: what a package's tests read, or what its typecheck may read, its scripts and JSON but the
 * traces and counterexamples. What its page reads is explore.ts's `pageInputs`.
 */
export type Inputs = "tests" | "types";
/** A package and the workspace packages it depends on, and theirs, each once: by its real directory and the name it is depended on by. */
export declare function workspacePackages(root: string): {
    directory: string;
    name: string;
}[];
/**
 * A fingerprint of what a package's tests or its typecheck read: its files but `PROSE` and the simulations' traces, and
 * the top of its gen/ (an owner's is mirrored from the root's), the fixtures nested under its test/, the workspace packages it depends on, the lock file
 * and the fuzzing budget. Of a workspace package depended on, only what a dependent can load: not its spec/, Markdown
 * outside fixtures/, tests, drivers, traces or counterexamples, nor the packages nested in it, nor its gen/ unless its
 * scripts or its manifest reach into it.
 */
export declare function testInputs(root: string, mode?: TestProfile, read?: Inputs): string | undefined;
/** A successful complete Node test run, also restored by the Turbo test task. */
export declare const testReceipt: (root: string, mode?: TestProfile) => string;
export declare const HAS_CITATION: RegExp;
/** A citation of `heading` in `spec`; `at` is `file:line`, a path from the checking root. */
export interface Citation {
    at: string;
    spec: string;
    heading: string;
}
export declare function fileCitations(file: string, text: string): Citation[];
/** Every citation in the code of `dirs`, which are `codeDirs` (all of them unless given): an owner cites as the root does. */
export declare const citations: (root: string, dirs?: string[]) => Citation[];
export declare function missingCitations(specs: Spec[], found: Citation[]): string[];
/** Every citation in a package's code whose heading is no story or rule of that spec, as `file:line  citation`. */
export declare const danglingCitations: (root: string, specs: Spec[], dir?: string) => string[];
/** A directory no stage reads in a package: build output, dependencies, saved explorations and hidden directories. */
export declare const UNREAD: RegExp;
/**
 * A package's files that `keep` accepts, as paths from it: not gen/, build output, dependencies, hidden directories
 * (such as `.cache/`) or `.DS_Store`, nor the packages nested in it, which are checked on their own, except, with
 * `fixtures`, those under a test/ directory, which its tests read.
 */
export declare function packageFiles(root: string, keep: (file: string) => boolean, dir?: string, fixtures?: boolean): string[];
export declare const packageCode: (root: string) => string[];
/** A test of a package: test/**\/*.test.*, but not a driver, which the traces stage runs. */
export declare const isTestFile: (file: string) => boolean;
/** Where a package keeps its drivers, the traces they replay and the counterexamples the simulator found (SPEC.md, "Conformance"). */
export declare const TRACES = "test/traces", DRIVERS = "test/drivers", COUNTEREXAMPLES = "test/counterexamples";
/** Where Quint writes the traces of the simulations a check ran. */
export declare const SIMULATIONS = "gen/traces";
/** A token of a script, and how many brackets it sits in. */
interface Token {
    text: string;
    pos: number;
    start: number;
    depth: number;
    fresh: boolean;
}
/** A script's tokens, or nothing if its brackets do not balance; TypeScript's scanner reads VibeLang's too. */
export declare function tokenize(text: string): Token[] | undefined;
/** The package manager a package declares, or whose lock file sits in it or a directory above it, up to the repository or workspace root. */
export declare function packageManager(root: string): {
    name: string;
    lock?: string;
};
