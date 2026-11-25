import { type Opaque, type Param, type Roles, type Transition } from "./classify.ts";
import { type Json, type Types } from "./types.ts";
/** A definition the simulator evaluates so that its result can be compared with TypeScript's. */
export interface Eval {
    name: string;
    params: (Param & {
        from: "state" | "prev" | "emitted" | "pick";
    })[];
    result: Json;
}
export interface WitnessStep {
    transition: Transition;
    args: string[];
}
export declare const witnessAction: (goal: string) => string;
export declare const witnessFile: (model: string) => string;
/** A fair event cannot be put off for ever: weakly, while it stays possible; strongly, while it keeps becoming possible. */
export type Fairness = "weak" | "strong";
/** Every name the harness binds itself, which a spec parameter would hide (TAKEN in gen.ts). */
export declare const HARNESS: string[];
export declare const positiveGuardEvaluation: (name: string) => string;
export declare const positiveGuardProbe: (name: string) => string;
export declare const refusalEvaluation: (name: string) => string;
export declare const refusalFile: (model: string) => string;
export declare function harness(module: string, source: string, imports: string[], funs: Json[], sig: (d: Json) => {
    params: Param[];
    result: Json;
}, samples: Map<string, {
    elem: Json;
    ref: string;
    line: number | undefined;
}>, { stateType, transitions, always, sometimes, steps, laws, opaques, output, refines, sender }: Roles, { fields, typedef, resolve, shape, tagged, named, qType }: Types, { weights, fair, refusals }: {
    weights: Map<string, number>;
    fair: Map<string, Fairness>;
    refusals?: ReadonlyMap<string, string>;
}, witnesses?: ReadonlyMap<string, WitnessStep[]>): {
    text: string;
    guardHarness: string;
    refusalHarness?: string;
    evals: Eval[];
    uncompared: string[];
};
/**
 * The spec's module as the harness of a spec with opaque functions imports it: each `const f: (A, B) => R` becomes a
 * table the harness chooses, and every definition may read it, so none is `pure`. Every line stays where it was.
 */
export declare const simulated: (qnt: string, opaques: Opaque[]) => string;
