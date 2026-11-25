import type { Input } from "./action.ts";
/** `defs` are the rule's top-level definitions and types; `locals` the names it binds inside a definition (`val x = …` in a body). */
export interface Rule {
    key: string;
    story: string;
    line: number;
    prose: string;
    code: string;
    defs: string[];
    locals: string[];
}
/** A rule's own heading, without its story. */
export declare const heading: (rule: Rule) => string;
/** A `##` heading: a story or another group of rules. Its prose is the text between the heading and its first rule. */
export interface Story {
    title: string;
    line: number;
    prose: string;
}
/**
 * One `import` of another spec: `import m.*` (star), `import m.x` (names), `import m as A` (alias), or `import m`,
 * whose names are reached only as `m::x`.
 */
export interface Import {
    module: string;
    alias?: string;
    star: boolean;
    names: string[];
}
export interface SpecReference {
    target: string;
    line: number;
}
/**
 * `tangled` is `qnt` before the list helpers were expanded, to map Quint's columns back. `code` is `qnt` as Quint reads
 * it (`codeOf`): what decides a run of Quint on `qnt`, whatever its prose, comments and layout.
 */
export interface Spec {
    name: string;
    file: string;
    preamble: string;
    references: SpecReference[];
    links: string[];
    rules: Rule[];
    stories: Story[];
    imports: string[];
    uses: Import[];
    qnt: string;
    tangled: string;
    code: string;
    builtins: string[];
}
/** The Quint a spec's module reads, its own and that of each module it imports, by the name each has in gen/. */
export declare function modules(spec: Spec, specs: Spec[], into?: Record<string, Input>): Record<string, Input>;
export declare const isStd: (file: string) => boolean;
/** Where a spec's file, or its proof file, is: in the project, or in the package for a spec from std/. */
export declare const located: (root: string, file: string) => string;
/** Why a name cannot name a spec, or undefined if it can. */
export declare function badSpecName(name: string): string | undefined;
/** The relative path gives a unique module name; a nested index names its directory. */
export declare function specName(file: string, specDir?: string): string;
/**
 * A spec is Markdown. `##` starts a story (or any grouping), `###` starts a
 * rule, and the ```quint blocks under a rule are its formal half. Tangling
 * keeps every line on its own line number, so Quint errors point into the
 * Markdown file. A fence of any other kind is prose; scan.ts reads the fences.
 */
export declare function parseSpec(root: string, file: string, text?: string, specDir?: string): Spec;
/**
 * Quint as Quint reads it: every comment it skips, prose included, and every run of space outside a string, as one
 * space, so that prose, comments and layout leave it the same; strings whole, and a `///` doc comment, which Quint reads.
 */
export declare function codeOf(text: string): string;
/**
 * Rewrite `xs.every(x => e)`, `.some`, `.listMap` and `.includes(v)` into Quint's
 * built-in `foldl`, in place and without moving a line (see LIST_HELPERS in
 * gen/print.ts for why). Strings and comments are left alone.
 */
export declare function expandListHelpers(text: string): string;
/**
 * Where a column Quint reports on an expanded line of `qnt` lies on the line as tangled: the same column before the
 * first rewrite, shifted after the last, and undefined inside a rewrite, where no column of the original matches.
 */
export declare function originalColumn(tangled: string, qnt: string, line: number, col: number): number | undefined;
/** Quint with every string and comment blanked out, line breaks kept. */
export declare const bareQuint: (text: string) => string;
/** All Markdown sources under spec/, without reading unfinished contents. */
export declare function specFiles(root: string): string[];
/** Every spec after its imports; text snapshots also support Studio's unpublished changes. */
export declare function readSpecs(root: string, texts?: Record<string, string>, ownerName?: string): Spec[];
