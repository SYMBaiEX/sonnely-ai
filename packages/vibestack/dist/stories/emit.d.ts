import { type Prop } from "./analyze.ts";
import { type Story } from "./variants.ts";
export type { Prop, Story };
export interface Component {
    id: string;
    name: string;
    package: string;
    title: string;
    description: string;
    source: {
        file: string;
        line: number;
    };
    props: Prop[];
    stories: Story[];
    model?: {
        spec: string;
        module: string;
        state: string;
        events: string[];
    };
    design?: string[];
    part?: string;
    children?: string[];
    citations?: {
        spec: string;
        heading: string;
    }[];
    uses?: string[];
    diagnostics: string[];
}
/** `catalog.json`. */
export interface ComponentIndex {
    version: 1;
    components: Component[];
}
export interface Options {
    /** The project: globs and paths in the catalog are relative to it. */
    root: string;
    /** Where the generated files go; `generated/stories` in the project. */
    out?: string;
    /** The most stories generated for one component. */
    cap?: number;
}
interface Result {
    index: ComponentIndex;
    written: string[];
    removed: string[];
    analyzed: number;
    diagnostics: string[];
}
export declare const outOf: (root: string) => string;
/** An undiscovered component or workspace directory that can add sources to the catalog. */
export declare const watched: (root: string, out?: string) => (file: string) => boolean;
export declare function listener(root: string, out: string | undefined, run: (observe: (file: string) => void) => void): {
    change(file?: string): void;
    close(): void;
};
/** A generator for one project. Each call brings the output up to date and says what it changed. */
export declare function generator({ root, out, cap }: Options): (observe?: (file: string) => void) => Result;
