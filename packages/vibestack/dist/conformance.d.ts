/** What the application did with an event. Anything else (a crash, a 500, a timeout) must throw. */
export type Outcome = "accepted" | "refused";
/** The only hand-written part: how to reach the real application. It may import the spec's types, never its code. */
export interface Driver<E, V> {
    /** Start from a fresh application: empty storage, nothing created. */
    reset(): void | Promise<void>;
    /**
     * Send `event` for the entity `key` through the application's own entry point, and say what it did. `by` is who
     * sent it, when the spec's transitions take a sender: sign in or open a session as them.
     */
    dispatch(key: string, event: E, by?: unknown): Outcome | Promise<Outcome>;
    /** What the application now holds or shows for `key`, read back through its own storage or interface. */
    observe(key: string): V | Promise<V>;
    /** Effects exposed by the application after its most recent dispatch, when it exposes them. */
    observeOutput?(key: string): unknown | Promise<unknown>;
    /**
     * Send an untrusted `raw` value for `key` as the network would, through the decoding `dispatch` skips. With it, the
     * check sends each event malformed (refused, nothing changes) and with an extra field and fields that change on a
     * second read (the same as the clean event).
     */
    receive?(key: string, raw: unknown, by?: unknown): Outcome | Promise<Outcome>;
}
export type PathStrategy = "shortest" | "transitions" | "simple";
export interface ModelStep<S, E> {
    readonly before: S;
    readonly event: Sent<E>;
    readonly allowed: boolean;
    readonly after: S;
    readonly out?: unknown;
}
export interface ModelPath<S, E> {
    readonly description: string;
    readonly targetState: string;
    readonly steps: readonly ModelStep<S, E>[];
    readonly events: readonly Sent<E>[];
}
export interface PlanOptions<S, E> {
    readonly strategy?: PathStrategy;
    readonly stateKey?: (state: S) => string;
    readonly includeRefusals?: boolean;
    readonly maxStates?: number;
    readonly maxDepth?: number;
    readonly maxPaths?: number;
    readonly transitions?: readonly string[];
    readonly predicates?: Readonly<Record<string, (state: S) => boolean>>;
    readonly seedTraces?: readonly (readonly Sent<E>[])[];
    readonly hasOutput?: boolean;
}
export interface TransitionCoverage {
    readonly total: number;
    readonly accepted: readonly string[];
    readonly refused: readonly string[];
    readonly uncovered: readonly string[];
}
export interface ModelPlan<S, E> {
    readonly strategy: PathStrategy;
    readonly paths: readonly ModelPath<S, E>[];
    readonly prefixForTransition: ReadonlyMap<string, {
        readonly prefix: readonly Sent<E>[];
        readonly event: Sent<E>;
    }>;
    readonly coverage: {
        readonly states: number;
        readonly paths: number;
        readonly truncated: boolean;
        readonly transitions: TransitionCoverage;
    };
}
export interface Options<S, V> {
    /** What of the spec's state the driver can observe; without it, `observe` returns the whole state. */
    view?: (state: S) => V;
    /** Entities the walks interleave, so that one leaking into another shows; one key for an application of one. */
    keys?: string[];
    /**
     * At most this many random walks after the journeys, within the fixed profile (conform.ts); 0 runs the journeys
     * and model paths only, as a slow driver (a browser) should.
     */
    walks?: number;
    steps?: number;
    seed?: number;
    /** Deterministic model-based path strategy run before random walks; `false` disables generated paths. */
    paths?: PathStrategy | false;
    /** Optional state abstraction key for model path planning. */
    stateKey?: (state: S) => string;
}
/** What the generated `gen/<name>.ts` gives the check. */
export interface Oracle<S, E> {
    initial: S;
    enabled(state: S, event: E, by?: any): boolean;
    step(state: S, event: E, by?: any): S | {
        state: S;
        out: unknown;
    };
    parseState(raw: unknown): S | undefined;
    parseEvent(raw: unknown): E | undefined;
    parseSender?(raw: unknown): unknown;
}
/**
 * What `pnpm check` found for one spec: the events the simulator took or tried a guard with, a shortest journey to
 * each `sometimes` rule, and where the state holds sets. An event that came from someone carries them as `by`.
 */
export interface Found<E> {
    spec: string;
    source: string;
    sender: boolean;
    events: Sent<E>[];
    journeys: {
        story: string;
        rule: string;
        events: Sent<E>[];
    }[];
    shape: ComparisonShape;
    outputShape?: ComparisonShape;
    traces?: Sent<E>[][];
    transitions?: string[];
}
export type Sent<E> = E & {
    by?: unknown;
};
/** Events sent to the application, each for one entity: what a failure carries and `replay` takes. */
export type Trace<E> = [key: string, sent: Sent<E>][];
/** A disagreement between the application and its spec, with the fewest events that show it, as data to save and replay. */
export declare class ConformanceError<E = unknown> extends Error {
    readonly trace: Trace<E>;
    readonly seed: number;
    /** The journey or walk that found it, or "replay". */
    readonly origin: string;
    constructor(message: string, trace: Trace<E>, seed: number, origin: string);
}
export declare function planModel<S, E>(oracle: Oracle<S, E>, events: readonly Sent<E>[], shape?: ComparisonShape, options?: PlanOptions<S, E>): ModelPlan<S, E>;
/**
 * Run the journeys, deterministic model-based paths, probes of a driver that can `receive`, then seeded random walks;
 * throw a ConformanceError at the first disagreement, shrunk to the fewest events that show it, or an Error at the
 * first probe that fails.
 */
export declare function check<S, E, V>(oracle: Oracle<S, E>, found: Found<E>, driver: Driver<E, V>, options?: Options<S, V>): Promise<{
    plans: number;
    journeys: number;
    probes: number;
    walks: number;
    observed: number;
    outcomes: Outcome[];
    coverage: TransitionCoverage;
    effects: string;
}>;
/**
 * Run exactly `trace`, saved as `from`, through the application; throw a ConformanceError if it still disagrees, and
 * an Error if it holds an event the spec no longer has, which only a person can bring up to date or delete.
 */
export declare function replay<S, E, V>(oracle: Oracle<S, E>, found: Found<E>, driver: Driver<E, V>, trace: Trace<E>, options?: Options<S, V>, from?: string): Promise<void>;
export type ComparisonShape = "scalar" | {
    set: ComparisonShape;
} | {
    list: ComparisonShape;
} | {
    map: ComparisonShape;
} | {
    fields: Record<string, ComparisonShape>;
} | {
    variants: Record<string, ComparisonShape>;
};
export declare function canonical(value: unknown, shape: ComparisonShape): string;
/** A recorded line either starts from a state or applies an event; state observations may be sparse. */
export interface Line {
    event?: unknown;
    by?: unknown;
    state?: unknown;
    out?: unknown;
}
/** Validate an input once for both driver and recorded-trace conformance. */
export declare function transition<S, E>(oracle: Oracle<S, E>, found: Found<E>, before: S, raw: unknown, by: unknown): {
    event: E;
    allowed: boolean;
    after: S;
    out?: unknown;
} | string;
/** Compare what the real application exposed, keeping sets independent of their iteration order. */
export declare function compareObservation<S, E, V>(oracle: Oracle<S, E>, found: Found<E>, expected: S, raw: unknown, view?: (state: S) => V): string | undefined;
/** The first disagreement in a recorded trace. At least one real state must have been observed. */
export declare function departure<S, E>(oracle: Oracle<S, E>, found: Found<E>, lines: unknown[]): {
    line: number;
    why: string;
} | undefined;
