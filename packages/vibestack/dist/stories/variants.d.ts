import { type Found } from "./analyze.ts";
export interface Story {
    id: string;
    name: string;
    kind: "default" | "prop" | "state" | "example" | "model";
    args: Record<string, unknown>;
}
/** A story as the generated file writes it: `args` is source text. */
/** `refuses`: the story renders the component disabled or loading, so its generated `play` checks nothing it was handed fires. */
interface Planned {
    export: string;
    args: string;
    play?: string;
    refuses: boolean;
}
export interface Plan {
    id: string;
    title: string;
    base: string;
    samples: number;
    stories: Planned[];
    catalog: Story[];
    diagnostics: string[];
}
export declare function plan(c: Found, cap: number): Plan;
export {};
