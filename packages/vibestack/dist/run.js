// Shared bounded execution for the Quint, TypeScript, test and proof stages.
import { spawn, spawnSync } from "node:child_process";
import { addAbortListener } from "node:events";
import fs from "node:fs";
import os, { availableParallelism } from "node:os";
import path from "node:path";
// --- running tools -------------------------------------------------------------
const WINDOWS = process.platform === "win32";
/** The most output a tool may write before it is stopped. */
const OUTPUT_LIMIT = 1 << 28;
/**
 * How much processor time a tool and what it started may use, and how long it may run before a minute in which it uses
 * none stops it: long enough that only a tool that loops or hangs is stopped, however busy the machine is.
 */
const TOOL_TIMEOUT = 60 * 60 * 1000;
/** How often a running tool's processor time is read: each minute. */
const WATCH = 60 * 1000;
const ACCOUNTING_TIMEOUT = 5_000;
/** The executable named `name` that the PATH finds first. */
export const onPath = (name) => (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)
    .flatMap((dir) => (WINDOWS ? [".exe", ".cmd", ""] : [""]).map((ext) => path.join(dir, name + ext))).find((file) => {
    try {
        fs.accessSync(file, fs.constants.X_OK);
        return fs.statSync(file).isFile();
    }
    catch {
        return false;
    }
});
/** The managed Dafny 4.11 cache directory (`~/.cache/vibestack/dafny/4.11`). */
export const cachedDafnyDir = () => path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "vibestack", "dafny", "4.11");
/** Locate Dafny on PATH first, then in the managed vibestack cache (`~/.cache/vibestack/dafny/4.11/dafny`). */
export function findDafny() {
    const fromPath = onPath("dafny");
    if (fromPath)
        return fromPath;
    const binName = WINDOWS ? "dafny.exe" : "dafny";
    const candidates = [
        path.join(cachedDafnyDir(), binName),
        path.join(os.homedir(), ".cache", "vibestack", "dafny", "4.11", binName),
    ];
    for (const candidate of candidates) {
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            if (fs.statSync(candidate).isFile())
                return candidate;
        }
        catch { /* not cached */ }
    }
    return undefined;
}
/** Write a file whole or not at all: to a file of its own beside it, then renamed into place. */
export function writeWhole(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
        fs.writeFileSync(temporary, text);
        fs.renameSync(temporary, file);
    }
    finally {
        fs.rmSync(temporary, { force: true });
    }
}
/** Format stat fields that change whenever a file or link is written again. */
export const formatStamp = (s) => `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
/** Installed files as they are: a reinstall writes them again, at a new inode, size or modification or change time, which a copy or an archive cannot set back. */
export const stamp = (files) => files.map((f) => formatStamp(fs.statSync(f, { bigint: true }))).join(" ");
/** An executable from the toolchain's dependencies, wherever npm put it: beside the tools, or in the project. */
export function findBin(cmd, root) {
    // On Windows pnpm installs a `.cmd` shim beside the extensionless shell script, and only the shim runs there.
    const name = WINDOWS ? `${cmd}.cmd` : cmd;
    for (let dir of [path.join(import.meta.dirname, ".."), root]) {
        for (;;) {
            const candidate = path.join(dir, "node_modules/.bin", name);
            if (fs.existsSync(candidate))
                return candidate;
            if (dir === path.dirname(dir))
                break;
            dir = path.dirname(dir);
        }
    }
    return undefined;
}
export function bin(cmd, root) {
    const exe = findBin(cmd, root);
    if (exe)
        return exe;
    throw new Error(`${cmd} is not installed; run pnpm install`);
}
/** `[[days-]hours:]minutes:seconds` as seconds. */
const seconds = (time = "0") => { const [days, clock] = time.includes("-") ? time.split("-") : ["0", time]; return Number(days) * 86400 + clock.split(":").reduce((sum, part) => sum * 60 + Number(part), 0); };
/** Every process as its id, its parent's, its group's and the processor seconds it has used. */
const psArgs = ["-Ao", "pid=,ppid=,pgid=,time="];
const processTable = (output) => output.trim().split("\n").filter(Boolean).map((line) => {
    const [pid, parent, group, time] = line.trim().split(/\s+/);
    return [Number(pid), Number(parent), Number(group), seconds(time)];
});
function processes() {
    if (WINDOWS)
        return [];
    const snapshot = spawnSync("ps", psArgs, { encoding: "utf8", timeout: ACCOUNTING_TIMEOUT, killSignal: "SIGKILL" });
    return snapshot.status === 0 && !snapshot.error ? processTable(snapshot.stdout) : [];
}
async function readCounters(command, args, stopSignal) {
    if (stopSignal.aborted)
        return "";
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn(command, args, { detached: !WINDOWS, stdio: ["ignore", "pipe", "pipe"] });
        }
        catch {
            resolve("");
            return;
        }
        endsWithTheCheck(child, "SIGKILL");
        const chunks = [];
        let stdoutBytes = 0, stderrBytes = 0, finished = false;
        const finish = (value) => {
            if (finished)
                return;
            finished = true;
            cancellation[Symbol.dispose]();
            chunks.length = 0;
            child.stdout?.destroy();
            child.stderr?.destroy();
            resolve(value);
        };
        const stop = () => {
            if (finished)
                return;
            finish("");
            signal(child, "SIGKILL");
            child.unref();
        };
        child.stdout?.on("data", (chunk) => {
            if (finished)
                return;
            stdoutBytes += chunk.length;
            if (stdoutBytes > 1 << 20)
                stop();
            else
                chunks.push(chunk);
        });
        child.stderr?.on("data", (chunk) => {
            if (finished)
                return;
            stderrBytes += chunk.length;
            if (stderrBytes > 1 << 20)
                stop();
        });
        child.on("error", stop);
        child.once("close", (code) => finish(code === 0 ? Buffer.concat(chunks).toString("utf8") : ""));
        const cancellation = addAbortListener(stopSignal, stop);
    });
}
/** The processes in `table` that `child` started, itself included. */
function startedBy(child, table) {
    const started = new Set([child.pid]);
    const ordered = table.filter(([pid]) => pid === child.pid);
    for (let grew = true; grew;) {
        grew = false;
        for (const row of table) {
            const [pid, parent] = row;
            if (!started.has(parent) || started.has(pid))
                continue;
            started.add(pid);
            ordered.push(row);
            grew = true;
        }
    }
    return ordered;
}
const darwinCpu = `ObjC.import("Foundation");
ObjC.bindFunction("proc_pid_rusage", ["int", ["int", "int", "void *"]]);
ObjC.bindFunction("mach_timebase_info", ["int", ["void *"]]);
function run(pids) {
  const clock = $.NSMutableData.dataWithLength(8), usage = $.NSMutableData.dataWithLength(144);
  if ($.mach_timebase_info(clock.mutableBytes) !== 0) throw Error("mach_timebase_info failed");
  return [ObjC.unwrap(clock.base64EncodedStringWithOptions(0)), ...pids.map(pid =>
    $.proc_pid_rusage(Number(pid), 1, usage.mutableBytes) === 0 ? ObjC.unwrap(usage.base64EncodedStringWithOptions(0)) : "-"
  )].join("\\n");
}`;
let linuxTicksPerSecond;
async function cpuCounters(pids, table, signal) {
    const readings = new Map();
    if (!pids.length)
        return readings;
    if (process.platform === "darwin") {
        const output = await readCounters("/usr/bin/osascript", ["-l", "JavaScript", "-e", darwinCpu, ...pids.map(String)], signal);
        const [first, ...rows] = output.trim().split("\n");
        const clock = Buffer.from(first, "base64");
        if (clock.length !== 8 || !clock.readUInt32LE(4) || rows.length !== pids.length)
            return readings;
        const secondsPerTick = clock.readUInt32LE(0) / clock.readUInt32LE(4) / 1e9;
        for (const [index, row] of rows.entries()) {
            const usage = Buffer.from(row, "base64");
            if (usage.length !== 144)
                continue;
            const own = usage.readBigUInt64LE(16) + usage.readBigUInt64LE(24);
            const reaped = usage.readBigUInt64LE(96) + usage.readBigUInt64LE(104);
            readings.set(pids[index], Number(own + reaped) * secondsPerTick);
        }
    }
    else if (process.platform === "linux") {
        if (linuxTicksPerSecond === undefined) {
            const rate = Number(await readCounters("getconf", ["CLK_TCK"], signal));
            if (!(rate > 0))
                return readings;
            linuxTicksPerSecond = rate;
        }
        const rate = linuxTicksPerSecond;
        for (const pid of pids) {
            try {
                const stat = await fs.promises.readFile(`/proc/${pid}/stat`, { encoding: "utf8", signal });
                const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
                const ticks = fields.slice(11, 15).map(Number);
                if (ticks.length === 4 && ticks.every(Number.isFinite))
                    readings.set(pid, ticks.reduce((sum, n) => sum + n, 0) / rate);
            }
            catch {
                continue;
            }
        }
    }
    else {
        for (const [pid, , , time] of table)
            readings.set(pid, time);
    }
    return readings;
}
export async function toolCpuSeconds(children, signal) {
    const deadline = AbortSignal.timeout(WATCH);
    const observation = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const table = processTable(await readCounters("ps", psArgs, observation));
    const trees = children.map(child => {
        const leader = child.exitCode === null && child.signalCode === null ? child.pid : undefined;
        const rows = leader === undefined ? table.filter(([, , group]) => group === child.pid) : startedBy(child, table);
        return { leader, pids: rows.map(([pid]) => pid) };
    });
    const counters = await cpuCounters([...new Set(trees.flatMap(tree => tree.pids))], table, observation);
    return trees.map(({ leader, pids }) => {
        if (leader !== undefined && !counters.has(leader))
            return undefined;
        const known = new Map();
        let seconds = 0, lowerBound = 0;
        for (const pid of pids) {
            const used = counters.get(pid);
            if (used === undefined)
                continue;
            known.set(pid, used);
            seconds += used;
            lowerBound = Math.max(lowerBound, used);
        }
        if (!known.size)
            return undefined;
        if (leader !== undefined && known.size === pids.length)
            return { seconds, complete: true };
        return { seconds: lowerBound, complete: false, known };
    });
}
const watched = new Map();
let watchTimer;
let polling;
function watchCpu(child, check) {
    watched.set(child, check);
    watchTimer ??= setInterval(async () => {
        if (polling)
            return;
        const cycle = new AbortController();
        polling = cycle;
        try {
            const jobs = [...watched];
            const children = jobs.map(([job]) => job);
            const readings = WINDOWS ? [] : await toolCpuSeconds(children, cycle.signal);
            let confirmed;
            let table;
            const cleanupTable = () => table ??= processes();
            await Promise.all(jobs.flatMap(([job, report], index) => watched.has(job) ? [report(readings[index], {
                    confirm: async () => (await (confirmed ??= toolCpuSeconds(children, cycle.signal)))[index],
                    cleanupTable,
                })] : []));
        }
        finally {
            polling = undefined;
        }
    }, WATCH);
    return () => {
        watched.delete(child);
        if (!watched.size) {
            polling?.abort();
            clearInterval(watchTimer);
            watchTimer = undefined;
        }
    };
}
/** Signal the process group of `child`, and of each process in `table` that it started: a browser leaves the group of the tool that started it. */
function signal(child, name, table = []) {
    const own = table.find(([pid]) => pid === process.pid)?.[2];
    const groups = new Set([child.pid, ...startedBy(child, table).flatMap(([, , group]) => group === own ? [] : [group])]);
    for (const group of groups) {
        try {
            if (!WINDOWS && group)
                process.kill(-group, name);
            else
                child.kill(name);
        }
        catch { /* already exited */ }
    }
}
/** How each tool still running is ended: an interrupted check ends them and what they started before it ends itself, and so does one that exits. A tool is asked to end, so that one that is a check ends its own tools; a shell command is killed. */
const ending = new Map();
const endAll = () => {
    polling?.abort();
    const table = ending.size ? processes() : [];
    for (const [child, name] of ending)
        signal(child, name, table);
};
process.once("exit", endAll);
for (const name of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.once(name, () => { endAll(); process.kill(process.pid, name); });
function endsWithTheCheck(child, name) {
    ending.set(child, name);
    for (const over of ["close", "error"])
        child.once(over, () => ending.delete(child));
}
export function startAttached(exe, args, cwd) {
    const child = spawn(exe, args, { cwd, stdio: "inherit", detached: !WINDOWS });
    endsWithTheCheck(child, "SIGTERM");
    return child;
}
const SLOTS = availableParallelism();
let busy = 0;
const waiting = [new Set(), new Set(), new Set()];
const abortedTables = new WeakMap();
function waitForSlot(signal, priority) {
    const queue = waiting[priority];
    return new Promise((settle) => {
        const grant = () => {
            subscription?.[Symbol.dispose]();
            settle(true);
        };
        const subscription = signal && addAbortListener(signal, () => {
            if (queue.delete(grant))
                settle(false);
        });
        queue.add(grant);
    });
}
function releaseSlot() {
    for (const queue of waiting) {
        for (const next of queue) {
            queue.delete(next);
            next();
            return;
        }
    }
    busy--;
}
/**
 * Run a program to the end, once fewer than SLOTS are running, and return what it wrote. One that cannot be started
 * is an error; one that writes too much, runs too long or is killed by a signal is stopped, and `stopped` says so.
 */
export async function exec(exe, args, cwd, env, input, cancellation, priority = 1) {
    const canceled = { status: -1, stdout: "", stderr: "", stopped: "proof work was canceled after simulation failed" };
    if (cancellation?.aborted)
        return canceled;
    if (busy < SLOTS)
        busy++;
    else if (!await waitForSlot(cancellation, priority))
        return canceled;
    // On Windows anything but an .exe (an npm .cmd shim, or a name on the PATH) needs a shell, which reads each argument quoted for cmd.exe.
    const shell = WINDOWS && !/\.exe$/i.test(exe);
    const quote = (a) => (shell && (a === "" || /[\s"&|<>^%()!,;=]/.test(a)) ? `"${a.replace(/"/g, '""')}"` : a);
    const name = path.basename(exe).replace(/\.cmd$/, "");
    const started = Date.now();
    let unwatch;
    let unabort;
    try {
        if (cancellation?.aborted)
            return canceled;
        return await new Promise((resolve, reject) => {
            const child = spawn(quote(exe), args.map(quote), { cwd, env, shell, detached: !WINDOWS });
            endsWithTheCheck(child, "SIGTERM");
            const output = { stdout: "", stderr: "" };
            let stopped;
            const stop = (why, table = processes()) => {
                stopped ??= `${name} ${why} and was stopped`;
                signal(child, "SIGKILL", table);
                child.stdout.destroy();
                child.stderr.destroy();
            };
            if (cancellation && !WINDOWS)
                unabort = addAbortListener(cancellation, () => {
                    let table = abortedTables.get(cancellation);
                    if (!table)
                        abortedTables.set(cancellation, table = processes());
                    stop("was canceled after simulation failed", table);
                });
            const minutes = TOOL_TIMEOUT / 60_000;
            let lastComplete;
            let observedAt = started;
            const partialHigh = new Map();
            const observe = (sample, now) => {
                if (!sample)
                    return;
                if (sample.complete) {
                    observedAt = now;
                    partialHigh.clear();
                }
                else {
                    for (const [pid, used] of sample.known) {
                        const previous = partialHigh.get(pid);
                        if (previous === undefined || used > previous) {
                            partialHigh.set(pid, used);
                            if (previous !== undefined)
                                observedAt = now;
                        }
                    }
                }
            };
            unwatch = watchCpu(child, async (reading, retry) => {
                const now = Date.now(), ran = now - started;
                const sample = WINDOWS ? { seconds: ran / 1000, complete: true } : reading;
                observe(sample, now);
                if (!sample?.complete)
                    lastComplete = undefined;
                else if (lastComplete?.seconds !== sample.seconds)
                    lastComplete = { seconds: sample.seconds, since: now };
                const over = (sample?.seconds ?? 0) * 1000 > TOOL_TIMEOUT;
                const idle = ran > TOOL_TIMEOUT && lastComplete !== undefined && now - lastComplete.since >= WATCH;
                if (!over && !idle && now - observedAt <= TOOL_TIMEOUT)
                    return;
                const confirmed = WINDOWS ? sample : await retry.confirm();
                if (!watched.has(child))
                    return;
                observe(confirmed, Date.now());
                if (over && confirmed && confirmed.seconds * 1000 > TOOL_TIMEOUT)
                    stop(`used more than ${minutes} minutes of processor time`, retry.cleanupTable());
                else if (idle && confirmed?.complete && confirmed.seconds === sample?.seconds)
                    stop(`ran for more than ${minutes} minutes, the last minute without the processor,`, retry.cleanupTable());
                else if (Date.now() - observedAt > TOOL_TIMEOUT)
                    stop(`had no complete processor accounting or measurable progress for ${minutes} minutes`, retry.cleanupTable());
            });
            for (const stream of ["stdout", "stderr"])
                child[stream].setEncoding("utf8").on("data", (chunk) => {
                    if (output[stream].length > OUTPUT_LIMIT)
                        return;
                    output[stream] += chunk;
                    if (output[stream].length > OUTPUT_LIMIT)
                        stop(`wrote more than ${OUTPUT_LIMIT / 2 ** 20} MB of output`);
                });
            child.once("error", reject);
            child.once("exit", (_, by) => { if (by)
                signal(child, "SIGKILL"); });
            child.once("close", (code, by) => {
                unabort?.[Symbol.dispose]();
                unabort = undefined;
                resolve({ status: code ?? -1, ...output, stopped: stopped ?? (by ? `${name} was killed by ${by} after ${Math.round((Date.now() - started) / 1000)} s` : undefined) });
            });
            // A tool may exit before reading its input; its exit status still reports the failure.
            if (input !== undefined) {
                child.stdin.on("error", () => { });
                child.stdin.end(input);
            }
        });
    }
    finally {
        unabort?.[Symbol.dispose]();
        unwatch?.();
        releaseSlot();
    }
}
/** A shell command in a process group of its own, so that stopping it stops what it started too; `stop` waits until it has closed. */
export function startGroup(command, cwd, env) {
    const child = spawn(command, { cwd, env, shell: true, detached: !WINDOWS, stdio: ["pipe", "pipe", "pipe"] });
    const closed = new Promise((resolve) => child.on("close", () => resolve()));
    endsWithTheCheck(child, "SIGKILL");
    const stop = async () => { signal(child, "SIGTERM"); const timer = setTimeout(() => signal(child, "SIGKILL"), 5000); await closed; clearTimeout(timer); };
    return { child, closed, stop };
}
/** What the proof stage needs installed. */
export const NEEDS_DAFNY = "the proof stage needs Dafny 4.11 on PATH or installed via `vibestack doctor --install-dafny`: https://github.com/dafny-lang/dafny/releases";
/** Run a tool from the toolchain, or Dafny, and return whether it succeeded and all it wrote. */
export async function run(cmd, args, cwd, input) {
    const exe = cmd === "dafny" ? (findDafny() ?? cmd) : bin(cmd, cwd);
    const r = await exec(exe, args, cwd, undefined, input).catch((e) => {
        throw new Error(`${cmd} could not be run (${exe}): ${e.message}${cmd === "dafny" ? `; ${NEEDS_DAFNY}` : "; run pnpm install"}`);
    });
    return { ok: r.status === 0 && !r.stopped, out: `${r.stdout}${r.stderr}${r.stopped ? `\n${r.stopped}\n` : ""}`, status: r.status, stderr: r.stderr };
}
