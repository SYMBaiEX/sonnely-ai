import { type ChildProcess } from "node:child_process";
import fs from "node:fs";
/** The executable named `name` that the PATH finds first. */
export declare const onPath: (name: string) => string | undefined;
/** The managed Dafny 4.11 cache directory (`~/.cache/vibestack/dafny/4.11`). */
export declare const cachedDafnyDir: () => string;
/** Locate Dafny on PATH first, then in the managed vibestack cache (`~/.cache/vibestack/dafny/4.11/dafny`). */
export declare function findDafny(): string | undefined;
/** Write a file whole or not at all: to a file of its own beside it, then renamed into place. */
export declare function writeWhole(file: string, text: string | Uint8Array): void;
/** Format stat fields that change whenever a file or link is written again. */
export declare const formatStamp: (s: fs.BigIntStats) => string;
/** Installed files as they are: a reinstall writes them again, at a new inode, size or modification or change time, which a copy or an archive cannot set back. */
export declare const stamp: (files: string[]) => string;
/** An executable from the toolchain's dependencies, wherever npm put it: beside the tools, or in the project. */
export declare function findBin(cmd: string, root: string): string | undefined;
export declare function bin(cmd: string, root: string): string;
type CpuReading = {
    seconds: number;
    complete: true;
} | {
    seconds: number;
    complete: false;
    known: Map<number, number>;
};
export declare function toolCpuSeconds(children: ChildProcess[], signal?: AbortSignal): Promise<(CpuReading | undefined)[]>;
export declare function startAttached(exe: string, args: string[], cwd: string): ChildProcess;
/** How many programs run at once; the others wait for one to end, higher priority first. */
type Priority = 0 | 1 | 2;
/**
 * Run a program to the end, once fewer than SLOTS are running, and return what it wrote. One that cannot be started
 * is an error; one that writes too much, runs too long or is killed by a signal is stopped, and `stopped` says so.
 */
export declare function exec(exe: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv, input?: string, cancellation?: AbortSignal, priority?: Priority): Promise<{
    status: number;
    stdout: string;
    stderr: string;
    stopped?: string;
}>;
/** A shell command in a process group of its own, so that stopping it stops what it started too; `stop` waits until it has closed. */
export declare function startGroup(command: string, cwd: string, env?: NodeJS.ProcessEnv): {
    child: import("node:child_process").ChildProcessWithoutNullStreams;
    closed: Promise<void>;
    stop: () => Promise<void>;
};
/** What the proof stage needs installed. */
export declare const NEEDS_DAFNY = "the proof stage needs Dafny 4.11 on PATH or installed via `vibestack doctor --install-dafny`: https://github.com/dafny-lang/dafny/releases";
/** Run a tool from the toolchain, or Dafny, and return whether it succeeded and all it wrote. */
export declare function run(cmd: string, args: string[], cwd: string, input?: string): Promise<{
    ok: boolean;
    out: string;
    status: number;
    stderr: string;
}>;
export {};
