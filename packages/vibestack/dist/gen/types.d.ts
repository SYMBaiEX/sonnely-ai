import type { ComparisonShape } from "../conformance.ts";
export type Json = any;
export declare const fail: (msg: string) => never;
/** Reads the type the checker inferred for an expression, failing where it recorded none. */
export declare const typeOfIn: (inferred: (id: number) => Json | undefined) => (id: number) => Json;
/**
 * `typedefs` are the types a module can name: its own and those of the specs it imports. A type the module defines
 * is spelled with `prefix` in TypeScript; one from another module is spelled <module>_<name>.
 */
/**
 * The integer in a trace value that Quint wrote as a bignumber.js object rather than as {"#bigint": "<digits>"}.
 * Quint 0.33 reads the Rust simulator's output through json-bigint, which turns every integer of 16 or more
 * digits into a BigNumber; the trace then holds its fields: sign s, exponent e, and digit groups c of base 10^14,
 * the first group holding the digits before the remaining full groups. Anything else, or a fraction, is undefined.
 */
export declare const bigNumberInteger: (v: any) => bigint | undefined;
export declare function typeWalks(typedefs: Json[], module: string, prefix?: string): {
    fields: (t: Json) => Json[];
    typedef: (n: string) => Json;
    resolve: (t: Json) => Json;
    shape: (t0: Json) => string;
    payload: (variant: Json) => Json | undefined;
    tagged: (t: Json) => boolean;
    isScalar: (t: Json) => boolean;
    setElem: (t: Json) => Json;
    keyOf: (t: Json) => Json;
    storedKey: (t: Json, k: string) => string;
    holdsSet: (t0: Json) => boolean;
    named: (t: Json, kind?: string) => Json | undefined;
    ownerOf: (variant: string) => Json;
    typeName: (d: Json) => string;
    tsType: (t: Json) => string;
    declaration: (d: Json) => string;
    qType: (t: Json) => string;
    parsers: (exact?: boolean) => {
        parse: (v: string, t0: Json, depth?: number, own?: boolean) => string;
        lines: () => string[];
    };
    decode: (t0: Json, v: any) => any;
    canon: (t0: Json, v: any) => any;
    comparison: (t0: Json) => ComparisonShape;
};
export type Types = ReturnType<typeof typeWalks>;
