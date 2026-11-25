import ts from "typescript";
export interface Prop {
    name: string;
    kind: "boolean" | "number" | "string" | "union" | "function" | "node" | "object" | "array" | "unknown";
    required: boolean;
    options?: (string | number | boolean)[];
    default?: unknown;
    description?: string;
}
type Values = Record<string, unknown>;
/** A `<Component>.meta.ts(x)` as far as it can be read without running it (meta.ts, `ComponentMeta`). */
interface Meta {
    file: string;
    args: Values;
    examples: Record<string, Values>;
    states: Record<string, Values>;
    /** As written: a pair of numbers, when the file is right. */
    bounds: Values;
    /** Whether `args` holds more than was read: a spread, a computed name or a call. */
    open: boolean;
    /** The props its schema covers, when it has one. */
    schema?: string[];
    decorator: boolean;
    play: string[];
    /** Fields `ComponentMeta` does not have, which nothing reads. */
    extra: string[];
}
/** A hand-written `<Component>.stories.tsx`: its stories replace generated ones of the same name. */
interface Manual {
    file: string;
    id?: string;
    title?: string;
    exports: string[];
}
interface Model {
    spec: string;
    module: string;
    state: string;
    events: string[];
    file: string;
    prop?: string;
    initial: unknown;
}
export interface Found {
    name: string;
    file: string;
    line: number;
    description: string;
    package: string;
    props: Prop[];
    meta?: Meta;
    manual?: Manual;
    model?: Model;
    /** Why its `@model` tag gave no model: the spec it names has no generated state to show. */
    unlinked?: string;
    design: string[];
    /** The props it only inherits: declared by a library or the DOM, not in the project's source. */
    inherited: string[];
    /** The component this one only works inside, when its file is named after another of its exports. */
    part?: string;
    /** Sorted unique capitalized JSX component names rendered in this component's body. */
    children?: string[];
    /** Deduplicated spec citations found in this component's source file. */
    citations?: {
        spec: string;
        heading: string;
    }[];
    /** Sorted unique value identifiers imported from `gen/*.ts` or `gen/*.effect.vibe` in this file. */
    uses?: string[];
}
/** The package a directory belongs to: the nearest `package.json` above it. */
export declare function packageOf(dir: string, observe?: (file: string) => void): {
    name: string;
    dir: string;
};
/**
 * The generated module of `spec`: in the component's own package, or, for a shared package such as a component
 * library, in the spec's owner, else the root's (SPEC.md, "One spec tree").
 */
export declare const modelFile: (abs: string, spec: string, observe?: (file: string) => void) => string | undefined;
export declare const modelTag: (text: string) => string | undefined;
export declare const isComponentSource: (file: string) => boolean;
/** The component files the globs name, sorted: never tests, stories, metadata or anything installed. */
export declare function sources(root: string, globs: string[]): string[];
/** Plain order of text, the same on every machine. */
export declare const compare: (a: string, b: string) => number;
/** The files beside a component that change its stories, present or not: metadata, hand-written stories, its model. */
export declare function beside(abs: string, names: string[]): string[];
/**
 * Builds Programs over a project's components, their metadata and their models. Each reuses what the last
 * one parsed, so a rebuild reads only the files that changed.
 */
export type Lookup = [kind: "file" | "directory", file: string] | [kind: "manifest" | "realpath", file: string, value: string];
interface Imports {
    files: string[];
    lookups: Lookup[];
}
export declare function programs(root: string, configs: Map<string, string | undefined>, configLookups: Lookup[]): (files: string[], reset: boolean) => {
    program: ts.Program;
    imports: Map<string, Imports>;
};
/** A prop a state story needs even when the component only passes it through to its element. */
export declare const STATE: RegExp;
/** Every exported component of one file: a capitalized export that is a function returning an element. */
export declare function analyze(built: ts.Program, abs: string): Found[];
export {};
