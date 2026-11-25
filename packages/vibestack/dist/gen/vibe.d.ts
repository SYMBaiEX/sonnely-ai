/**
 * `text` is gen/<name>.ts. Every constant and function comes back under its own name from a TypeScript `module` body,
 * the one place a `.vibe` file states what a function throws: effect code may then call them bare. They throw nothing
 * the program should handle: the one exception generated code raises, a RangeError past 2^53, is a defect.
 * A state machine also gets typed failures for what `parseEvent`, `parseState` and `enabled` refuse, and a `Machine`
 * service that applies one event at a time to the state where it is kept: in memory (`machine`), in a store
 * (`stored`) or wherever the shell loads and keeps it (`machineOver`).
 */
export declare function effectAdapter(name: string, source: string, text: string, namespace: string): string;
