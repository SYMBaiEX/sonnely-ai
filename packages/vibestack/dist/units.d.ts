import type * as TS from "typescript";
import { type Model } from "./gen.ts";
import type { Unit } from "./prove.ts";
import { type Spec } from "./parse.ts";
import type { Memory } from "./cache.ts";
import { type SrcFile } from "./util.ts";
export declare function publishGen(root: string, staged: ReadonlyMap<string, string>): void;
/** The model of a spec, from Quint's typed IR: gen/<name>.ts and its simulation harness. `models` receives it. */
export declare function generated(root: string, spec: Spec, ir: any, models: Map<string, Model>, staged?: Map<string, string>): Model;
/**
 * Each owner's gen/, from the root's: the modules of its specs and of every spec they import, under the root's module
 * names, with the types their drivers are written to, so that a package imports only from its own gen/. The Effect
 * adapter and the React hook are written for the owner (`writeFaces`): that is the package the service runs in.
 * A module not generated, because its spec is not valid, is not there. This ends a generation: what it did not write,
 * in the root's gen/ or an owner's, is removed, so that nothing stale survives a rename; but for gen/traces, where this
 * check's simulations write what they run (simulate.ts), still running as this does, and which the next generation
 * begins by removing.
 */
export declare function mirrorGen(root: string, specs: Spec[], scope?: {
    scratch: string;
    ownerDir: string;
}): void;
/**
 * Quint's typed IR of every spec, typechecked all at once and without blocking, or remembered: it depends only on the
 * Quint of the spec and of what it imports (action.ts). Each promise rejects with the errors of its spec. This begins a
 * generation of gen/ (`mirrorGen` ends it); gen/<name>.qnt is written for every spec, since the simulation harness
 * imports it.
 */
export declare function typecheckAll(memory: Memory, specs: Spec[], output?: string, staged?: Map<string, string>): Map<string, Promise<any>>;
/**
 * LemmaScript verifies one file at a time and does not carry definitions across
 * imports, so every unit is proved as a bundle: what it imports, then itself.
 * An imported module comes with its names prefixed by the module's name and
 * without its own obligations, which are proved once, in its own unit; that
 * keeps the cost of a proof proportional to the module, not to everything
 * beneath it. What an imported module's own unit proved (each clause of its
 * `_ensures` lemmas) is offered to the unit's proof file as a lemma; nothing
 * else of it is.
 *
 * A unit may have a proof file: spec/<name>.proof.dfy for a spec,
 * src/<path>.proof.dfy for src/<path>.ts.
 *
 * A spec that defines no type or value of its own, prose only or imports
 * only, has no unit: it gives LemmaScript and Dafny nothing to check.
 */
export declare function proofUnits(root: string, models: Model[], srcFiles?: SrcFile[]): Unit[];
/**
 * Refuse in hand-written verified code what the proof would read one way and Node another: a renamed, default or
 * namespace import, an export other than of a function, constant, type or interface declared in the file, any other
 * top-level statement (LemmaScript does not model one, though Node runs it), and a `//@` that is not in a `//`
 * comment (one in a block comment or a string is not an annotation, though it looks like one), and the names `Std` and
 * `ProofLib`, which the proof gives to Dafny's libraries. And NUL, which no source needs.
 */
export declare function checkVerifiedSource(file: string, code: string): TS.SourceFile;
/** Every proof file of the project. */
export declare const proofFiles: (root: string) => string[];
/**
 * Proof files that belong to no unit: a typo, a source file that is no longer proved, or the proof file of a spec that
 * defines nothing, which is `emptySpec`.
 */
export declare const strayProofFiles: (root: string, units: Unit[], models: Model[]) => {
    file: string;
    emptySpec: string | undefined;
}[];
