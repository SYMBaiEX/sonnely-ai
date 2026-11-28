import { AsyncLocalStorage } from "node:async_hooks";
import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync, zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { cacheDirectory } from "./config.js";
import { sha, tokenize } from "./util.js";
import { installedEvaluator, executableDigest, InstallationChanged, LASTING, lasting, packageLocation, packageRoots } from "./installed.js";
import { findBin, findDafny, formatStamp, writeWhole } from "./run.js";
import { cacheCredentials, fileStamp, findVibelangBinary, packageVersion, parseStamps, readDafnyIdentity, readDafnyInstallation, readDafnyVersion, resolveSolver, sameFiles, sameParsed, solverCandidates, solverStamp, } from "./toolchain.js";
export { cacheCredentials, executableDigest };
const hashFileBytes = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const checking = new AsyncLocalStorage();
export const inSteadyCheck = () => !!checking.getStore();
const MAX_PENDING_ENTRIES = 64;
const MAX_PENDING_BYTES = 32 * 1024 ** 2;
const PUBLISH_INTERVAL_MS = 15_000;
function pendingLimit(check) {
    return check.pending.size + check.pendingDafny.size >= MAX_PENDING_ENTRIES || check.bytes + check.dafnyBytes >= MAX_PENDING_BYTES;
}
function includePrograms(check) {
    for (const program of check.programs.values())
        if (program?.id)
            check.verify.add(program);
    for (const evaluator of check.evaluators.values())
        check.verify.add(evaluator);
}
function resetPending(check) {
    check.pending.clear();
    check.pendingDafny.clear();
    check.verify.clear();
    check.dafnyBytes = 0;
    check.bytes = 0;
}
function verifyPrograms(check, complete) {
    if (complete)
        includePrograms(check);
    const replaced = [...check.verify].some((tool) => !tool.unchanged());
    if (!replaced && !check.changed)
        return true;
    check.changed = true;
    resetPending(check);
    if (replaced)
        throw new InstallationChanged();
    return false;
}
function publishChecked() {
    const check = checking.getStore();
    if (!check || !verifyPrograms(check, false) || !check.pending.size)
        return;
    for (const [file, bytes] of check.pending)
        writeWhole(file, bytes);
    check.pending.clear();
    check.verify.clear();
    check.bytes = 0;
    check.lastPublished = performance.now();
}
function publishDafny(check) {
    if (!verifyPrograms(check, true))
        return;
    const installed = check.installation;
    if ((installed && (installed.files ? !installed.unchanged() : checking.exit(installation).at !== installed.at))
        || (check.solverAt !== undefined && solverStamp(solverCandidates()) !== check.solverAt)) {
        check.changed = true;
        resetPending(check);
        throw new InstallationChanged();
    }
    for (const [file, bytes] of check.pendingDafny)
        writeWhole(file, bytes);
    check.pendingDafny.clear();
    check.dafnyBytes = 0;
}
export function certifyInstallation() {
    const check = checking.getStore();
    if (!check)
        return;
    publishDafny(check);
    if (check.changed)
        throw new InstallationChanged();
    for (const [file, bytes] of check.pending)
        writeWhole(file, bytes);
    resetPending(check);
    check.certified = true;
}
function installation() {
    const scope = checking.getStore();
    return scope ? (scope.installation ??= readDafnyInstallation()) : readDafnyInstallation();
}
/** Run a check, which reads Dafny's installation once: its final certification checks that installation even after a wholly warm run. */
export const steady = (run) => {
    const check = { programs: new Map(), evaluators: new Map(), cacheDirs: new Map(), pending: new Map(), pendingDafny: new Map(), verify: new Set(), touched: new Set(), bytes: 0, dafnyBytes: 0, lastPublished: -Infinity };
    return checking.run(check, async () => {
        try {
            const result = await run();
            if (!check.certified)
                certifyInstallation();
            return result;
        }
        finally {
            check.closed = true;
            resetPending(check);
        }
    });
};
export async function withStableInstallation(attempt) {
    for (let retries = 0;; retries++) {
        try {
            return await steady(attempt);
        }
        catch (error) {
            if (!(error instanceof InstallationChanged) || retries === 2)
                throw error;
        }
    }
}
function perCheck(read) {
    const known = new WeakMap();
    return () => {
        const scope = checking.getStore();
        if (!scope)
            return read();
        let result = known.get(scope);
        if (!result)
            known.set(scope, result = read().catch((e) => { known.delete(scope); throw e; }));
        return result;
    };
}
const TOOL_PACKAGES = { quint: "@informalsystems/quint", lsc: "lemmascript" };
const packageName = (name) => /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name);
const NODE_FLAGS = ["NODE_OPTIONS", "NODE_PRESERVE_SYMLINKS", "NODE_PRESERVE_SYMLINKS_MAIN"];
const nodeFlags = () => JSON.stringify(NODE_FLAGS.map((name) => process.env[name] ?? ""));
const latest = new Map();
function virtualStore(dir) {
    for (let at = dir; at !== path.dirname(at); at = path.dirname(at))
        if (path.basename(at) === ".pnpm")
            return at;
    return undefined;
}
function pnpmSearchPaths(from, store) {
    const paths = [];
    for (let dir = from; dir.startsWith(store + path.sep) || dir === store; dir = path.dirname(dir)) {
        if (path.basename(dir) !== "node_modules")
            paths.push(path.join(dir, "node_modules"));
    }
    return paths;
}
function shimNode(exe, text, observe) {
    const windows = process.platform === "win32";
    const guard = windows ? '@IF EXIST "%~dp0\\node.exe" (' : 'if [ -x "$basedir/node" ]; then';
    const adjacentCall = windows ? /^  "%~dp0\\node\.exe" /m : /^  exec "\$basedir\/node" /m;
    const pathCall = windows ? /^  node /m : /^  exec node /m;
    if (!text.split(/\r?\n/).includes(guard) || !adjacentCall.test(text) || !pathCall.test(text) || /^ *(?:export |@SET "?)?PATH=/im.test(text))
        return undefined;
    const executable = (file) => {
        if (!observe(file))
            return false;
        if (windows)
            return true;
        try {
            fs.accessSync(file, fs.constants.X_OK);
            return true;
        }
        catch {
            return false;
        }
    };
    const adjacent = path.join(path.dirname(exe), windows ? "node.exe" : "node");
    let chosen = executable(adjacent) ? adjacent : undefined;
    if (!chosen) {
        // cmd.exe also searches the spawned working directory and PATHEXT.
        if (windows)
            return undefined;
        for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
            if (!path.isAbsolute(dir))
                return undefined;
            const candidate = path.join(dir, "node");
            if (executable(candidate)) {
                chosen = candidate;
                break;
            }
        }
    }
    if (!chosen)
        return undefined;
    const resolved = fs.realpathSync(chosen);
    return resolved === fs.realpathSync(process.execPath) && observe(resolved) ? executableDigest(resolved) : undefined;
}
const PNPM_SHIM = [
    "#!/bin/sh",
    "basedir=$(dirname \"$(echo \"$0\" | sed -e 's,\\\\,/,g')\")",
    "",
    "case `uname` in",
    "    *CYGWIN*|*MINGW*|*MSYS*)",
    "        if command -v cygpath > /dev/null 2>&1; then",
    "            basedir=`cygpath -w \"$basedir\"`",
    "        fi",
    "    ;;",
    "esac",
    "",
    "if [ -z \"$NODE_PATH\" ]; then",
    "  export NODE_PATH=\"<paths>\"",
    "else",
    "  export NODE_PATH=\"<paths>\"",
    "fi",
    "if [ -x \"$basedir/node\" ]; then",
    "  exec \"$basedir/node\"  \"$basedir/<entry>\" \"$@\"",
    "else",
    "  exec node  \"$basedir/<entry>\" \"$@\"",
    "fi",
].join("\n") + "\n";
function launcherInputs(exe, packageDir, exists) {
    const launcher = fs.realpathSync(exe);
    if (path.basename(path.dirname(launcher)) !== ".bin" || NODE_FLAGS.some((name) => process.env[name]))
        return undefined;
    const bytes = fs.readFileSync(launcher);
    if (!isUtf8(bytes))
        return undefined;
    const store = virtualStore(packageDir);
    const text = bytes.toString("utf8").replaceAll("\r\n", "\n");
    if (!store)
        return undefined;
    const node = shimNode(exe, text, exists);
    if (node === undefined)
        return undefined;
    const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
    const name = path.basename(exe).replace(/\.cmd$/i, "");
    const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[name];
    if (typeof bin !== "string")
        return undefined;
    const entry = path.resolve(packageDir, bin);
    const relativeEntry = path.relative(packageDir, entry);
    if (path.isAbsolute(relativeEntry) || relativeEntry.split(path.sep).includes("..") || !exists(entry) || !fs.statSync(entry).isFile())
        return undefined;
    const resolvedEntry = path.relative(packageDir, fs.realpathSync(entry));
    if (path.isAbsolute(resolvedEntry) || resolvedEntry.split(path.sep).includes(".."))
        return undefined;
    const normalized = [];
    for (const line of text.split("\n")) {
        if (/^  export NODE_PATH="[^"\r]*"$/.test(line))
            normalized.push('  export NODE_PATH="<paths>"');
        else {
            const call = /^(  exec (?:"\$basedir\/node"|node)  "\$basedir\/)([^"$`\r\n]+)(" "\$@")$/.exec(line);
            if (!call)
                normalized.push(line);
            else {
                const called = path.resolve(path.dirname(exe), call[2]);
                if (!exists(called) || fs.realpathSync(called) !== fs.realpathSync(entry))
                    return undefined;
                normalized.push(`${call[1]}<entry>${call[3]}`);
            }
        }
    }
    if (normalized.join("\n") !== PNPM_SHIM)
        return undefined;
    const known = new Set(pnpmSearchPaths(bin ? path.dirname(path.resolve(packageDir, bin)) : packageDir, store));
    const lines = [node, path.relative(packageDir, entry)];
    for (const [index, line] of text.split("\n").entries()) {
        const assignment = /^( *export NODE_PATH="| *@SET "NODE_PATH=)([^"\r]*)("\r?)$/.exec(line);
        if (!assignment) {
            if (/\bNODE_PATH\s*=/.test(line))
                return undefined;
            lines.push(JSON.stringify(normalized[index]));
            continue;
        }
        const [, before, paths, after] = assignment;
        const relative = [];
        for (const entry of paths.split(before.includes("export") ? ":" : ";")) {
            if (entry === "$NODE_PATH" || entry === "%NODE_PATH%")
                relative.push(entry);
            else if (known.has(entry) && (path.dirname(entry) === packageDir || !entry.startsWith(packageDir + path.sep) || !exists(entry))) {
                relative.push([path.relative(store, entry)]);
            }
            else
                return undefined;
        }
        lines.push(JSON.stringify([before, relative, after]));
    }
    return { digest: sha(...lines), entry };
}
const isStamps = (value) => Array.isArray(value) && value.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && typeof entry[1] === "string");
function readProgram(index, key) {
    try {
        const data = JSON.parse(zstdDecompressSync(fs.readFileSync(index)).toString("utf8"));
        if (!Array.isArray(data))
            return undefined;
        const [saved, id, sourceFiles, sourceLinks, isolated, isolatedFiles, isolatedLinks] = data;
        if (saved !== key || typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id) || !isStamps(sourceFiles) || !sourceFiles.length || !isStamps(sourceLinks))
            return undefined;
        if (!isStamps(isolatedFiles) || !isStamps(isolatedLinks))
            return undefined;
        const programsRoot = path.join(path.dirname(LASTING), "programs") + path.sep;
        if (typeof isolated !== "object" || !isolated || typeof isolated.entry !== "string" || typeof isolated.script !== "string"
            || ![isolated.entry, isolated.script].every((file) => file.startsWith(programsRoot) && isolatedFiles.some(([observed]) => observed === file)))
            return undefined;
        const parsedSourceFiles = parseStamps(sourceFiles);
        const parsedSourceLinks = parseStamps(sourceLinks);
        const unchangedSource = () => sameParsed(parsedSourceFiles, true) && sameParsed(parsedSourceLinks, false);
        if (!unchangedSource() || !fs.existsSync(isolated.entry) || !fs.existsSync(isolated.script))
            return undefined;
        let parsedIsolatedFiles;
        let parsedIsolatedLinks;
        const unchangedIsolated = () => sameParsed(parsedIsolatedFiles ??= parseStamps(isolatedFiles), true) && sameParsed(parsedIsolatedLinks ??= parseStamps(isolatedLinks), false);
        return { id, isolated: { entry: isolated.entry, script: isolated.script }, unchangedSource, unchangedIsolated };
    }
    catch {
        return undefined;
    }
}
function packageGraph(exe, name) {
    const observations = new Map();
    const links = new Map();
    const observed = (file) => {
        if (!observations.has(file))
            observations.set(file, fileStamp(file));
        return observations.get(file) !== "";
    };
    const contents = (root, isolated = false) => {
        const files = [];
        const signature = createHash("sha256");
        const record = (file) => {
            const exists = observed(file);
            signature.update(JSON.stringify([file, observations.get(file), links.get(file)]));
            return exists;
        };
        const walk = (dir, ancestors) => {
            record(dir);
            if (isolated && dir !== root && observed(path.join(dir, "node_modules")))
                throw new Error("an isolated package has nested ambient modules");
            const real = fs.realpathSync(dir);
            if (ancestors.has(real))
                return;
            const parents = new Set(ancestors).add(real);
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.name === "node_modules" || entry.name === ".git")
                    continue;
                const file = path.join(dir, entry.name);
                const name = path.relative(root, file).split(path.sep).join("/");
                if (entry.isSymbolicLink())
                    links.set(file, fileStamp(file, false));
                const target = entry.isSymbolicLink() ? fs.readlinkSync(file) : undefined;
                if (!record(file))
                    files.push({ name, target });
                else if (entry.isDirectory() || (entry.isSymbolicLink() && fs.statSync(file).isDirectory())) {
                    files.push({ name: name + "/", target });
                    walk(file, parents);
                }
                else
                    files.push({ name, file, target });
            }
        };
        walk(root, new Set());
        const digest = () => sha(...files.map(({ name, file, target }) => JSON.stringify([name, target, file && hashFileBytes(file)])).sort());
        if (isolated)
            return digest();
        const { value, keep } = lasting(`package contents ${root}`, [root], signature.digest("hex"));
        return value ?? keep(digest());
    };
    const observeLocation = (file) => {
        const present = observed(file);
        if (present && path.basename(file) !== "package.json" && fs.lstatSync(file).isSymbolicLink())
            links.set(file, fileStamp(file, false));
        return present;
    };
    const seen = new Map();
    const graph = [];
    let complete = true;
    const visit = (dir) => {
        const previous = seen.get(dir);
        if (previous !== undefined)
            return previous;
        const file = path.join(dir, "package.json");
        observed(file);
        const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
        if (typeof pkg.name !== "string" || !packageName(pkg.name) || typeof pkg.version !== "string")
            throw new Error(`no ${pkg.name ?? name} with a version is installed at ${dir}`);
        const index = graph.length;
        seen.set(dir, index);
        const dependencies = [];
        graph.push({ name: pkg.name, version: `${pkg.name}@${pkg.version}`, dir, dependencies });
        for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies }).sort()) {
            if (!packageName(dependency))
                throw new Error(`invalid package dependency ${dependency}`);
            const at = packageLocation(dependency, dir, observeLocation);
            if (!at && dependency in (pkg.dependencies ?? {}))
                complete = false;
            dependencies.push([dependency, at ? visit(at) : null]);
        }
        return index;
    };
    observed(exe);
    if (fs.lstatSync(exe).isSymbolicLink())
        links.set(exe, fileStamp(exe, false));
    observed(path.dirname(exe));
    const [main, loaded] = packageRoots(exe, name, observeLocation);
    if (!main)
        throw new Error(`no ${name} with a version is installed beside ${exe} or these tools; run pnpm install`);
    const roots = [visit(main), loaded && visit(loaded)];
    const isolate = (id, entry, expected) => {
        if (!complete)
            throw new Error("a declared dependency needs ambient resolution");
        const script = path.join(import.meta.dirname, `simulator${path.extname(import.meta.filename)}`);
        observed(script);
        const scriptId = executableDigest(script);
        const directory = path.join(path.dirname(LASTING), "programs", "1");
        const view = path.join(directory, `${id}-${scriptId.slice(0, 12)}`);
        const dependencies = graph.map((node, index) => node.dependencies.some(([name]) => name === node.name) ? node.dependencies : [...node.dependencies, [node.name, index]]);
        fs.mkdirSync(directory, { recursive: true });
        if (!fs.existsSync(view)) {
            const staged = fs.mkdtempSync(path.join(directory, ".building-"));
            try {
                for (const [index, { dir }] of graph.entries()) {
                    const target = path.join(staged, "packages", String(index));
                    fs.cpSync(dir, target, { recursive: true, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE,
                        filter: (file) => {
                            if (["node_modules", ".git"].includes(path.basename(file)))
                                return false;
                            if (fs.lstatSync(file).isSymbolicLink()) {
                                const link = fs.readlinkSync(file);
                                if (path.isAbsolute(link) || path.relative(dir, fs.realpathSync(file)).startsWith(".."))
                                    throw new Error("a package link escapes its isolated installation");
                            }
                            return true;
                        } });
                    const modules = path.join(target, "node_modules");
                    fs.mkdirSync(modules);
                    for (const [name, dependency] of dependencies[index])
                        if (dependency !== null) {
                            const link = path.join(modules, name);
                            fs.mkdirSync(path.dirname(link), { recursive: true });
                            fs.symlinkSync(path.relative(path.dirname(link), path.join(staged, "packages", String(dependency))), link, "dir");
                        }
                }
                fs.writeFileSync(path.join(staged, "package.json"), '{"type":"module"}');
                const loaded = roots[1] ?? roots[0];
                const link = path.join(staged, "node_modules", name);
                fs.mkdirSync(path.dirname(link), { recursive: true });
                fs.symlinkSync(path.relative(path.dirname(link), path.join(staged, "packages", String(loaded))), link, "dir");
                fs.copyFileSync(script, path.join(staged, path.basename(script)));
                if (!sameFiles(observations, links))
                    throw new InstallationChanged();
                try {
                    fs.renameSync(staged, view);
                }
                catch (error) {
                    if (!fs.existsSync(view))
                        throw error;
                }
            }
            finally {
                fs.rmSync(staged, { recursive: true, force: true });
            }
        }
        const modulesMatch = (directory, names) => {
            observeLocation(directory);
            const first = [...new Set(names.map((name) => name.split("/")[0]))].sort();
            if (JSON.stringify(fs.readdirSync(directory).sort()) !== JSON.stringify(first))
                throw new Error("an isolated installation has undeclared modules");
            for (const scope of first.filter((name) => name.startsWith("@"))) {
                const scoped = path.join(directory, scope);
                observeLocation(scoped);
                const expected = names.filter((name) => name.startsWith(scope + "/")).map((name) => name.slice(scope.length + 1)).sort();
                if (JSON.stringify(fs.readdirSync(scoped).sort()) !== JSON.stringify(expected))
                    throw new Error("an isolated installation has undeclared scoped modules");
            }
        };
        for (const [index] of graph.entries()) {
            const target = path.join(view, "packages", String(index));
            if (contents(target, true) !== expected[index])
                throw new Error("an isolated package differs from its source");
            const modules = path.join(target, "node_modules");
            modulesMatch(modules, dependencies[index].filter(([, dependency]) => dependency !== null).map(([name]) => name));
            for (const [name, dependency] of dependencies[index])
                if (dependency !== null) {
                    const link = path.join(modules, name);
                    if (!observeLocation(link) || fs.realpathSync(link) !== path.join(view, "packages", String(dependency)))
                        throw new Error("an isolated dependency differs from its source");
                }
        }
        const privateScript = path.join(view, path.basename(script));
        const privateEntry = path.join(view, "packages", String(roots[0]), path.relative(main, entry));
        if (!observeLocation(privateEntry) || path.relative(path.join(view, "packages", String(roots[0])), fs.realpathSync(privateEntry)).split(path.sep).includes("..")
            || hashFileBytes(privateEntry) !== executableDigest(entry))
            throw new Error("an isolated entry differs from its source");
        for (const file of [privateScript, path.join(view, "package.json"), path.join(view, "node_modules", name)])
            observeLocation(file);
        if (hashFileBytes(privateScript) !== scriptId)
            throw new Error("an isolated runner differs from its source");
        if (fs.readFileSync(path.join(view, "package.json"), "utf8") !== '{"type":"module"}')
            throw new Error("an isolated runner has a different module format");
        modulesMatch(path.join(view, "node_modules"), [name]);
        const loadedLink = path.join(view, "node_modules", name);
        if (fs.realpathSync(loadedLink) !== path.join(view, "packages", String(roots[1] ?? roots[0])))
            throw new Error("an isolated runner resolves a different package");
        for (let parent = path.dirname(view);; parent = path.dirname(parent)) {
            if (observeLocation(path.join(parent, "node_modules")))
                throw new Error("an isolated installation has ambient modules");
            if (parent === path.dirname(parent))
                break;
        }
        if (observeLocation(path.join(view, "packages", "node_modules")))
            throw new Error("isolated packages have ambient modules");
        if (!sameFiles(observations, links))
            throw new InstallationChanged();
        return { entry: privateEntry, script: privateScript };
    };
    const unchanged = () => sameFiles(observations, links);
    return { graph, roots, main, contents, observeLocation, isolate, files: observations, links, unchanged };
}
export const installedPackages = (exe, name) => packageGraph(exe, name).graph.map((p) => p.version).sort();
const MAX_LATEST_PROGRAMS = 8;
const MAX_CACHED_VIEWS = 8;
const MAX_CACHED_INSTALLATIONS = 24;
let prunedViews = false;
function resolvedNodeForShim(exe) {
    const commandPath = process.env.PATH ?? "";
    if (process.platform === "win32")
        return commandPath;
    const executable = (file) => {
        try {
            fs.accessSync(file, fs.constants.X_OK);
            return fs.statSync(file).isFile();
        }
        catch {
            return false;
        }
    };
    const adjacent = path.join(path.dirname(exe), "node");
    if (executable(adjacent))
        return `adjacent:${fs.realpathSync(adjacent)}`;
    for (const dir of commandPath.split(path.delimiter)) {
        if (!path.isAbsolute(dir))
            return `relative:${commandPath}`;
        const candidate = path.join(dir, "node");
        if (executable(candidate))
            return `path:${fs.realpathSync(candidate)}`;
    }
    return "";
}
function touchIfStale(target, maxAgeMs = 60_000) {
    try {
        const now = Date.now();
        const stat = fs.lstatSync(target, { throwIfNoEntry: false });
        if (stat && now - stat.mtimeMs > maxAgeMs)
            fs.utimesSync(target, new Date(now), new Date(now));
    }
    catch { /* optional touch */ }
}
function prunePrograms(programsDir, keepViews, cacheDir) {
    const now = Date.now();
    const expired = now - 30 * 24 * 60 * 60 * 1000;
    const recentGrace = now - 60 * 60 * 1000;
    if (fs.existsSync(programsDir)) {
        const views = [];
        for (const entry of fs.readdirSync(programsDir, { withFileTypes: true })) {
            const full = path.join(programsDir, entry.name);
            const stat = fs.lstatSync(full, { throwIfNoEntry: false });
            if (!stat)
                continue;
            if (entry.name.startsWith(".building-")) {
                if (stat.mtimeMs < recentGrace)
                    fs.rmSync(full, { recursive: true, force: true });
            }
            else if (entry.isDirectory()) {
                views.push({ path: full, mtimeMs: stat.mtimeMs, keep: keepViews.has(entry.name) });
            }
            else {
                fs.rmSync(full, { recursive: true, force: true });
            }
        }
        views.sort((a, b) => b.mtimeMs - a.mtimeMs);
        views.forEach((view, index) => {
            if (!view.keep && (view.mtimeMs < expired || (index >= MAX_CACHED_VIEWS && view.mtimeMs < recentGrace))) {
                fs.rmSync(view.path, { recursive: true, force: true });
            }
        });
    }
    for (const entry of fs.readdirSync(cacheDir, { withFileTypes: true })) {
        if (entry.isFile() && /^installed-(?:[a-f0-9]{24}|lsc|quint|quint-host)\.json\.zst$/.test(entry.name)) {
            fs.rmSync(path.join(cacheDir, entry.name), { force: true });
        }
    }
}
let programSource;
const programMeta = new WeakMap();
export function installedProgram(root, tool) {
    const scope = checking.getStore();
    const key = `${tool}\0${path.resolve(root)}`;
    if (scope?.programs.has(key))
        return scope.programs.get(key);
    const exe = findBin(tool, root);
    if (!exe) {
        scope?.programs.set(key, undefined);
        return undefined;
    }
    const latestKey = `${tool}\0${exe}`;
    let previous = latest.get(latestKey);
    if (!previous || !previous.unchanged()) {
        const searchPath = process.env.NODE_PATH;
        const commandPath = process.env.PATH;
        const resolvedNode = resolvedNodeForShim(exe);
        const nodeOptions = nodeFlags();
        const indexKey = sha("install-v2", programSource ??= code([`cache${ext}`, `installed${ext}`, `run${ext}`]), import.meta.dirname, path.resolve(exe), searchPath ?? "", resolvedNode, nodeOptions ?? "", process.execPath, process.version, process.platform, process.arch);
        const name = `installed-${indexKey.slice(0, 24)}.json.zst`;
        const cacheDir = path.dirname(LASTING);
        const directory = path.join(cacheDir, "installations");
        const index = path.join(directory, name);
        let installed = isUnsure() || previous ? undefined : readProgram(index, indexKey);
        const rememberLatest = (entry) => {
            if (!latest.has(latestKey) && latest.size >= MAX_LATEST_PROGRAMS)
                latest.delete(latest.keys().next().value);
            latest.delete(latestKey);
            latest.set(latestKey, entry);
            return entry;
        };
        const cleanup = (isolated) => {
            const keepViews = new Set();
            for (const item of latest.values())
                if (item.isolated)
                    keepViews.add(path.basename(path.dirname(item.isolated.script)));
            if (isolated)
                keepViews.add(path.basename(path.dirname(isolated.script)));
            if (isolated)
                touchIfStale(path.dirname(isolated.script));
            touchIfStale(index);
            if (prunedViews)
                return;
            prunedViews = true;
            try {
                pruneCache(directory, new Set([name]), (file) => /^installed-[a-f0-9]{24}\.json\.zst$/.test(file), MAX_CACHED_INSTALLATIONS);
                prunePrograms(path.join(cacheDir, "programs", "1"), keepViews, cacheDir);
            }
            catch { /* optional cache cleanup */ }
        };
        if (!installed) {
            const inventory = packageGraph(exe, TOOL_PACKAGES[tool]);
            const { graph, roots, main, contents, observeLocation, isolate, files, links, unchanged } = inventory;
            try {
                const launcher = launcherInputs(exe, main, observeLocation);
                if (launcher) {
                    const expected = graph.map(({ dir }) => contents(dir));
                    const sourceFilesSnapshot = [...files];
                    const sourceLinksSnapshot = [...links];
                    const sourceFileKeys = new Set(sourceFilesSnapshot.map(([f]) => f));
                    const sourceLinkKeys = new Set(sourceLinksSnapshot.map(([f]) => f));
                    const id = sha(launcher.digest, JSON.stringify([roots, graph.map(({ version, dependencies }, index) => [version, expected[index], dependencies])]), `node@${process.versions.node}:${process.platform}:${process.arch}`);
                    const isolated = isolate(id, launcher.entry, expected);
                    const isolatedFiles = [...files].filter(([f]) => !sourceFileKeys.has(f));
                    const isolatedLinks = [...links].filter(([f]) => !sourceLinkKeys.has(f));
                    const parsedSourceFiles = parseStamps(sourceFilesSnapshot);
                    const parsedSourceLinks = parseStamps(sourceLinksSnapshot);
                    const parsedIsolatedFiles = parseStamps(isolatedFiles);
                    const parsedIsolatedLinks = parseStamps(isolatedLinks);
                    installed = {
                        id,
                        isolated,
                        unchangedSource: () => sameParsed(parsedSourceFiles, true) && sameParsed(parsedSourceLinks, false),
                        unchangedIsolated: () => sameParsed(parsedIsolatedFiles, true) && sameParsed(parsedIsolatedLinks, false),
                    };
                    if (!isUnsure()) {
                        try {
                            writeWhole(index, zstdCompressSync(JSON.stringify([indexKey, id, sourceFilesSnapshot, sourceLinksSnapshot, isolated, isolatedFiles, isolatedLinks])));
                            cleanup(isolated);
                        }
                        catch { /* optional cache */ }
                    }
                }
            }
            catch (error) {
                if (error instanceof InstallationChanged)
                    throw error;
            }
            if (installed) {
                let isolatedChecked = false;
                const { unchangedSource, unchangedIsolated } = installed;
                const stable = () => process.env.NODE_PATH === searchPath && nodeFlags() === nodeOptions && resolvedNodeForShim(exe) === resolvedNode
                    && unchangedSource() && (!isolatedChecked || unchangedIsolated());
                const verifyIsolated = () => { isolatedChecked = true; return unchangedIsolated(); };
                previous = rememberLatest({ exe, id: installed.id, isolated: installed.isolated, unchanged: stable, verifyIsolated });
                programMeta.set(previous, { index, latestKey, unchangedSource });
            }
            else {
                const stable = () => process.env.NODE_PATH === searchPath && nodeFlags() === nodeOptions && process.env.PATH === commandPath && unchanged();
                previous = rememberLatest({ exe, id: undefined, unchanged: stable });
            }
        }
        else {
            cleanup(installed.isolated);
            let isolatedChecked = false;
            const { unchangedSource, unchangedIsolated } = installed;
            const verifyIsolated = () => { isolatedChecked = true; return unchangedIsolated(); };
            previous = rememberLatest({
                exe,
                id: installed.id,
                isolated: installed.isolated,
                unchanged: () => process.env.NODE_PATH === searchPath && resolvedNodeForShim(exe) === resolvedNode && nodeFlags() === nodeOptions
                    && unchangedSource() && (!isolatedChecked || unchangedIsolated()),
                verifyIsolated,
            });
            programMeta.set(previous, { index, latestKey, unchangedSource });
        }
    }
    const program = { ...previous, unchanged: () => findBin(tool, root) === exe && previous.unchanged() };
    const meta = programMeta.get(previous);
    if (meta)
        programMeta.set(program, meta);
    scope?.programs.set(key, program);
    return program;
}
export function recoverIsolatedProgram(root, tool, current) {
    const meta = programMeta.get(current);
    if (!meta || findBin(tool, root) !== current.exe || !meta.unchangedSource()) {
        stableInstallation(false);
        throw new InstallationChanged();
    }
    fs.rmSync(meta.index, { force: true });
    latest.delete(meta.latestKey);
    checking.getStore()?.programs.delete(`${tool}\0${path.resolve(root)}`);
    return installedProgram(root, tool);
}
export function evaluatorForCheck(root) {
    const scope = checking.getStore();
    const known = scope?.evaluators.get(root);
    if (known)
        return known;
    const evaluator = installedEvaluator(root);
    if (evaluator)
        scope?.evaluators.set(root, evaluator);
    return evaluator;
}
export function stableInstallation(same) {
    const scope = checking.getStore();
    if (!same && scope)
        scope.changed = true;
    return same;
}
/**
 * What is read of Dafny once for its installation as it is now: its launchers and its assemblies. A
 * process that outlives a reinstall, as `watch` does, reads it again. A value `kept` refuses is read again next time.
 */
function perDafny(read, kept = () => true) {
    const known = new Map();
    return () => {
        const inst = installation();
        if (!inst.files)
            return read(undefined);
        let value = known.get(inst.at);
        if (!value)
            known.set(inst.at, value = read(inst).then((v) => { if (!kept(v))
                known.delete(inst.at); return v; }, (e) => { known.delete(inst.at); throw e; }));
        return value;
    };
}
/** The version of Dafny on the PATH, or why it could not be read: asked of Dafny only when its installation changed. */
export const dafnyVersion = perDafny(readDafnyVersion, (r) => !r.problem);
/** The verifier's launchers, managed assemblies, and any separately installed .NET host, by their bytes. */
export const dafnyIdentity = perDafny(readDafnyIdentity);
/** Dafny, told apart by its installation and the solver it is given. */
export const verifierIdentity = perCheck(async () => {
    const [dafny, z3] = await Promise.all([dafnyIdentity(), solver()]);
    return JSON.stringify({ dafny, z3: `${z3.version}:${executableDigest(z3.path)}`, platform: `${process.platform}:${process.arch}` });
});
export function dafnyLauncher() {
    const now = installation();
    return now.files ? now.launchers[0] : (findDafny() ?? "dafny");
}
export const solver = perCheck(() => resolveSolver((at) => {
    const check = checking.getStore();
    if (check)
        check.solverAt = at;
}));
const ext = path.extname(import.meta.filename);
/** A tool's imports of other tools that run with it, as it starts or once it asks for them: `import type` and `export type` load nothing. */
const IMPORT = /(?:^(?:import\s+(?!type\b)(?:[^;"]*?\bfrom\s+)?|export\s+(?!type\b)[^;"]*?\bfrom\s+)|\bimport\(\s*)"(\.\.?\/[^"$]+)"/gm;
/** The tools' directories: their commands, the generator, and what a project's tests, stories and design tokens load of them. */
const TOOL_DIRS = ["", "gen", "testing", "stories", "design"];
/**
 * The tools' own scripts, as source or as built: `TOOL_DIRS`, never the projects below them (examples, Studio, the
 * tools' own tests), whose checks rewrite their gen/ while this one reads, and every script they import. Read once, as
 * this process loads them, so that a key names the code that runs, however the files change after. A script is named
 * by its tokens and the line breaks between them, which decide what it does, and not by its comments or indentation,
 * so that rewording a comment runs nothing again; that name is remembered across processes while the file is
 * unchanged, from before it was read.
 */
function loadTools() {
    const tools = new Map();
    let unsure = false;
    const load = (f) => {
        if (tools.has(f))
            return;
        const file = path.join(import.meta.dirname, f);
        const stat = fs.statSync(file, { bigint: true });
        if (Number(stat.ctimeNs) / 1e6 >= performance.timeOrigin)
            unsure = true;
        const { value, keep } = lasting(`tool-meta ${file}`, [file], formatStamp(stat));
        if (value !== undefined) {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string"
                    && Array.isArray(parsed[1]) && parsed[1].every((item) => typeof item === "string")) {
                    tools.set(f, { code: parsed[0], imports: parsed[1] });
                    parsed[1].forEach(load);
                    return;
                }
            }
            catch { /* re-read below */ }
        }
        const text = fs.readFileSync(file, "utf8");
        const imports = [...text.matchAll(IMPORT)].map(([, to]) => path.join(path.dirname(f), to.replace(/\.ts$/, ext)));
        const codeHash = sha(...tokenize(text)?.map((t) => `${t.fresh ? "\n" : ""}${t.text}`) ?? [text]);
        keep(JSON.stringify([codeHash, imports]));
        tools.set(f, { code: codeHash, imports });
        imports.forEach(load);
    };
    for (const dir of TOOL_DIRS) {
        const full = path.join(import.meta.dirname, dir);
        if (fs.statSync(full).ctimeMs >= performance.timeOrigin)
            unsure = true;
        for (const f of fs.readdirSync(full).map((name) => path.join(dir, name))
            .filter((name) => name.endsWith(ext) && name !== `selftest${ext}` && name !== `remote-cache${ext}`).sort())
            load(f);
    }
    return { tools, unsure };
}
const { tools, unsure } = loadTools();
const isUnsure = () => unsure;
/** The code of these scripts, by their names and tokens. */
const code = (files) => sha(...files.sort().map((f) => `${f}\0${tools.get(f)?.code}`)).slice(0, 12);
/** Every tool's script, where it is: a page that runs one of them may run any (explore.ts, `pageInputs`). */
export const toolScripts = () => [...tools.keys()].map((f) => path.join(import.meta.dirname, f));
/** The code of every tool, which such a page reads. */
export const toolsCode = () => code([...tools.keys()]);
/** The scripts that run when these do. */
const closure = (...roots) => {
    const reached = new Set(roots.map((f) => f + ext));
    for (const f of reached)
        for (const to of tools.get(f)?.imports ?? [])
            reached.add(to);
    return [...reached];
};
/** The stages whose results are remembered, and the runs of an outside tool any of them asks for (action.ts). */
const STAGES = ["simulate", "prove", "types", "tests", "traces", "explore", "action"];
/**
 * What a remembered result of one stage was produced by: the code that runs it, the scripts it imports, and the
 * programs beneath. A simulation depends on Quint, Node and the code that simulates and generates the model it
 * simulates; a proof on Node, LemmaScript, Dafny, Z3 and the prover's code, since its unit's key holds all the unit
 * says, whichever code generated it. The part of the proof library a proof file calls (prove.ts, `libraryFor`) is part
 * of that key too. A typecheck runs VibeLang's compiler, and its key holds every tool's code. Tests, a driver's run and
 * an exploration may run any of these tools, as Studio's do, proofs included, so they depend on the verifier, or on
 * there being none; tests and a driver's run on all the tools' code too, and an exploration on the code that explores:
 * a page that runs the tools has their code in what it reads (explore.ts, `pageInputs`).
 * An action depends only on the code that runs a tool and keeps what it said: its key names the tool and all the tool reads.
 * The versions and the verifier are read for each key, so a process that outlives a reinstall, as `watch` does, keys by
 * what is installed now.
 */
const toolchains = new Map();
async function toolchainId(root, stage) {
    const everything = stage === "tests" || stage === "traces" || stage === "explore";
    const proofVerifier = stage === "prove" ? await verifierIdentity() : "";
    const versions = (stage === "action" || stage === "prove" || stage === "simulate" ? []
        : ["@informalsystems/quint", "typescript", "vibelang", ...everything ? ["lemmascript"] : []]).map(packageVersion);
    for (const tool of ["quint", "lsc"]) {
        if (!everything && !(tool === "quint" ? stage === "simulate" : stage === "prove"))
            continue;
        const program = installedProgram(root, tool);
        if (program && !program.id)
            return undefined;
        versions.push(program?.id ?? `no ${tool} launcher`);
    }
    const verifier = everything ? await verifierIdentity().catch(() => "no verifier") : proofVerifier;
    const known = [stage, ...versions, verifier].join(" ");
    let id = toolchains.get(known);
    if (id)
        return id;
    toolchains.set(known, (id = (async () => {
        if (stage === "action")
            return `${stage} ${code([`action${ext}`, `run${ext}`])}`;
        const node = `node@${process.versions.node}:${process.platform}:${process.arch}`;
        if (stage === "prove")
            return [stage, node, code(closure("prove")), ...versions, verifier].join(" ");
        if (stage === "simulate")
            return [stage, ...versions, node, code(closure("simulate", "units"))].join(" ");
        const [quint, typescript, vibelang, ...rest] = versions;
        const compiler = await findVibelangBinary();
        const vibelangId = compiler ? `${vibelang}:${executableDigest(compiler)}` : "no vibelang";
        return [stage, quint, node, code(stage === "explore" ? closure("explore") : [...tools.keys()]), typescript, vibelangId, ...rest, verifier].filter(Boolean).join(" ");
    })()));
    // A failed probe is not remembered: the next check probes again.
    id.catch(() => toolchains.delete(known));
    return id;
}
const formats = [["zst", zstdDecompressSync], ["gz", gunzipSync]];
const primaryExtension = `.${formats[0][0]}`;
const localCache = (root) => {
    const scope = checking.getStore();
    if (!scope)
        return cacheDirectory(root);
    let dir = scope.cacheDirs.get(root);
    if (dir === undefined) {
        dir = cacheDirectory(root);
        scope.cacheDirs.set(root, dir);
    }
    return dir;
};
const formalCache = new AsyncLocalStorage();
const sharedCache = (name) => isActionEntry(name) ? formalCache.getStore() : undefined;
const cacheFile = (root, name) => path.join(sharedCache(name)?.directory ?? localCache(root), name);
export async function withFormalCache(directory, run) {
    const scope = { directory: path.resolve(directory), used: new Set() };
    const result = await formalCache.run(scope, run);
    pruneCache(scope.directory, scope.used, isActionEntry);
    return result;
}
export async function entry(root, stage, key, evaluates = ["simulate", "tests", "traces", "explore"].includes(stage)) {
    const evaluator = evaluates ? evaluatorForCheck(root) : undefined;
    const inputs = [await toolchainId(root, stage), ...evaluates ? [evaluator?.id] : [], ...key];
    const reusable = inputs.every((input) => input !== undefined);
    const name = `${stage}-${sha(...inputs.map((input) => input ?? "")).slice(0, 24)}.json${primaryExtension}`;
    return { name, file: cacheFile(root, name), reusable, evaluator };
}
const touchedByMemory = new WeakMap();
/** Entries are deleted when unused for a while (see collectGarbage), so a hit says the entry is in use. */
function use(memory, name) {
    memory.used.add(name);
    sharedCache(name)?.used.add(name);
    const file = cacheFile(memory.root, name);
    const check = checking.getStore();
    let seen = touchedByMemory.get(memory);
    if (!seen)
        touchedByMemory.set(memory, seen = new Set());
    if (check?.touched.has(file) || seen.has(file))
        return;
    check?.touched.add(file);
    seen.add(file);
    try {
        const now = new Date();
        fs.utimesSync(file, now, now);
    }
    catch { /* still a hit */ }
}
function projectedEntry(memory, at) {
    if (!memory.actionProjection || !isActionEntry(at.name))
        return undefined;
    const raw = at.name.slice(0, -primaryExtension.length);
    const name = `action-${sha("projection", raw, memory.actionProjection.version).slice(0, 24)}.json${primaryExtension}`;
    return { ...at, name, file: cacheFile(memory.root, name) };
}
/** What an entry holds, or undefined. An entry that cannot be read, cut short by a kill or a full disk, is deleted and is a miss. */
export function recall(memory, raw) {
    const projected = projectedEntry(memory, raw);
    if (!projected)
        memory.used.add(raw.name);
    const check = checking.getStore();
    if (memory.fresh || !raw.reusable || check?.changed || check?.closed)
        return undefined;
    const compact = projected && readReceipt(memory, projected);
    if (compact !== undefined)
        return compact;
    memory.used.add(raw.name);
    return readReceipt(memory, raw);
}
function readReceipt(memory, { name, file }) {
    const check = checking.getStore();
    const fileBase = file.slice(0, -primaryExtension.length);
    const nameBase = name.slice(0, -primaryExtension.length);
    for (const [extension, decompress] of formats) {
        const stored = `${fileBase}.${extension}`;
        let bytes;
        try {
            bytes = check?.pending.get(stored) ?? check?.pendingDafny.get(stored) ?? fs.readFileSync(stored);
        }
        catch {
            continue;
        }
        let value;
        try {
            value = JSON.parse(decompress(bytes).toString("utf8"));
        }
        catch {
            fs.rmSync(stored, { force: true });
            continue;
        }
        const actual = `${nameBase}.${extension}`;
        use(memory, actual);
        memory.captureReceipt?.({ name: actual, bytes });
        return value;
    }
    return undefined;
}
/** Remember `value` under an entry, unless this process cannot say which tools computed it: then the next check computes it again. */
export function store(memory, raw, value, source) {
    const { evaluator, reusable } = raw;
    const projected = projectedEntry(memory, raw);
    if (!projected)
        memory.used.add(raw.name);
    const check = checking.getStore();
    if (isUnsure() || check?.changed || check?.closed || !reusable)
        return;
    if (evaluator) {
        if (check)
            check.verify.add(evaluator);
        else if (!evaluator.unchanged())
            return;
    }
    const action = source === "dafny" ? undefined : source;
    if (action) {
        if (!check && !action.program.unchanged())
            return;
        if (action.program.verifyIsolated && !action.program.verifyIsolated()) {
            if (check) {
                check.changed = true;
                resetPending(check);
                throw new InstallationChanged();
            }
            return;
        }
    }
    const compact = projected && memory.actionProjection?.encode(value);
    const { name, file } = projected && compact !== undefined ? projected : raw;
    const bytes = zstdCompressSync(JSON.stringify(compact === undefined ? value : compact));
    memory.used.add(name);
    memory.wrote = true;
    sharedCache(name)?.used.add(name);
    if (check && (source === "dafny" || /^(?:prove|tests|traces|explore)-/.test(raw.name))) {
        check.dafnyBytes += bytes.length - (check.pendingDafny.get(file)?.length ?? 0);
        check.pendingDafny.set(file, bytes);
        if (pendingLimit(check))
            publishDafny(check);
        memory.captureReceipt?.({ name, bytes });
        return;
    }
    if (action)
        check?.verify.add(action.program);
    else if (check && raw.name.startsWith("simulate-")) {
        const quint = check.programs.get(`quint\0${path.resolve(memory.root)}`);
        if (quint?.id)
            check.verify.add(quint);
    }
    if (!check?.verify.size)
        writeWhole(file, bytes);
    else {
        check.bytes += bytes.length - (check.pending.get(file)?.length ?? 0);
        check.pending.set(file, bytes);
        if (!action || pendingLimit(check)
            || performance.now() - check.lastPublished >= PUBLISH_INTERVAL_MS
            || performance.now() - action.began >= PUBLISH_INTERVAL_MS)
            publishChecked();
    }
    memory.captureReceipt?.({ name, bytes });
}
/**
 * `produce()`, or what it returned the last time for the same key, if that was
 * worth keeping. This is what keeps a check proportional to what changed. The
 * cache is a convenience: `accept` never reads it. Every entry read or written is recorded as used, so that a
 * full check keeps its results while pruning older branches and profiles. A result also names the entries its
 * producer used, the runs of tools beneath it, and a hit keeps those in use too: a change to these tools asks for the
 * result again, and finds the runs still there. Work delayed by a queue reads the same entry once more on admission.
 */
export async function remembered(memory, at, produce, keep, schedule) {
    const e = await at;
    const known = recall(memory, e);
    if (known !== undefined) {
        for (const name of known.used)
            use(memory, name);
        return known.result;
    }
    const compute = async () => {
        const own = { ...memory, used: new Set(), wrote: false };
        const result = await produce(own);
        for (const name of own.used)
            memory.used.add(name);
        if (own.wrote)
            memory.wrote = true;
        if (keep(result))
            store(memory, e, { result, used: [...own.used] });
        return result;
    };
    return schedule ? schedule((waited) => waited ? remembered(memory, e, produce, keep) : compute()) : compute();
}
const ENTRY = new RegExp(`^(${STAGES.join("|")})-(?:.*-)?[a-f0-9]{24}\\.json\\.(?:${formats.map(([extension]) => extension).join("|")})$`);
export const isActionEntry = (name) => name.startsWith("action-") && ENTRY.test(name);
/** Keep recent branches and profiles for a month, within 256 MiB; never evict this check's entries. */
export function collectGarbage(memory) {
    pruneCache(localCache(memory.root), memory.used);
}
function pruneCache(directory, inUse, owns, maxEntries) {
    if (!fs.existsSync(directory))
        return;
    const now = Date.now();
    const expired = now - 30 * 24 * 60 * 60 * 1000;
    const recentGrace = now - 60 * 60 * 1000;
    const retained = [];
    for (const name of fs.readdirSync(directory)) {
        if (name === "lock" || (owns && !owns(name)))
            continue;
        const file = path.join(directory, name);
        const stat = fs.lstatSync(file, { throwIfNoEntry: false });
        if (!stat)
            continue;
        const used = inUse.has(name);
        if (!used && ((!owns && !ENTRY.test(name)) || !stat.isFile() || stat.mtimeMs < expired))
            fs.rmSync(file, { recursive: true, force: true });
        else
            retained.push({ file, size: stat.size, touched: stat.mtimeMs, used });
    }
    let bytes = retained.reduce((total, entry) => total + entry.size, 0);
    let count = retained.length;
    for (const entry of retained.filter((entry) => !entry.used).sort((a, b) => a.touched - b.touched || a.file.localeCompare(b.file))) {
        const overBytes = bytes > 256 * 2 ** 20;
        const overCount = maxEntries !== undefined && count > maxEntries && entry.touched < recentGrace;
        if (!overBytes && !overCount)
            break;
        fs.rmSync(entry.file, { force: true });
        bytes -= entry.size;
        count--;
    }
}
