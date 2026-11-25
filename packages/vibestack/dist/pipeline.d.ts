import { type InitOptions } from "./upgrade.ts";
import { type Spec } from "./parse.ts";
import { type TestProfile } from "./testing/profile.ts";
export { readSpecs, parseSpec, expandListHelpers, type Spec, type Rule, type Story } from "./parse.ts";
export { pending, pendingKey, pendingContracts, acceptReviews, acceptContracts, dependencies, type Lock, type Pending } from "./review.ts";
export { generated, typecheckAll, checkVerifiedSource } from "./units.ts";
export { replay, type Step } from "./simulate.ts";
export { danglingCitations } from "./util.ts";
export { scanSpec } from "./scan.ts";
export interface Result {
    ok: boolean;
    stage: "model" | "always" | "sometimes" | "replay" | "types" | "proof" | "tests" | "traces" | "explore" | "review" | "skipped";
    summary: string;
    detail: string;
    where?: string; /** The rules the result concerns, each by its spec and key. */
    rules?: {
        file: string;
        key: string;
    }[];
}
/** The Node these tools run on: the major release .nvmrc pins, and the root's `engines` floor. */
export declare const NODE = 26;
export declare const show: ({ ok, stage, summary, detail }: Result) => string;
/** Whether `accept` can record a check: every stage but review passed, every story has rules and every rule has Quint. */
export declare const acceptable: (results: Result[]) => boolean;
/** The one most useful thing to do after a check, given what it found. */
export declare function nextStep(results: Result[]): string;
/** Warm the normal simulation actions for these module names in a disposable project, using a snapshot from readSpecs. */
export declare function precomputeSimulations(root: string, specs: Spec[], targets: readonly string[]): Promise<Result[]>;
interface SimulationPreparation {
    results: Result[];
    seedDirectory?: string;
    partialDirectory?: string;
}
/** Prepare the selected simulations and capture certified receipts for a trusted runner. */
export declare function prepareSimulationReceipts(root: string, specs: Spec[], targets: readonly string[], seedParent: string): Promise<SimulationPreparation>;
/**
 * Run every check, cheapest first, and return what each found and the next
 * thing to do; `log` hears of each result as it arrives. Stages after a broken
 * model are skipped, and said to be, because their failures would only restate
 * the first one. `accept` is "reviews" to record reconciled stories, rules and
 * contracts, or "unproved" to record the obligations that are simulated but not
 * proved; either way nothing remembered from an earlier run is used. Only one
 * check or accept runs in a project at a time; another is refused.
 */
export declare function check(root: string, accept?: false | "reviews" | "unproved", log?: (result: Result) => void, mode?: TestProfile): Promise<{
    ok: boolean;
    results: Result[];
    next: string;
    wrote: Map<string, string>;
}>;
/** Set up a project, preserving its content outside the marked Vibestack instructions. */
export declare function init(root: string, optionsOrWarn?: InitOptions | ((message: string) => void)): string[];
/** Write a directory's index without replacing an existing specification. */
export declare function newSpec(root: string, name?: string): string;
/** The `spec` command, on `process.argv`. */
export declare function main(argv?: string[]): Promise<void>;
