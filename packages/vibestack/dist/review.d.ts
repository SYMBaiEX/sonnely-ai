import { type Spec, type Story, type Rule } from "./parse.ts";
/**
 * Obligations that hold in simulation but that Dafny cannot prove on its own,
 * accepted by a person: per unit, the list, and a fingerprint of the unit's
 * Quint, without its comments, and proof file when they were accepted. A list
 * accepted for another text no longer counts.
 */
export interface Accepted {
    text: string;
    unproved: string[];
}
export interface ReviewLock {
    version: 1;
    specs: Record<string, Lock>;
    contracts: Record<string, string>;
    unproved: Record<string, Accepted>;
}
export declare const ledgerFile: (root: string) => string;
export type ReviewSpec = Pick<Spec, "file" | "name" | "preamble" | "rules" | "stories" | "uses">;
/** One versioned ledger owns review and proof acceptance for the entire spec tree. A check reads it once and passes it on. */
export declare function readReviewLock(root: string): ReviewLock;
/** The names a rule's Quint defines: its definitions and types, and the variants of its sum types. */
export declare function defines(rule: Rule): string[];
/** A rule whose Quint another rule's Quint relies on, and the names it is relied on for. */
interface Dependency {
    spec: ReviewSpec;
    rule: Rule;
    names: Set<string>;
}
/**
 * The rules whose Quint `rule` relies on, directly or through others, in its own spec and in the specs it imports.
 * A bare name is looked up first in the spec that mentions it, then in the specs that one imports with `.*` or by that
 * name; `A::n` only in the spec imported as `A` (or, if no import is called `A`, as a bare name would be). The scan is
 * conservative: an identifier that happens to share a definition's name counts as a use of it.
 */
export declare function dependencies(spec: ReviewSpec, rule: Rule, specs: readonly ReviewSpec[]): Dependency[];
/**
 * Something a person has to reconcile before the spec can be accepted. `lines` are a story's rules, or a contract's
 * `//@` lines; `cited` is where code cites a changed rule, to read again against it.
 */
export interface Pending {
    where: string;
    rule?: Rule;
    story?: Story;
    lines?: string[];
    status: keyof typeof ASKS;
    note?: string;
    cited?: string[];
}
declare const ASKS: {
    "document changed": string;
    "story has no rules": string;
    "new story": string;
    "story changed": string;
    "not formalized": string;
    new: string;
    "prose and model both changed": string;
    "prose changed": string;
    "model changed": string;
    "removed or renamed": string;
    "new contract": string;
    "contract changed": string;
    "contract removed": string;
};
export declare const showPending: (p: Pending) => string;
export type Lock = Record<string, string[]>;
/** The ledger key an item to reconcile is recorded under. */
export declare const pendingKey: (p: Pending) => string;
export declare function citationLookup(root: string): (file: string, title: string) => string[];
/**
 * Stories and rules to reconcile since `accept`. A rule's model is its own Quint and that of every rule it relies
 * on (see `dependencies`), so a change to a helper, a type or an imported definition flags every rule that uses it.
 */
export declare function pending(root: string, spec: ReviewSpec, specs?: readonly ReviewSpec[], locks?: Map<string, Lock>, citedAt?: (file: string, title: string) => string[]): Pending[];
/** Record one spec while preserving the rest of the central ledger. */
export declare function acceptReviews(root: string, spec: Spec, specs?: Spec[]): void;
/** Deleted specs remain reviewable until the whole snapshot is accepted. */
export declare function pendingSpecs(root: string, specs: readonly ReviewSpec[], lock?: ReviewLock): Pending[];
/**
 * Atomically record the exact spec and source snapshot checked by accept. Every spec, std/ libraries included, is what
 * a rule's dependencies are fingerprinted against, as `pending` does; only the project's own specs are recorded.
 */
export declare function acceptAllReviews(root: string, specs: Spec[], src?: import("./util.ts").SrcFile[], lock?: ReviewLock): void;
/** The contract of every proved src file, under its path from the root: `src/x.ts`, or `apps/app/src/x.ts` in an owner. */
export declare const contracts: (root: string, src?: import("./util.ts").SrcFile[]) => Map<string, string[]>;
/** The `//@` contracts in src/ that are new, changed or gone since `accept`. A file that loses every `//@` is gone. */
export declare function pendingContracts(root: string, src?: import("./util.ts").SrcFile[], { contracts: lock }?: ReviewLock): Pending[];
/** Record the `//@` contract of every proved src file as reconciled. */
export declare function acceptContracts(root: string, src?: import("./util.ts").SrcFile[]): void;
/**
 * Both halves of every rule that has moved, the text and rules of every story that has, and the lines of every new or
 * changed contract, so that whoever reconciles them compares rather than guesses.
 */
export declare const moved: (todo: Pending[]) => string[];
export declare function writeLedger(root: string, ledger: Record<string, Accepted>, lock?: ReviewLock): void;
export {};
