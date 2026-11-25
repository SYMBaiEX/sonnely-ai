import type { Model } from "./gen.ts";
import { type Input } from "./action.ts";
import { type Memory } from "./cache.ts";
import { type Simulated } from "./conform.ts";
import { type Spec } from "./parse.ts";
import type { Result } from "./pipeline.ts";
export interface Step {
    event?: {
        type: string;
    };
    law?: {
        name: string;
        args: Record<string, unknown>;
    };
    /** A definition the simulator evaluated: what was picked for its sampled parameters, and what Quint got. */
    evaluated?: {
        name: string;
        picks: Record<string, unknown>;
        result: unknown;
    };
    state?: unknown;
    /** What the event output, in a spec whose transitions may output (gen/classify.ts, `Roles.output`). */
    out?: unknown[];
    /** Whether the last step refined the machine the spec refines (SPEC.md, "Refinement"). */
    refined?: boolean;
    lawsHold?: boolean;
    /** The fair events this state allows, if the spec declares any. */
    fair?: string[];
    /** On a trace's first step: the table it chose for each opaque function, as rows of arguments and result, and the result for anything else. */
    tables?: Record<string, {
        rows: [unknown[], unknown][];
        otherwise: unknown;
    }>;
}
/** What a spec's runs of Quint share: the check's memory, the model, and every file of Quint its harness reads. */
export interface Harness {
    memory: Memory;
    model: Model;
    files: Record<string, Input>;
    main?: string;
    reproduceIn?: string;
}
/** What a spec's harness reads: its modules, the harness itself, and the spec as the harness reads it where it has opaque functions. */
export declare function harnessFiles(spec: Spec, specs: Spec[], model: Model, witness?: {
    harness: string;
}): Record<string, Input>;
/**
 * Simulate the harness until `invariant` breaks; returns the traces Quint wrote, and the command that runs the same
 * simulation again. Each run gives Quint's evaluator the compiled harness and writes the traces `quint run` writes for
 * the same arguments; a run that ends with no answer that way is run by `quint run` itself, which says why. One run uses
 * one core, so with `split` a large budget is split among up to four runs of a single thread, each with a seed of its
 * own; how it is split depends only on the budget, so the same harness always gives the same traces. When a run breaks
 * the invariant, the command is the one for that run. A run that ran is in gen/traces until the next check; one
 * remembered (action.ts) is not.
 */
export declare function simulate(harness: Harness, invariant: string, traces: number, samples: number, step?: string, split?: boolean, steps?: number, seed?: number, sampleLimit?: number): Promise<{
    broken: boolean;
    traces: Step[][];
    again: string;
}>;
/**
 * Look for a state that breaks `invariant`, which is how a goal is shown reachable: in longer traces while none is
 * found, fewer of them as they lengthen, so each depth costs about as many events as `samples` traces of the first.
 */
export declare function search(harness: Harness, invariant: string, step?: string, depths?: number[], samples?: number, seed?: number): ReturnType<typeof simulate>;
/**
 * Replay one Quint trace through the TypeScript domain; throws at the first difference. With the model, sets are
 * compared whatever their order and every definition the simulator evaluated is evaluated here too.
 */
export declare function replay(domain: any, trace: Step[], model?: Model): void;
/** What simulating a spec found: the `always`, `sometimes` and `replay` results, and what the traces stage checks programs against. */
export interface Simulation {
    said: Result[];
    tested?: Simulated;
}
/**
 * Simulate one spec and replay its traces through `domain`, its generated module. A spec is not simulated again while
 * what Quint reads is unchanged, and its results are not said again while its rules keep their names and the
 * definitions they held: the seed is part of what is simulated, so a failure comes back the same. A result cites a
 * rule at the line it is on now, so prose that moves the rules simulates nothing again. Only a simulator that could
 * not run is tried again.
 */
export declare function simulation(memory: Memory, spec: Spec, specs: Spec[], model: Model, domain: any, seed: number): Promise<Simulation>;
