import { type Memory } from "./cache.ts";
/** A file a tool reads: its text, and what of the text decides the run, which is what the run is remembered under. */
export interface Input {
    text: string;
    key: string;
}
/** What a run of a tool said: its exit status, all it wrote to the terminal, and every file it wrote beside its inputs. */
export interface Ran {
    ok: boolean;
    status: number;
    out: string;
    stderr: string;
    stopped?: string;
    files: Record<string, string>;
}
/** Whether Quint ended a simulation by finding a state that breaks the invariant: its last word, never its output. */
export declare const violated: (r: Pick<Ran, "status" | "stderr">) => boolean;
/** Whether a simulation reached its answer: the invariant held or broke, and its traces are written. */
export declare const completed: (r: Ran) => boolean;
declare const TOOLS: {
    quint: {
        launcher: "quint";
        answered: (args: string[], r: Ran) => boolean;
    };
    simulator: {
        launcher: "quint";
        script: string;
        answered: (args: string[], r: Ran) => boolean;
    };
    lsc: {
        launcher: "lsc";
        answered: (_args: string[], r: Ran) => boolean;
    };
    dafny: {
        answered: (args: string[], r: Ran) => boolean;
    };
};
/**
 * Run a tool with `args` in `dir`, a directory of the project or an absolute one, made anew with only `files` in it, or
 * say what the same run said before. A run is remembered under the program, the arguments and what decides each file,
 * and the code of this file and run.ts: a change elsewhere in these tools runs the tool again only where it changes
 * what the tool reads, and a file left out of `files` is one the tool cannot find. Only a run that reached its answer
 * is remembered, and not when the program was installed again during the run; a process that outlives a reinstall
 * names the program installed now.
 */
export declare function act(memory: Memory, tool: keyof typeof TOOLS, args: string[], dir: string, files: Record<string, Input>): Promise<Ran>;
export {};
