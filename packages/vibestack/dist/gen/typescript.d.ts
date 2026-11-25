import { type Param, type Roles } from "./classify.ts";
import type { Printer } from "./print.ts";
import type { Json, Types } from "./types.ts";
/** The names a module defines beside the spec's, and the locals of what it defines (TAKEN in gen.ts). */
export declare const EMITTED: string[];
/** Prefixes reserved for the helpers a module may carry for itself, each named `<helper>_<module>`, and for local bindings. */
export declare const HELPERS: string[];
export interface Source {
    /** The line that opens the file, and one import line per spec this one imports. */
    header: string[];
    typedefs: Json[];
    vals: Json[];
    funs: Json[];
    sig: (d: Json) => {
        params: Param[];
        result: Json;
    };
    typeOf: (id: number) => Json;
    /** The doc comment that ties a definition to its rule in the spec; empty if it has none. */
    doc: (def: string) => string;
    /** One of the module's own top-level names, as this rendering spells it. */
    local: (name: string) => string;
    /** The spec's file, for messages. */
    source: string;
}
export declare function typescript({ header, typedefs, vals, funs, sig, typeOf, doc, local: L, source }: Source, roles: Roles, types: Types, print: Printer, helper: (which: string) => string): string;
