import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { isExcludedSpecPath, loadConfig } from "./config.js";
import { writeWhole } from "./run.js";
import { evaluatorIdentity } from "./installed.js";
import { badSpecName, heading } from "./parse.js";
import { profile } from "./testing/profile.js";
export { writeWhole };
let tsModule;
/** Load TypeScript lazily so commands that never touch it skip its startup cost. */
export const tsApi = () => (tsModule ??= createRequire(import.meta.url)("typescript"));
export const digest = (text) => createHash("sha256").update(text).digest("hex");
/** A hash of several texts, in which no two lists of texts give the same input. */
export const sha = (...parts) => digest(JSON.stringify(parts));
export const short = (text) => digest(text).slice(0, 12);
export const indent = (s, by = 6) => s.split("\n").map((l) => " ".repeat(by) + l).join("\n");
export async function allDone(promises) {
    const settled = await Promise.allSettled(promises);
    return settled.map((r) => {
        if (r.status === "rejected")
            throw r.reason;
        return r.value;
    });
}
/** Files and symbolic links below a project directory, excluding directory entries. */
export const filesUnder = (root, dir) => !fs.existsSync(path.join(root, dir)) ? []
    : fs.readdirSync(path.join(root, dir), { recursive: true, withFileTypes: true }).filter((e) => e.isFile() || e.isSymbolicLink())
        .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join("/")).sort();
const sidecarSource = /^(.*?)(?:\.vibex?\.[^./]+\.d\.ts|\.d\.vibex?\.tsx?|\.d\.ts)$/;
export function pruneSidecars(dir) {
    const ts = tsApi();
    const { config } = ts.readConfigFile(path.join(dir, "tsconfig.json"), ts.sys.readFile);
    const sidecarDir = config?.vibe?.sidecarDir;
    if (typeof sidecarDir !== "string")
        return;
    const sidecars = path.resolve(dir, sidecarDir);
    if (!fs.existsSync(sidecars))
        return;
    const host = { ...ts.sys, readDirectory: () => [] };
    for (const mirror of ts.parseJsonConfigFileContent(config, host, dir).options.rootDirs ?? []) {
        const within = path.relative(sidecars, mirror);
        if (within.startsWith("..") || path.isAbsolute(within))
            continue;
        const base = path.resolve(dir, ...within.split(path.sep).filter(Boolean).map(() => ".."));
        for (const file of filesUnder(sidecars, "")) {
            const stem = sidecarSource.exec(file)?.[1];
            if (stem && ![".vibe", ".vibex"].some((ext) => fs.existsSync(path.join(base, stem + ext))))
                fs.rmSync(path.join(sidecars, file), { force: true });
        }
    }
}
/** What a package's tsconfig.json names: itself, the configurations it extends and the files it includes, VibeLang's among them. */
export function configured(dir) {
    const ts = tsApi();
    const config = path.resolve(dir, "tsconfig.json");
    const source = ts.readJsonConfigFile(config, ts.sys.readFile);
    const { fileNames } = ts.parseJsonSourceFileConfigFileContent(source, ts.sys, path.dirname(config), undefined, config, undefined, [".vibe", ".vibex"].map((extension) => ({ extension, isMixedContent: false, scriptKind: ts.ScriptKind.Deferred })));
    return [config, ...source.extendedSourceFiles ?? [], ...fileNames];
}
/** Resolve a project folder before a command reads or writes its files. */
export function projectRoot(directory, base = process.cwd()) {
    const root = path.resolve(base, directory);
    if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory())
        throw new Error(`${directory}: not an existing project directory`);
    return fs.realpathSync(root);
}
/** The declarations the VibeLang compiler writes for a `.vibe` module: its output, not the package's code. */
const SIDECAR = /\.d\.vibex?\.ts$/;
/** The directories a spec area may map to: an entry in `vibestack.json` `spec.owners` or `package.json` `specOwners`, or conventional `apps/<name>` and `packages/<name>`. */
export function specOwnerPaths(root, name) {
    const conventional = [`apps/${name}`, `packages/${name}`];
    const rawPkgOwners = manifest(root).specOwners;
    if (rawPkgOwners !== undefined && (typeof rawPkgOwners !== "object" || rawPkgOwners === null || Array.isArray(rawPkgOwners))) {
        throw new Error("package.json: specOwners must map spec areas to workspace directories");
    }
    const declared = loadConfig(root).spec.owners;
    const entries = Object.entries(declared);
    if (!entries.length)
        return conventional;
    const claimed = new Set();
    let match;
    for (const [area, dir] of entries) {
        if (badSpecName(area) || typeof dir !== "string" || !/^(?:apps|packages)\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(dir)) {
            throw new Error(`package.json: specOwners.${area} must map a spec area to a workspace directory under apps/ or packages/`);
        }
        if (claimed.has(dir))
            throw new Error(`package.json: specOwners assigns ${dir} to more than one spec area`);
        claimed.add(dir);
        if (area === name)
            match = dir;
    }
    return match ? [match] : conventional.filter((dir) => !claimed.has(dir));
}
/**
 * The workspace package a spec belongs to by name, as a path from the root: `spec/<name>/…` is `apps/<name>` or
 * `packages/<name>`, if that is a package with no `spec/` of its own. The root's check generates into its `gen/` and
 * checks its code (SPEC.md, "One spec tree").
 */
export function owner(root, spec, observe) {
    const { spec: specConfig } = loadConfig(root);
    const [top, name, below] = spec.split("/");
    if (top !== specConfig.dir || below === undefined || isExcludedSpecPath(`${specConfig.dir}/${name}`, specConfig))
        return undefined;
    observe?.(path.join(root, "package.json"));
    const exists = observe ? (file) => { observe(file); return fs.existsSync(file); } : fs.existsSync;
    return specOwnerPaths(root, name).find((dir) => exists(path.join(root, dir, "package.json")) && !exists(path.join(root, dir, specConfig.dir)));
}
/**
 * The directories whose code a check reads, each as the prefix of a path from the root: "" for the root's own
 * `src/` and `test/`, then `apps/app/` for each package that owns a directory of the spec tree.
 */
export const codeDirs = (root) => {
    const { spec: specConfig } = loadConfig(root);
    const specRoot = path.join(root, specConfig.dir);
    return ["", ...!fs.existsSync(specRoot) ? []
            : [...new Set(fs.readdirSync(specRoot)
                    .filter((name) => !isExcludedSpecPath(`${specConfig.dir}/${name}`, specConfig))
                    .flatMap((name) => owner(root, `${specConfig.dir}/${name}/`) ?? []))].sort().map((dir) => `${dir}/`)];
};
/** Which of `codeDirs` a path from the root is in: the root holds no `apps/` or `packages/` code of its own. */
export const codeDirOf = (file) => file.match(/^(?:(?:apps|packages)\/[^/]+\/)?/)[0];
/** Every such file, read once: a check proves and reviews the same text, even if a file changes while it runs. */
export function readSrc(root) {
    const files = codeDirs(root).flatMap((dir) => filesUnder(root, `${dir}src`)).filter((f) => /\.(?:[mc]?ts|tsx|[mc]?jsx?|vibex?)$/.test(f) && !SIDECAR.test(f));
    return files.map((f) => ({ file: f, code: fs.readFileSync(path.join(root, f), "utf8"), ts: /\.ts$/.test(f) })).filter((u) => u.code.includes("//@"));
}
/** A directory's package.json, or nothing; one that is not JSON is refused with its path. */
/** A package's package.json, or nothing where it has none. */
export function manifest(dir) {
    const file = path.join(dir, "package.json");
    if (!fs.existsSync(file))
        return {};
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    catch (e) {
        throw new Error(`${file}: ${e.message}`, { cause: e });
    }
}
/** A package's scripts. */
export const packageScripts = (root) => manifest(root).scripts ?? {};
/** The script that runs the package's app, for Studio's preview and the explore stage: `start`, or `dev` when that is not the studio. */
export function appScript(root) {
    const scripts = packageScripts(root);
    return scripts.start ? "start" : scripts.dev && !/\bspec(\.ts)? studio\b/.test(scripts.dev) ? "dev" : undefined;
}
/** A terminal colour code, which development servers print around their address. */
export const COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
/** The address a development server says it serves at, in a line it printed. @throws {never} */
export const servedAt = (line) => line.replace(COLOUR, "").match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+[^\s]*/)?.[0];
/** What no test reads: a spec's prose and its Quint copy, and the prose `spec init` and these tools keep for people and agents at a package's top. */
const PROSE = /^spec\/.*\.md$|^gen\/[^/]*\.qnt$|^(?:README|AGENTS|CLAUDE|CONTRIBUTING|SPEC)\.md$/;
/** A package and the workspace packages it depends on, and theirs, each once: by its real directory and the name it is depended on by. */
export function workspacePackages(root) {
    const found = new Map();
    const pending = [{ directory: root, name: "." }];
    for (const { directory, name } of pending) {
        const from = fs.realpathSync(directory);
        if (found.has(from))
            continue;
        found.set(from, name);
        const pkg = manifest(from);
        for (const [dependency, version] of Object.entries({ ...pkg.peerDependencies, ...pkg.devDependencies, ...pkg.dependencies, ...pkg.optionalDependencies }).sort(([a], [b]) => a.localeCompare(b))) {
            const at = path.join(from, "node_modules", dependency);
            if (String(version).startsWith("workspace:") && fs.existsSync(at))
                pending.push({ directory: at, name: dependency });
        }
    }
    return [...found].map(([directory, name]) => ({ directory, name }));
}
/** A relative module a script names, by import, export or `import()`. */
const SPECIFIER = /(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)["'](\.\.?\/[^"']+)["']/gm;
/**
 * A fingerprint of what a package's tests or its typecheck read: its files but `PROSE` and the simulations' traces, and
 * the top of its gen/ (an owner's is mirrored from the root's), the fixtures nested under its test/, the workspace packages it depends on, the lock file
 * and the fuzzing budget. Of a workspace package depended on, only what a dependent can load: not its spec/, Markdown
 * outside fixtures/, tests, drivers, traces or counterexamples, nor the packages nested in it, nor its gen/ unless its
 * scripts or its manifest reach into it.
 */
export function testInputs(root, mode = "normal", read = "tests") {
    const evaluator = read === "tests" ? evaluatorIdentity(root) : undefined;
    if (read === "tests" && !evaluator)
        return undefined;
    const hash = createHash("sha256").update(JSON.stringify(["tests-v6", read, process.versions.node, process.platform, process.arch, profile(mode), ...evaluator ? [evaluator] : []]));
    const served = (file) => !isTestFile(file) && ![DRIVERS, TRACES, COUNTEREXAMPLES].some((dir) => file.startsWith(`${dir}/`));
    const reads = {
        tests: (file) => !PROSE.test(file) && !file.startsWith(`${SIMULATIONS}/`),
        types: (file) => /\.(?:[cm]?[jt]sx?|json|vibex?)$/.test(file) && file !== "spec/lock.json" && ![TRACES, COUNTEREXAMPLES, SIMULATIONS].some((dir) => file.startsWith(`${dir}/`)),
    };
    const update = (from, file) => {
        const bytes = fs.readFileSync(path.join(from, file));
        hash.update(`${file}\0${bytes.length}\0`).update(bytes);
        return bytes;
    };
    for (const { directory: from, name } of workspacePackages(root)) {
        hash.update(JSON.stringify(name));
        const own = name === ".";
        const keep = (file) => reads[read](file) && (own || (served(file) && !/^(?:spec|gen)\//.test(file) && (!file.endsWith(".md") || /(?:^|\/)fixtures\//.test(file))));
        const pkg = manifest(from);
        if ([pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies, pkg.peerDependencies].some((deps) => Object.values(deps ?? {}).some((version) => typeof version === "string" && version.startsWith("link:"))))
            return undefined;
        let gen = own || /(?:^|["/.])gen\//.test(JSON.stringify([pkg.exports, pkg.main, pkg.module, pkg.types]));
        for (const file of packageFiles(from, keep, "", own)) {
            const bytes = update(from, file);
            if (!gen && /\.(?:[cm]?[jt]sx?|vibex?)$/.test(file))
                gen = [...bytes.toString("utf8").matchAll(SPECIFIER)].some(([, to]) => path.posix.join(path.posix.dirname(file), to).startsWith("gen/"));
        }
        const top = gen && fs.existsSync(path.join(from, "gen")) ? fs.readdirSync(path.join(from, "gen"), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => `gen/${e.name}`).sort() : [];
        for (const file of top.filter(reads[read]))
            update(from, file);
    }
    const { lock } = packageManager(root);
    if (lock)
        hash.update(fs.readFileSync(lock));
    return hash.digest("hex");
}
/** A successful complete Node test run, also restored by the Turbo test task. */
export const testReceipt = (root, mode = "normal") => path.join(root, ".cache", `test-result-${mode}.json`);
/** Where code cites a story or rule (AGENTS.md, "Tests"). */
const CITATION = /(?<![\w/.-])(spec\/(?:[A-Za-z0-9]+\/)*[A-Za-z0-9]+\.md), "([^"]+)"/g;
export const HAS_CITATION = new RegExp(CITATION.source);
export function fileCitations(file, text) {
    if (!text.includes("spec/"))
        return [];
    const out = [];
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes("spec/"))
            continue;
        for (const [, spec, heading] of lines[i].matchAll(CITATION))
            out.push({ at: `${file}:${i + 1}`, spec, heading });
    }
    return out;
}
/** Every citation in the code of `dirs`, which are `codeDirs` (all of them unless given): an owner cites as the root does. */
export const citations = (root, dirs = codeDirs(root)) => dirs.flatMap((dir) => packageCode(path.join(root, dir))
    .flatMap((f) => fileCitations(dir + f, fs.readFileSync(path.join(root, dir, f), "utf8"))));
export function missingCitations(specs, found) {
    const valid = new Set();
    for (const s of specs) {
        for (const t of s.stories)
            valid.add(`${s.file}\0${t.title}`);
        for (const r of s.rules)
            valid.add(`${s.file}\0${heading(r)}`);
    }
    return found.filter((c) => !valid.has(`${c.spec}\0${c.heading}`)).map((c) => `${c.at}  ${c.spec}, "${c.heading}"`);
}
/** Every citation in a package's code whose heading is no story or rule of that spec, as `file:line  citation`. */
export const danglingCitations = (root, specs, dir = "") => missingCitations(specs, citations(root, [dir]));
/** A directory no stage reads in a package: build output, dependencies, saved explorations and hidden directories. */
export const UNREAD = /^(node_modules|dist|build|out|coverage|storybook-static|__traces__|__screenshots__|\..*)$/;
/**
 * A package's files that `keep` accepts, as paths from it: not gen/, build output, dependencies, hidden directories
 * (such as `.cache/`) or `.DS_Store`, nor the packages nested in it, which are checked on their own, except, with
 * `fixtures`, those under a test/ directory, which its tests read.
 */
export function packageFiles(root, keep, dir = "", fixtures = false) {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
        const rel = dir ? `${dir}/${e.name}` : e.name;
        if (e.name === ".git" || e.name === ".DS_Store")
            return [];
        if (e.isFile())
            return keep(rel) ? [rel] : [];
        if (!e.isDirectory() || UNREAD.test(e.name))
            return [];
        const nested = fs.existsSync(path.join(root, rel, "package.json"));
        const skip = nested && (e.name === "gen" || !fixtures || !/(?:^|\/)test\//.test(rel));
        return skip ? [] : packageFiles(root, keep, rel, fixtures);
    }).sort();
}
export const packageCode = (root) => packageFiles(root, (file) => /\.(?:[cm]?[jt]sx?|vibex?)$/.test(file) && !SIDECAR.test(file));
/** A test of a package: test/**\/*.test.*, but not a driver, which the traces stage runs. */
export const isTestFile = (file) => /^test\/(?!drivers\/).*\.test\.[^/.]+$/.test(file);
/** Where a package keeps its drivers, the traces they replay and the counterexamples the simulator found (SPEC.md, "Conformance"). */
export const TRACES = "test/traces", DRIVERS = "test/drivers", COUNTEREXAMPLES = "test/counterexamples";
/** Where Quint writes the traces of the simulations a check ran. */
export const SIMULATIONS = "gen/traces";
/** A script's tokens, or nothing if its brackets do not balance; TypeScript's scanner reads VibeLang's too. */
export function tokenize(text) {
    const K = tsApi().SyntaxKind;
    const scanner = tsApi().createScanner(tsApi().ScriptTarget.Latest, true, tsApi().LanguageVariant.Standard, text);
    const out = [];
    const open = []; // each bracket that is open: true for a template's `${`
    for (let kind = scanner.scan(); kind !== K.EndOfFileToken; kind = scanner.scan()) {
        // A slash after a value divides; anywhere else it starts a regular expression.
        const last = out.at(-1)?.text ?? "";
        if ((kind === K.SlashToken || kind === K.SlashEqualsToken) && !(/[\w$)\]}'"`]$/.test(last) && !/^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/.test(last)))
            kind = scanner.reScanSlashToken();
        if (kind === K.CloseBraceToken && open.at(-1))
            kind = scanner.reScanTemplateToken(false);
        if (kind === K.CloseParenToken || kind === K.CloseBracketToken || kind === K.CloseBraceToken || kind === K.TemplateTail) {
            if (!open.length)
                return undefined;
            open.pop();
        }
        out.push({ text: scanner.getTokenText(), pos: scanner.getTokenFullStart(), start: scanner.getTokenStart(), depth: open.length, fresh: scanner.hasPrecedingLineBreak() });
        if (kind === K.OpenParenToken || kind === K.OpenBracketToken || kind === K.OpenBraceToken || kind === K.TemplateHead)
            open.push(kind === K.TemplateHead);
    }
    return open.length ? undefined : out;
}
/** The package manager a package declares, or whose lock file sits in it or a directory above it, up to the repository or workspace root. */
export function packageManager(root) {
    const locks = { "pnpm-lock.yaml": "pnpm", "bun.lock": "bun", "bun.lockb": "bun", "yarn.lock": "yarn", "package-lock.json": "npm" };
    let declared;
    for (let dir = path.resolve(root);; dir = path.dirname(dir)) {
        const pkg = manifest(dir);
        declared ??= pkg.packageManager?.split("@")[0];
        const lock = Object.keys(locks).find((f) => fs.existsSync(path.join(dir, f)));
        if (lock)
            return { name: declared ?? locks[lock], lock: path.join(dir, lock) };
        if (pkg.workspaces || fs.existsSync(path.join(dir, ".git")) || path.dirname(dir) === dir)
            return { name: declared ?? "npm" };
    }
}
