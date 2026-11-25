import { type Json, type Types } from "./types.ts";
/** Every Quint operator a spec may use, beside the list helpers and builtins below: `print` refuses any other. */
export declare const OPERATORS: Set<string>;
/** What the printer needs to know about the module an expression is in. */
export interface Scope {
    types: Types;
    /** The type the checker inferred for an expression or parameter, if it recorded one. */
    inferred: (id: number) => Json | undefined;
    /** The declaring module's type for an imported constant, as it appears in a proof bundle. */
    importedConstantType: (name: string) => string | undefined;
    /** A reference to a definition, as TypeScript spells it. */
    ref: (name: string) => string;
    /** The name of a helper function the module carries for itself (HELPERS in typescript.ts). */
    helper: (which: string) => string;
    /** Checks that a name the spec binds survives translation unchanged. */
    bind: (name: string) => string;
    variants: Set<string>;
    definitions: Set<string>;
    /** Sample sets and `weight_`, `fair_` and `within_` settings, which never reach TypeScript (gen.ts). */
    simulatorOnly: Set<string>;
    /**
     * Whether the code is for the prover rather than for Node. Node's code checks at run time two things the proof takes
     * as given: that integer arithmetic is exact (a number past 2^53 is rounded, where Quint's and Dafny's integers are
     * not, so such a result throws a RangeError), that a divisor is not zero and a list or map holds what is read from
     * it (a RangeError too), and that `==` on records, lists and variants compares their structure (which JavaScript's
     * `===` does not, but Dafny's `==` does). And the prover's code states the type of a value where LemmaScript cannot
     * infer it (`Expected`). Otherwise the two are the same text.
     */
    proof: boolean;
}
/**
 * `every`, `some`, `includes` and `listMap` are not Quint: the tangler expands them into Quint's built-in `foldl`
 * (expandListHelpers in parse.ts), marking the accumulator `std_<helper>_<n>` so that `print` writes `method`, the
 * native array method, or `includes`. They cannot be Quint definitions that take a lambda, because Quint evaluates such
 * a definition wrongly when it is used inside its own argument, as in `tasks.some(t => t.parents.some(...))`.
 * `every`, like a set's `forall` and `subseteq`, is printed as `!xs.some(x => !p)`: LemmaScript gives `some` and
 * `includes` to Dafny as quantifiers over the members, and `every` as `Std.Collections.Seq.All`, a function over
 * indexes that a proof has to unfold before it meets either.
 */
export declare const LIST_HELPERS: Record<string, {
    init: string;
    step: (acc: string, body: string) => string;
    method?: string;
}>;
/**
 * `m.getOr(k, d)`, `xs.nthOr(i, d)` and `xs.removeAt(i)` are not Quint either. The tangler renames each call to
 * `std_<name>_<module>` and defines that, in Quint, below the module's last line (expandBuiltins in parse.ts), so that a
 * module and one it imports never define the same name; `print` writes the TypeScript the prover follows.
 */
export declare const BUILTINS: Record<string, string>;
export declare const BUILTIN: RegExp;
export declare function printer({ types, inferred, importedConstantType, ref, helper, bind, variants, definitions, simulatorOnly, proof }: Scope): {
    ex: (e: Json, min?: number) => string;
    constant: (e: Json) => string;
    body: (e: Json, params?: Json[]) => string[];
    helpers: Set<string>;
    lookups: {
        map: string;
        key: string;
        of: string;
        stored: string;
    }[];
    typings: string[];
    proof: boolean;
};
export type Printer = ReturnType<typeof printer>;
