import { type Json, type Types } from "./types.ts";
import type { Param, Roles } from "./classify.ts";
export declare const DECLASSIFY: RegExp;
interface Flow {
    funs: Json[];
    vals: Json[];
    sig: (d: Json) => {
        params: Param[];
        result: Json;
    };
    inferred: (id: number) => Json | undefined;
    /** Where a definition is in the spec, for messages. */
    where: (def: string) => string;
    variants: Set<string>;
}
/** Fails with every place a secret reaches that is not secret. */
export declare function checkSecrets({ funs, vals, sig, inferred, where, variants }: Flow, roles: Roles, { typedef, resolve, fields, payload, ownerOf, named }: Types): void;
export {};
