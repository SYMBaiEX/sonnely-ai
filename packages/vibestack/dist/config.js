import fs from "node:fs";
import path from "node:path";
const MODES = new Set(["vibelang", "typescript", "specs-only"]);
const TYPES_MODES = new Set(["vibelang", "tsc", "skip"]);
const TESTS_MODES = new Set(["vitest", "custom", "skip"]);
const EXPLORE_MODES = new Set(["auto", "skip"]);
export function defineConfig(config) {
    return config;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeRelativeDir(value, field, source) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${source}: ${field} must be a non-empty relative path`);
    }
    const posix = value.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (!posix || posix.startsWith("/") || posix.split("/").includes("..")) {
        throw new Error(`${source}: ${field} must stay within the project root`);
    }
    return posix;
}
function readJsonFile(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    catch (error) {
        throw new Error(`${file}: ${error.message}`, { cause: error });
    }
}
function parseOwnersRecord(value, field, source) {
    if (!isRecord(value)) {
        throw new Error(`${source}: ${field} must be an object mapping spec areas to workspace directories`);
    }
    const owners = {};
    for (const [area, dir] of Object.entries(value)) {
        if (typeof dir !== "string") {
            throw new Error(`${source}: ${field}.${area} must be a string path`);
        }
        owners[area] = dir;
    }
    return owners;
}
function parseRawConfig(raw, source) {
    if (!isRecord(raw))
        throw new Error(`${source}: configuration must be a JSON object`);
    const parsed = {};
    if (raw.mode !== undefined) {
        if (typeof raw.mode !== "string" || !MODES.has(raw.mode)) {
            throw new Error(`${source}: mode must be one of "vibelang", "typescript", or "specs-only"`);
        }
        parsed.mode = raw.mode;
    }
    if (raw.cacheDir !== undefined) {
        parsed.cacheDir = normalizeRelativeDir(raw.cacheDir, "cacheDir", source);
    }
    if (raw.spec !== undefined) {
        if (!isRecord(raw.spec))
            throw new Error(`${source}: spec must be an object`);
        const spec = {};
        if (raw.spec.dir !== undefined)
            spec.dir = normalizeRelativeDir(raw.spec.dir, "spec.dir", source);
        if (raw.spec.exclude !== undefined) {
            if (!Array.isArray(raw.spec.exclude) || raw.spec.exclude.some((entry) => typeof entry !== "string")) {
                throw new Error(`${source}: spec.exclude must be an array of relative paths`);
            }
            spec.exclude = raw.spec.exclude.map((entry, index) => normalizeRelativeDir(entry, `spec.exclude[${index}]`, source));
        }
        if (raw.spec.owners !== undefined) {
            spec.owners = parseOwnersRecord(raw.spec.owners, "spec.owners", source);
        }
        parsed.spec = spec;
    }
    if (raw.stages !== undefined) {
        if (!isRecord(raw.stages))
            throw new Error(`${source}: stages must be an object`);
        const stages = {};
        if (raw.stages.types !== undefined) {
            if (typeof raw.stages.types !== "string" || !TYPES_MODES.has(raw.stages.types)) {
                throw new Error(`${source}: stages.types must be one of "vibelang", "tsc", or "skip"`);
            }
            stages.types = raw.stages.types;
        }
        if (raw.stages.tests !== undefined) {
            if (typeof raw.stages.tests !== "string" || !TESTS_MODES.has(raw.stages.tests)) {
                throw new Error(`${source}: stages.tests must be one of "vitest", "custom", or "skip"`);
            }
            stages.tests = raw.stages.tests;
        }
        if (raw.stages.explore !== undefined) {
            if (typeof raw.stages.explore !== "string" || !EXPLORE_MODES.has(raw.stages.explore)) {
                throw new Error(`${source}: stages.explore must be one of "auto" or "skip"`);
            }
            stages.explore = raw.stages.explore;
        }
        parsed.stages = stages;
    }
    return parsed;
}
export function loadConfig(root) {
    const configFile = path.join(root, "vibestack.json");
    const packageFile = path.join(root, "package.json");
    const pkg = fs.existsSync(packageFile) ? readJsonFile(packageFile) : undefined;
    const pkgRecord = isRecord(pkg) ? pkg : {};
    let rawConfig = {};
    if (fs.existsSync(configFile)) {
        rawConfig = parseRawConfig(readJsonFile(configFile), "vibestack.json");
    }
    else if (pkgRecord.vibestack !== undefined) {
        rawConfig = parseRawConfig(pkgRecord.vibestack, "package.json#vibestack");
    }
    const pkgOwners = pkgRecord.specOwners !== undefined && isRecord(pkgRecord.specOwners)
        ? parseOwnersRecord(pkgRecord.specOwners, "specOwners", "package.json")
        : {};
    const mode = rawConfig.mode ?? "vibelang";
    const specDir = rawConfig.spec?.dir ?? "spec";
    const exclude = rawConfig.spec?.exclude ?? [];
    const owners = { ...pkgOwners, ...(rawConfig.spec?.owners ?? {}) };
    const cacheDir = rawConfig.cacheDir ?? ".spec-cache";
    const defaultTypes = mode === "specs-only" ? "skip" : mode === "typescript" ? "tsc" : "vibelang";
    const defaultTests = mode === "specs-only" ? "skip" : mode === "typescript" ? "custom" : "vitest";
    const defaultExplore = mode === "specs-only" ? "skip" : "auto";
    return {
        mode,
        spec: { dir: specDir, exclude, owners },
        cacheDir,
        stages: {
            types: rawConfig.stages?.types ?? defaultTypes,
            tests: rawConfig.stages?.tests ?? defaultTests,
            explore: rawConfig.stages?.explore ?? defaultExplore,
        },
    };
}
export function isExcludedSpecPath(relPosixPath, specConfig) {
    if (!specConfig.exclude.length)
        return false;
    const normalized = relPosixPath.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
    const prefix = `${specConfig.dir}/`;
    const withinSpec = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
    for (const excluded of specConfig.exclude) {
        if (normalized === excluded || normalized.startsWith(`${excluded}/`))
            return true;
        if (withinSpec === excluded || withinSpec.startsWith(`${excluded}/`))
            return true;
        const qualified = `${specConfig.dir}/${excluded}`;
        if (normalized === qualified || normalized.startsWith(`${qualified}/`))
            return true;
    }
    return false;
}
export function cacheDirectory(root) {
    return path.join(root, loadConfig(root).cacheDir);
}
