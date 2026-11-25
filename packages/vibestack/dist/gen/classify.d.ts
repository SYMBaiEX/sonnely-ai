import { type Json, type Types } from "./types.ts";
export interface Param {
    name: string;
    type: Json;
}
/** `guardParams`: the transition's parameters its guard takes, by name, after the state; `emits` if it returns `{ state, out }`. */
export interface Transition {
    name: string;
    params: Param[];
    guard: string | undefined;
    guardParams: string[];
    emits: boolean;
}
export interface Law {
    name: string;
    params: Param[];
}
/** A function declared without a body (`const f: (A) => R`), its parameters named p0, p1, …, and the laws assumed of it. */
export interface Opaque {
    name: string;
    params: Param[];
    result: Json;
    laws: Law[];
}
/** A `step` rule; `via` if it also takes the name of the transition between the two states, `out` if what it output. */
interface StepRule {
    name: string;
    via: boolean;
    out: boolean;
}
export interface Roles {
    /** The type of `initial`; undefined for a library, which has definitions and laws but no state machine. */
    stateType: Json | undefined;
    transitions: Transition[];
    always: string[];
    sometimes: string[];
    steps: StepRule[];
    /** `leadsTo` rules: from every reachable state, every fair run reaches a state the rule relates it to. */
    leadsTo: string[];
    /** Laws that are proved; those assumed of an opaque function are in `opaques`. */
    laws: Law[];
    opaques: Opaque[];
    /** The type of the transitions' `by` parameter: who sent the event, which the program supplies and no event carries. */
    sender: Json | undefined;
    /** What a transition with output returns, the record `{ state, out }`, and the type of `out`, a list of effects. */
    output: {
        type: Json;
        out: Json;
    } | undefined;
    refines: Refinement | undefined;
}
/**
 * A machine this spec imports under a name, as this spec spells its types. `refines<Alias>(state)` maps the state onto
 * it; each transition then corresponds to the machine's transition of the same name, or to none (SPEC.md, "Refinement").
 */
export interface ImportedMachine {
    alias: string;
    module: string;
    stateType: Json;
    transitions: Transition[];
}
export interface Refinement {
    fn: string;
    of: ImportedMachine;
}
/** The parameter that names who sent an event (SPEC.md, "What goes in the Quint blocks"). */
export declare const SENDER = "by";
/** The parameter of a `step` rule that names the transition taken (SPEC.md, "What goes in the Quint blocks"). */
export declare const VIA = "via";
export declare const ROLES: string[];
/**
 * `funs` are the spec's `pure def`s in the order it gives them; `sig` gives a definition's parameters and result.
 * The convention: `initial` is the state; a definition from the state to the state is a transition and `can<Name>`
 * its guard, which takes the state and any of the transition's parameters by name. A transition may return the state
 * beside what it outputs, as a record `{ state, out: List[…] }`. `alwaysX(state)`, `stepX(before, [via,] after, [out])`
 * `leadsToX(from, to)` and `sometimesX(state)` are rules; `lawX(...)` is a law. `refines<Alias>(state)` maps the state
 * onto a machine in `machines`, those the spec imports under a name.
 */
export declare function classify(funs: Json[], stateType: Json | undefined, sig: (d: Json) => {
    params: Param[];
    result: Json;
}, { shape, resolve, fields, holdsSet }: Types, machines: ImportedMachine[]): Roles;
export {};
