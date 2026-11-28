import { Arbitrary, Effect, Schema } from "effect";
export declare const fuzz: Readonly<{
    runs: 1000;
    seed: 1;
    explore: 60;
}> | Readonly<{
    runs: 20000;
    seed: 2;
    explore: 300;
}>;
export type Source<A> = Schema.Schema<A> | Arbitrary.Arbitrary<A>;
export declare const holds: <A>(source: Source<A>, property: (value: A) => boolean, options?: Arbitrary.CheckOptions) => Effect.Effect<void, never, never>;
/** Decoding what was encoded gives the value back. */
export declare function roundTrips<A, I>(schema: Schema.Codec<A, I>): (value: A) => boolean;
/** Encoding is stable: a value that went through its encoding and back encodes as it did before. */
export declare function encodesStably<A, I>(schema: Schema.Codec<A, I>): (value: A) => boolean;
/** Applying `f` twice is applying it once. */
export declare const idempotent: <A>(f: (input: A) => A) => (input: A) => boolean;
/** `f` gives equal outputs for the same input. */
export declare const deterministic: <A, B>(f: (input: A) => B) => (input: A) => boolean;
/** `rule` holds of every input and what `f` makes of it. */
export declare const invariant: <A, B>(f: (input: A) => B, rule: (input: A, output: B) => boolean) => (input: A) => boolean;
/** `back` undoes `f`. */
export declare const inverse: <A, B>(f: (input: A) => B, back: (output: B) => A) => (input: A) => boolean;
/** What a `*.contract.ts` module says of one function: its inputs and the properties that must hold of it. */
export interface Contract<A, B> {
    input: Source<A>;
    run: (input: A) => B;
    deterministic?: boolean;
    /** Only where `run` returns what it takes. */
    idempotent?: boolean;
    invariant?: (input: A, output: B) => boolean;
    inverse?: (output: B) => A;
}
export declare const contract: <A, B>(declared: Contract<A, B>) => Contract<A, B>;
export declare const isContract: (u: unknown) => u is Contract<any, any>;
/** The properties `c` declares, by name: generate.ts writes one `contractTest` for each. */
export declare const declared: <A, B>(c: Contract<A, B>) => Record<string, ((input: A) => boolean) | undefined>;
export declare function contractTest<A, B>(name: string, c: Contract<A, B>, property: string): void;
export declare function schemaTests<A, I>(name: string, schema: Schema.Codec<A, I>): void;
