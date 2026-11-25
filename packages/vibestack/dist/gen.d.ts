import { type Roles } from "./gen/classify.ts";
import { type Eval, type Fairness } from "./gen/harness.ts";
import { type Json } from "./gen/types.ts";
import type { ComparisonShape } from "./conformance.ts";
export interface Model extends Roles {
    name: string;
    /** The source in the project, or std/ for a spec shipped with the tools. */
    source: string;
    imports: string[];
    /**
     * The module as the prover reads it, under a prefix for proof bundles; `docs = false` omits spec comments for cache
     * keys. Its bundle supplies its imports and omits the runtime guards the proof takes as given (Scope.proof in gen/print.ts).
     */
    render: (prefix: string, docs?: boolean) => string;
    /** The type of a constant beside another proof unit, in the scope that declared it. */
    proofTypeOfConstant: (name: string) => string | undefined;
    /** Events the spec declares fair (`fair_<event>`), each "weak" or "strong". */
    fair: Map<string, Fairness>;
    /** `leadsTo` rules that must also be met within a number of events (`within_<rule>`). */
    within: Map<string, number>;
    evals: Eval[];
    /** Definitions the simulator cannot evaluate on their own, because it has no values for a parameter. */
    uncompared: string[];
    /** A value from a Quint trace (ITF) as the generated TypeScript represents it. */
    decode: (type: Json, itf: any) => any;
    /** The same value with every set in a fixed order, so that two sets compare equal however they were built. */
    canon: (type: Json, value: any) => any;
    /** The shape of state observations, including which arrays are sets and which variant carries them. */
    shape: ComparisonShape | undefined;
    /** The shape of emitted effects, when transitions return them beside the state. */
    outputShape: ComparisonShape | undefined;
    /** What importers may refer to; `visible` includes the types this module imported. */
    exports: {
        types: string[];
        values: string[];
        variants: string[];
        visible: Json[];
        samples: {
            name: string;
            elem: Json;
        }[];
    };
    ts: string;
    harness: string;
    guardHarness: string;
    guideNames: readonly string[];
    witness?: {
        harness: string;
        paths: Map<string, string[]>;
    };
    refusal?: {
        harness: string;
        guards: ReadonlySet<string>;
    };
}
/** Where a definition came from in the spec, for doc comments and diagnostics. */
export interface Origin {
    rule: string;
    line: number;
}
export declare function generate(ir: Json, name: string, source: string, origin: (def: string) => Origin | undefined, deps: Map<string, Model>): Model;
