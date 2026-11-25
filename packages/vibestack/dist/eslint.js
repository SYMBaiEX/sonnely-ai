import { existsSync, globSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, matchesGlob, posix, relative, resolve, sep } from "node:path";
import { designSystem } from "./design/eslint.js";
import { parseTokens } from "./design/tokens.js";
const ASSET_EXTENSIONS = [
    ".css", ".scss", ".sass", ".less",
    ".json",
    ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".wasm",
];
const TYPE_DECL_EXTENSIONS = [".d.ts", ".d.mts", ".d.cts"];
const DEFAULT_SCAN_EXCLUDES = [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/gen/**",
    "**/.spec-cache/**",
    "**/.cache/**",
    "**/.turbo/**",
    "**/storybook-static/**",
    "**/test/fixtures/**",
];
const GLOBAL_IGNORE_KEYS = new Set(["ignores", "name", "basePath"]);
const guardedParsers = new WeakMap();
const protectedParsers = new WeakSet();
function toPosix(filePath) {
    return filePath.split(sep).join("/");
}
function canonicalPath(targetPath) {
    const abs = resolve(targetPath);
    if (existsSync(abs))
        return realpathSync(abs);
    let current = dirname(abs);
    const tail = [abs.slice(current.length === 1 ? 1 : current.length + 1)];
    while (!existsSync(current)) {
        const parent = dirname(current);
        if (parent === current)
            return abs;
        tail.unshift(current.slice(parent.length === 1 ? 1 : parent.length + 1));
        current = parent;
    }
    return join(realpathSync(current), ...tail);
}
function relativePosixPath(canonicalRoot, cwd, filename) {
    if (!filename || filename === "<input>" || filename === "<text>")
        return undefined;
    const fileAbs = canonicalPath(resolve(cwd, filename));
    const rel = toPosix(posix.relative(toPosix(canonicalRoot), toPosix(fileAbs)));
    if (!rel || rel.startsWith("../") || rel === ".." || posix.isAbsolute(rel))
        return undefined;
    return rel;
}
function hasExtension(target, extensions) {
    const lower = target.toLowerCase();
    const slash = lower.lastIndexOf("/");
    const base = slash >= 0 ? lower.slice(slash + 1) : lower;
    return extensions.some((ext) => base.length > ext.length && base.endsWith(ext));
}
function parseJsonDocument(text) {
    const len = text.length;
    let i = len > 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
    let line = 1;
    let lineStart = 0;
    const pos = () => ({ line, column: i - lineStart });
    const fail = (message, at = pos()) => {
        throw Object.assign(new SyntaxError(message), { lineNumber: at.line, column: at.column + 1 });
    };
    const skipWs = () => {
        while (i < len) {
            const code = text.charCodeAt(i);
            if (code === 0x20 || code === 0x09) {
                i++;
            }
            else if (code === 0x0a) {
                i++;
                line++;
                lineStart = i;
            }
            else if (code === 0x0d) {
                i++;
                if (text.charCodeAt(i) === 0x0a)
                    i++;
                line++;
                lineStart = i;
            }
            else {
                break;
            }
        }
    };
    const parseString = () => {
        const start = pos();
        i++;
        let value = "";
        let chunkStart = i;
        while (i < len) {
            const code = text.charCodeAt(i);
            if (code === 0x22) {
                value += text.slice(chunkStart, i);
                i++;
                return { kind: "string", value, loc: { start, end: pos() } };
            }
            if (code < 0x20)
                fail("Unescaped control character in JSON string");
            if (code === 0x5c) {
                value += text.slice(chunkStart, i);
                const escAt = pos();
                i++;
                if (i >= len)
                    fail("Unterminated escape sequence in JSON string", escAt);
                const esc = text[i++];
                if (esc === '"' || esc === "\\" || esc === "/")
                    value += esc;
                else if (esc === "b")
                    value += "\b";
                else if (esc === "f")
                    value += "\f";
                else if (esc === "n")
                    value += "\n";
                else if (esc === "r")
                    value += "\r";
                else if (esc === "t")
                    value += "\t";
                else if (esc === "u") {
                    const hex = text.slice(i, i + 4);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex))
                        fail("Invalid Unicode escape in JSON string", escAt);
                    value += String.fromCharCode(Number.parseInt(hex, 16));
                    i += 4;
                }
                else {
                    fail(`Invalid escape sequence \\${esc} in JSON string`, escAt);
                }
                chunkStart = i;
            }
            else {
                i++;
            }
        }
        return fail("Unterminated JSON string", start);
    };
    const parseNumber = () => {
        const start = pos();
        const numStart = i;
        if (text[i] === "-")
            i++;
        if (text[i] === "0") {
            i++;
            if (i < len && text.charCodeAt(i) >= 0x30 && text.charCodeAt(i) <= 0x39)
                fail("Leading zero in JSON number", start);
        }
        else if (i < len && text.charCodeAt(i) >= 0x31 && text.charCodeAt(i) <= 0x39) {
            while (i < len && text.charCodeAt(i) >= 0x30 && text.charCodeAt(i) <= 0x39)
                i++;
        }
        else {
            fail("Invalid JSON number", start);
        }
        if (text[i] === ".") {
            i++;
            const fracStart = i;
            while (i < len && text.charCodeAt(i) >= 0x30 && text.charCodeAt(i) <= 0x39)
                i++;
            if (i === fracStart)
                fail("Expected digit after decimal point in JSON number", start);
        }
        if (text[i] === "e" || text[i] === "E") {
            i++;
            if (text[i] === "+" || text[i] === "-")
                i++;
            const expStart = i;
            while (i < len && text.charCodeAt(i) >= 0x30 && text.charCodeAt(i) <= 0x39)
                i++;
            if (i === expStart)
                fail("Expected exponent digit in JSON number", start);
        }
        return { kind: "primitive", value: Number(text.slice(numStart, i)), loc: { start, end: pos() } };
    };
    const parseLiteral = (word, literalValue) => {
        const start = pos();
        if (!text.startsWith(word, i))
            fail(`Unexpected token in JSON`, start);
        i += word.length;
        return { kind: "primitive", value: literalValue, loc: { start, end: pos() } };
    };
    const parseArray = () => {
        const start = pos();
        i++;
        skipWs();
        const elements = [];
        if (text[i] === "]") {
            i++;
            return { kind: "array", elements, loc: { start, end: pos() } };
        }
        while (true) {
            elements.push(parseValue());
            skipWs();
            if (text[i] === ",") {
                i++;
                skipWs();
                if (text[i] === "]")
                    fail("Trailing comma in JSON array");
            }
            else if (text[i] === "]") {
                i++;
                return { kind: "array", elements, loc: { start, end: pos() } };
            }
            else {
                fail("Expected ',' or ']' in JSON array");
            }
        }
    };
    const parseObject = () => {
        const start = pos();
        i++;
        skipWs();
        const properties = [];
        if (text[i] === "}") {
            i++;
            return { kind: "object", properties, loc: { start, end: pos() } };
        }
        while (true) {
            if (text[i] !== '"')
                fail("Expected double-quoted property name in JSON object");
            const keyNode = parseString();
            skipWs();
            if (text[i] !== ":")
                fail("Expected ':' after JSON property name");
            i++;
            skipWs();
            const value = parseValue();
            properties.push({ key: keyNode.value, keyLoc: keyNode.loc, value });
            skipWs();
            if (text[i] === ",") {
                i++;
                skipWs();
                if (text[i] === "}")
                    fail("Trailing comma in JSON object");
            }
            else if (text[i] === "}") {
                i++;
                return { kind: "object", properties, loc: { start, end: pos() } };
            }
            else {
                fail("Expected ',' or '}' in JSON object");
            }
        }
    };
    const parseValue = () => {
        if (i >= len)
            fail("Unexpected end of JSON input");
        const ch = text[i];
        if (ch === "{")
            return parseObject();
        if (ch === "[")
            return parseArray();
        if (ch === '"')
            return parseString();
        if (ch === "t")
            return parseLiteral("true", true);
        if (ch === "f")
            return parseLiteral("false", false);
        if (ch === "n")
            return parseLiteral("null", null);
        if (ch === "-" || (ch >= "0" && ch <= "9"))
            return parseNumber();
        return fail(`Unexpected token ${JSON.stringify(ch)} in JSON`);
    };
    skipWs();
    const root = parseValue();
    skipWs();
    if (i < len)
        fail("Unexpected trailing token in JSON");
    return { root, end: pos() };
}
function parsePackageSpecifier(raw) {
    const clean = raw.replace(/[?#].*$/, "");
    if (!clean || clean.startsWith(".") || clean.startsWith("/") || clean.startsWith("#") || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(clean)) {
        return null;
    }
    const parts = clean.split("/");
    if (clean.startsWith("@")) {
        if (parts.length < 2 || !parts[0] || !parts[1])
            return null;
        const pkg = `${parts[0]}/${parts[1]}`;
        if (parts.length === 2)
            return { pkg, subpath: null };
        return { pkg, subpath: `./${parts.slice(2).join("/")}` };
    }
    const pkg = parts[0];
    if (parts.length === 1)
        return { pkg, subpath: null };
    return { pkg, subpath: `./${parts.slice(1).join("/")}` };
}
function normalizeRelPath(raw, label) {
    if (!raw || raw.includes("\\") || raw.startsWith("./") || raw.startsWith("/") || raw === "." || raw.split("/").includes("..")) {
        throw new Error(`withWorkspaceBarrels: ${label} key ${JSON.stringify(raw)} must be a normalized repo-relative POSIX path.`);
    }
    return raw;
}
function parseOptions(options) {
    if (!options || typeof options.root !== "string" || !options.root.trim()) {
        throw new Error("withWorkspaceBarrels: options.root must be a non-empty workspace root path.");
    }
    const root = canonicalPath(options.root);
    const exportsMap = new Map();
    for (const [rawKey, rawList] of Object.entries(options.allowExports ?? {})) {
        const key = normalizeRelPath(rawKey, "allowExports");
        if (!key.endsWith("/package.json")) {
            throw new Error(`withWorkspaceBarrels: allowExports key ${JSON.stringify(rawKey)} must end with "/package.json".`);
        }
        if (!Array.isArray(rawList) || rawList.length === 0) {
            throw new Error(`withWorkspaceBarrels: allowExports[${JSON.stringify(rawKey)}] must be a non-empty array.`);
        }
        const entries = new Set();
        for (const item of rawList) {
            if (typeof item !== "string" || item === "." || !item.startsWith("./")) {
                throw new Error(`withWorkspaceBarrels: allowExports[${JSON.stringify(rawKey)}] entry ${JSON.stringify(item)} must start with "./" and never be ".".`);
            }
            entries.add(item);
        }
        exportsMap.set(key, entries);
    }
    const importsMap = new Map();
    for (const [rawKey, rawList] of Object.entries(options.allowImports ?? {})) {
        const key = normalizeRelPath(rawKey, "allowImports");
        if (!Array.isArray(rawList) || rawList.length === 0) {
            throw new Error(`withWorkspaceBarrels: allowImports[${JSON.stringify(rawKey)}] must be a non-empty array.`);
        }
        const entries = new Set();
        for (const item of rawList) {
            const parsed = typeof item === "string" ? parsePackageSpecifier(item) : null;
            if (!parsed || parsed.subpath === null) {
                throw new Error(`withWorkspaceBarrels: allowImports[${JSON.stringify(rawKey)}] entry ${JSON.stringify(item)} must be a package subpath specifier like "@scope/pkg/subpath".`);
            }
            entries.add(item.replace(/[?#].*$/, ""));
        }
        importsMap.set(key, entries);
    }
    return { root, ratchet: { exports: exportsMap, imports: importsMap } };
}
function scanYamlUnquoted(text, onChar) {
    let quote;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quote === '"') {
            if (ch === "\\")
                i++;
            else if (ch === '"')
                quote = undefined;
        }
        else if (quote === "'") {
            if (ch === "'" && text[i + 1] === "'")
                i++;
            else if (ch === "'")
                quote = undefined;
        }
        else if (ch === "'" || ch === '"') {
            quote = ch;
        }
        else if (onChar(ch, i) === true) {
            return;
        }
    }
}
function stripYamlComment(line) {
    let cut = line.length;
    scanYamlUnquoted(line, (ch, i) => {
        if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
            cut = i;
            return true;
        }
    });
    return line.slice(0, cut);
}
function unquoteYamlScalar(raw) {
    const trimmed = raw.trim();
    if (trimmed.length >= 2) {
        if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
            return trimmed.slice(1, -1).replace(/''/g, "'");
        }
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            return trimmed.slice(1, -1);
        }
    }
    return trimmed;
}
function splitYamlFlowItems(flowBody) {
    const items = [];
    let start = 0;
    scanYamlUnquoted(flowBody, (ch, i) => {
        if (ch === ",") {
            const piece = unquoteYamlScalar(flowBody.slice(start, i));
            if (piece)
                items.push(piece);
            start = i + 1;
        }
    });
    const tail = unquoteYamlScalar(flowBody.slice(start));
    if (tail)
        items.push(tail);
    return items;
}
function parsePnpmWorkspacePackages(yamlText) {
    const lines = yamlText.split(/\r?\n/);
    const patterns = [];
    let inPackages = false;
    let inFlow = false;
    let flowBuffer = "";
    for (const rawLine of lines) {
        const line = stripYamlComment(rawLine);
        if (!inPackages) {
            const header = /^packages\s*:(.*)$/.exec(line);
            if (!header)
                continue;
            inPackages = true;
            const rest = header[1].trim();
            if (rest.startsWith("[")) {
                inFlow = true;
                flowBuffer = rest;
                const endIdx = flowBuffer.indexOf("]");
                if (endIdx >= 0)
                    return splitYamlFlowItems(flowBuffer.slice(1, endIdx));
            }
            continue;
        }
        if (inFlow) {
            flowBuffer += ` ${line.trim()}`;
            const endIdx = flowBuffer.indexOf("]");
            if (endIdx >= 0)
                return splitYamlFlowItems(flowBuffer.slice(1, endIdx));
            continue;
        }
        if (!line.trim())
            continue;
        if (/^\S/.test(line))
            break;
        const trimmed = line.trim();
        if (trimmed.startsWith("[")) {
            inFlow = true;
            flowBuffer = trimmed;
            const endIdx = flowBuffer.indexOf("]");
            if (endIdx >= 0)
                return splitYamlFlowItems(flowBuffer.slice(1, endIdx));
            continue;
        }
        const itemMatch = /^-\s*(.+)$/.exec(trimmed);
        if (itemMatch) {
            const scalar = unquoteYamlScalar(itemMatch[1]);
            if (scalar)
                patterns.push(scalar);
        }
    }
    return inPackages ? patterns : undefined;
}
function normalizeWorkspacePatterns(rawPatterns) {
    const include = [];
    const exclude = [];
    const seenInclude = new Set();
    const seenExclude = new Set();
    for (const raw of rawPatterns) {
        let body = raw.trim().replace(/\\/g, "/");
        const negated = body.startsWith("!");
        if (negated)
            body = body.slice(1).trim();
        while (body.startsWith("./"))
            body = body.slice(2);
        body = body.replace(/\/+$/, "");
        if (!body || body === ".")
            continue;
        if (negated) {
            if (!seenExclude.has(body)) {
                seenExclude.add(body);
                exclude.push(body);
            }
        }
        else if (!seenInclude.has(body)) {
            seenInclude.add(body);
            include.push(body);
        }
    }
    return { include, exclude };
}
function parseWorkspaceGlobs(root) {
    const yamlPath = join(root, "pnpm-workspace.yaml");
    if (existsSync(yamlPath)) {
        const parsed = parsePnpmWorkspacePackages(readFileSync(yamlPath, "utf8"));
        if (parsed !== undefined)
            return normalizeWorkspacePatterns(parsed);
    }
    const rootPkgPath = join(root, "package.json");
    if (existsSync(rootPkgPath)) {
        try {
            const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
            const raw = Array.isArray(rootPkg.workspaces)
                ? rootPkg.workspaces
                : rootPkg.workspaces && typeof rootPkg.workspaces === "object" && Array.isArray(rootPkg.workspaces.packages)
                    ? rootPkg.workspaces.packages
                    : [];
            return normalizeWorkspacePatterns(raw.filter((item) => typeof item === "string"));
        }
        catch {
            return { include: [], exclude: [] };
        }
    }
    return { include: [], exclude: [] };
}
function classifyExportsField(node) {
    if (!node)
        return { kind: "absent" };
    if (node.kind === "string" || node.kind === "array")
        return { kind: "barrel", loc: node.loc };
    if (node.kind !== "object")
        return { kind: "invalid", loc: node.loc };
    if (node.properties.length === 0)
        return { kind: "subpath-map", loc: node.loc, entries: [] };
    const dotCount = node.properties.filter((p) => p.key.startsWith(".")).length;
    if (dotCount === 0)
        return { kind: "barrel", loc: node.loc };
    if (dotCount !== node.properties.length)
        return { kind: "invalid", loc: node.loc };
    return { kind: "subpath-map", loc: node.loc, entries: node.properties };
}
function collectCompositeLeaves(items) {
    if (items.length === 0)
        return { valid: false, runtimeTargets: [], typeTargets: [], hasNull: false };
    const runtimeTargets = [];
    const typeTargets = [];
    let valid = true;
    let hasNull = false;
    for (const item of items) {
        const sub = collectTargetLeaves(item.value, item.types);
        if (!sub.valid)
            valid = false;
        runtimeTargets.push(...sub.runtimeTargets);
        typeTargets.push(...sub.typeTargets);
        if (sub.hasNull)
            hasNull = true;
    }
    return { valid, runtimeTargets, typeTargets, hasNull };
}
function collectTargetLeaves(node, underTypes) {
    if (node.kind === "string") {
        return underTypes
            ? { valid: true, runtimeTargets: [], typeTargets: [node.value], hasNull: false }
            : { valid: true, runtimeTargets: [node.value], typeTargets: [], hasNull: false };
    }
    if (node.kind === "primitive" && node.value === null) {
        return { valid: true, runtimeTargets: [], typeTargets: [], hasNull: true };
    }
    if (node.kind === "array") {
        return collectCompositeLeaves(node.elements.map((value) => ({ value, types: underTypes })));
    }
    if (node.kind === "object") {
        return collectCompositeLeaves(node.properties.map((prop) => ({ value: prop.value, types: underTypes || prop.key === "types" })));
    }
    return { valid: false, runtimeTargets: [], typeTargets: [], hasNull: false };
}
function classifySubpathEntry(prop) {
    if (prop.key === ".")
        return { kind: "barrel" };
    const leaves = collectTargetLeaves(prop.value, false);
    if (leaves.valid && leaves.hasNull && leaves.runtimeTargets.length === 0 && leaves.typeTargets.length === 0) {
        return { kind: "blocked" };
    }
    if (prop.key.includes("*")) {
        return { kind: "forbidden", reason: "wildcard", loc: prop.keyLoc };
    }
    if (!hasExtension(prop.key, ASSET_EXTENSIONS)) {
        return { kind: "forbidden", reason: "code-subpath", loc: prop.keyLoc };
    }
    if (!leaves.valid || leaves.runtimeTargets.length === 0) {
        return { kind: "forbidden", reason: "non-asset-target", loc: prop.value.loc };
    }
    const runtimeOk = leaves.runtimeTargets.every((target) => hasExtension(target, ASSET_EXTENSIONS));
    const typesOk = leaves.typeTargets.every((target) => hasExtension(target, ASSET_EXTENSIONS) || hasExtension(target, TYPE_DECL_EXTENSIONS));
    if (!runtimeOk || !typesOk) {
        return { kind: "forbidden", reason: "non-asset-target", loc: prop.value.loc };
    }
    return { kind: "asset" };
}
function isVendoredToolchain(rootNode) {
    if (rootNode.kind !== "object")
        return false;
    let name;
    let hasSpecBin = false;
    for (const prop of rootNode.properties) {
        if (prop.key === "name" && prop.value.kind === "string")
            name = prop.value.value;
        if (prop.key === "bin" && prop.value.kind === "object") {
            hasSpecBin = prop.value.properties.some((b) => b.key === "spec");
        }
    }
    return name === "vibestack" && hasSpecBin;
}
function discoverWorkspace(root) {
    const globs = parseWorkspaceGlobs(root);
    const manifestFiles = globs.include.map((pat) => `${pat}/package.json`);
    const manifestIgnores = ["package.json", ...globs.exclude.flatMap((pat) => [`${pat}/package.json`, `${pat}/**/package.json`])];
    const packages = new Map();
    if (manifestFiles.length === 0) {
        return { root, manifestFiles, manifestIgnores, packages };
    }
    const found = globSync(manifestFiles, {
        cwd: root,
        exclude: [...DEFAULT_SCAN_EXCLUDES, ...manifestIgnores],
    }).map(toPosix).sort();
    for (const rel of found) {
        if (rel === "package.json")
            continue;
        const dirRel = rel.slice(0, -"/package.json".length);
        if (globs.exclude.some((pat) => matchesGlob(dirRel, pat)))
            continue;
        let doc;
        try {
            doc = parseJsonDocument(readFileSync(join(root, rel), "utf8"));
        }
        catch {
            continue;
        }
        if (doc.root.kind !== "object")
            continue;
        if (isVendoredToolchain(doc.root)) {
            manifestIgnores.push(rel);
            continue;
        }
        let pkgName;
        let exportsNode;
        for (const prop of doc.root.properties) {
            if (prop.key === "name" && prop.value.kind === "string" && prop.value.value) {
                pkgName = prop.value.value;
            }
            else if (prop.key === "exports") {
                exportsNode = prop.value;
            }
        }
        if (!pkgName)
            continue;
        const allowedAssets = new Set();
        const classified = classifyExportsField(exportsNode);
        if (classified.kind === "subpath-map") {
            for (const entry of classified.entries) {
                if (classifySubpathEntry(entry).kind === "asset") {
                    allowedAssets.add(entry.key);
                }
            }
        }
        packages.set(pkgName, {
            name: pkgName,
            manifestPath: rel,
            allowedAssetSubpaths: allowedAssets,
        });
    }
    return { root, manifestFiles, manifestIgnores, packages };
}
function extractStaticString(node) {
    if (!node || typeof node !== "object")
        return undefined;
    const ast = node;
    if (ast.type === "Literal" && typeof ast.value === "string")
        return ast.value;
    if (ast.type === "TemplateLiteral") {
        const expressions = ast.expressions;
        const quasis = ast.quasis;
        if (expressions?.length === 0 && quasis?.length === 1) {
            return quasis[0].value?.cooked ?? quasis[0].value?.raw;
        }
    }
    return undefined;
}
function extractDynamicPrefix(node) {
    if (!node || typeof node !== "object")
        return undefined;
    const ast = node;
    if (ast.type === "TemplateLiteral") {
        const quasis = ast.quasis;
        if (quasis && quasis.length > 0)
            return quasis[0].value?.cooked ?? quasis[0].value?.raw;
    }
    if (ast.type === "BinaryExpression" && ast.operator === "+") {
        return extractStaticString(ast.left) ?? extractDynamicPrefix(ast.left);
    }
    return undefined;
}
function memberPropName(node) {
    if (!node.computed) {
        const prop = node.property;
        return prop?.type === "Identifier" ? prop.name : undefined;
    }
    return extractStaticString(node.property);
}
function isModuleCall(node) {
    if (node.optional)
        return false;
    const callee = node.callee;
    if (!callee)
        return false;
    if (callee.type === "Identifier" && callee.name === "require")
        return true;
    if (callee.type !== "MemberExpression" || callee.optional)
        return false;
    if (memberPropName(callee) !== "resolve")
        return false;
    const obj = callee.object;
    if (!obj)
        return false;
    if (obj.type === "Identifier" && obj.name === "require")
        return true;
    if (obj.type === "MetaProperty") {
        const meta = obj.meta;
        const prop = obj.property;
        return meta?.name === "import" && prop?.name === "meta";
    }
    return false;
}
function checkManifestExports(rootNode, allowed) {
    const issues = [];
    if (rootNode.kind !== "object")
        return issues;
    const exportNodes = [];
    let hasMainOrModule = false;
    for (const prop of rootNode.properties) {
        if (prop.key === "exports")
            exportNodes.push(prop.value);
        else if (prop.key === "publishConfig" && prop.value.kind === "object") {
            for (const pubProp of prop.value.properties) {
                if (pubProp.key === "exports")
                    exportNodes.push(pubProp.value);
            }
        }
        else if ((prop.key === "main" || prop.key === "module") && prop.value.kind === "string" && prop.value.value.trim().length > 0) {
            hasMainOrModule = true;
        }
    }
    const usedAllowed = new Set();
    for (const exportNode of exportNodes) {
        const classified = classifyExportsField(exportNode);
        if (classified.kind === "invalid") {
            issues.push({ loc: classified.loc, message: 'Package "exports" must be a root entry string/conditions or a subpath map keyed from ".".' });
            continue;
        }
        if (classified.kind !== "subpath-map")
            continue;
        if (classified.entries.length === 0) {
            issues.push({ loc: classified.loc, message: 'Empty "exports" object: expose a root barrel "." or omit "exports".' });
            continue;
        }
        let hasRootBarrel = false;
        let hasAnyCodeSubpath = false;
        for (const entry of classified.entries) {
            const verdict = classifySubpathEntry(entry);
            if (verdict.kind === "barrel") {
                hasRootBarrel = true;
            }
            else if (verdict.kind === "forbidden") {
                hasAnyCodeSubpath = true;
                if (allowed?.has(entry.key)) {
                    usedAllowed.add(entry.key);
                }
                else {
                    const hint = verdict.reason === "non-asset-target"
                        ? `Non-barrel export "${entry.key}" points to a non-asset target; static asset exports must target an asset extension.`
                        : verdict.reason === "wildcard"
                            ? `Disallowed wildcard export "${entry.key}": export code only from the root barrel "." instead of wildcard subpaths.`
                            : `Disallowed non-barrel export "${entry.key}": export code only from the root barrel "." (only explicit static assets like .css/.json may use subpaths).`;
                    issues.push({ loc: verdict.loc, message: hint });
                }
            }
        }
        if (!hasRootBarrel && !hasAnyCodeSubpath && hasMainOrModule) {
            issues.push({ loc: classified.loc, message: 'Package defines "main"/"module" alongside asset-only "exports" without a "." barrel export.' });
        }
    }
    for (const entry of allowed ?? []) {
        if (!usedAllowed.has(entry)) {
            issues.push({ loc: rootNode.loc, message: `Stale allowExports entry "${entry}" is no longer exported; remove it so the ratchet tightens.` });
        }
    }
    return issues;
}
function createExportsRule(canonicalRoot, ratchet) {
    return {
        meta: { type: "problem", schema: [] },
        create(context) {
            return {
                Program() {
                    const manifest = context.sourceCode.parserServices?.manifest;
                    if (!manifest)
                        return;
                    const rel = relativePosixPath(canonicalRoot, context.cwd, context.filename);
                    const allowed = rel ? ratchet.get(rel) : undefined;
                    for (const problem of checkManifestExports(manifest, allowed)) {
                        context.report({ loc: problem.loc, message: problem.message });
                    }
                },
            };
        },
    };
}
function createNoSubpathImportsRule(index, ratchet) {
    return {
        meta: { type: "problem", schema: [] },
        create(context) {
            const rel = relativePosixPath(index.root, context.cwd, context.filename);
            const allowed = rel ? ratchet.get(rel) : undefined;
            const usedAllowed = new Set();
            const checkStatic = (node, rawSpecifier) => {
                const parsed = parsePackageSpecifier(rawSpecifier);
                if (!parsed || parsed.subpath === null)
                    return;
                const pkg = index.packages.get(parsed.pkg);
                if (!pkg)
                    return;
                if (pkg.allowedAssetSubpaths.has(parsed.subpath))
                    return;
                const canonical = rawSpecifier.replace(/[?#].*$/, "");
                if (allowed?.has(canonical)) {
                    usedAllowed.add(canonical);
                    return;
                }
                if (hasExtension(parsed.subpath, ASSET_EXTENSIONS)) {
                    context.report({ node, message: `Import "${rawSpecifier}" is not a declared static asset export of "${parsed.pkg}".` });
                    return;
                }
                context.report({ node, message: `Import "${parsed.pkg}" from its root barrel instead of subpath "${rawSpecifier}".` });
            };
            const checkArgument = (argNode) => {
                const staticSpec = extractStaticString(argNode);
                if (staticSpec !== undefined) {
                    checkStatic(argNode, staticSpec);
                    return;
                }
                const prefix = extractDynamicPrefix(argNode);
                if (!prefix)
                    return;
                const parsed = parsePackageSpecifier(`${prefix}x`);
                if (!parsed || parsed.subpath === null)
                    return;
                if (!prefix.startsWith(`${parsed.pkg}/`))
                    return;
                if (index.packages.has(parsed.pkg)) {
                    context.report({ node: argNode, message: `Import "${parsed.pkg}" from its root barrel instead of a dynamic subpath "${prefix}...".` });
                }
            };
            const checkSource = (source) => {
                const spec = extractStaticString(source);
                if (spec !== undefined)
                    checkStatic(source, spec);
            };
            return {
                ImportDeclaration: (node) => checkSource(node.source),
                ExportNamedDeclaration: (node) => { if (node.source)
                    checkSource(node.source); },
                ExportAllDeclaration: (node) => checkSource(node.source),
                ImportExpression: (node) => checkArgument(node.source),
                CallExpression: (node) => {
                    const args = node.arguments;
                    if (args && args.length > 0 && isModuleCall(node))
                        checkArgument(args[0]);
                },
                TSExternalModuleReference: (node) => checkSource(node.expression),
                TSImportType: (node) => {
                    const arg = node.argument;
                    checkSource(node.source ?? arg?.literal ?? node.argument);
                },
                "Program:exit": (node) => {
                    for (const entry of allowed ?? []) {
                        if (!usedAllowed.has(entry)) {
                            context.report({ node, message: `Stale allowImports entry "${entry}" is no longer imported here; remove it so the ratchet tightens.` });
                        }
                    }
                },
            };
        },
    };
}
function createManifestParser() {
    const parser = {
        meta: { name: "vibestack/manifest-json", version: "1.0.0" },
        parseForESLint(text) {
            const { root, end } = parseJsonDocument(text);
            const loc = { start: { line: 1, column: 0 }, end };
            return {
                ast: {
                    type: "Program",
                    body: [],
                    sourceType: "module",
                    range: [0, text.length],
                    loc,
                    tokens: [],
                    comments: [],
                },
                services: {
                    manifest: root,
                    esTreeNodeToTSNodeMap: new WeakMap(),
                    tsNodeToESTreeNodeMap: new WeakMap(),
                },
                scopeManager: null,
                visitorKeys: { Program: [] },
            };
        },
    };
    protectedParsers.add(parser);
    return parser;
}
function findForbiddenInlineDisable(comments) {
    for (const comment of comments) {
        const trimmed = comment.value.trim();
        const disableMatch = /^eslint-disable(?:-next-line|-line)?(?:\s+([\s\S]*))?$/.exec(trimmed);
        if (disableMatch) {
            const rest = (disableMatch[1] ?? "").replace(/(?:^|\s+)--(?:[\s\S]*)$/, "").trim();
            if (!rest)
                return comment;
            const rules = rest.split(/[\s,]+/).filter(Boolean);
            if (rules.length === 0 || rules.some((rule) => rule.startsWith("barrel/")))
                return comment;
            continue;
        }
        if (/^eslint\s+[\s\S]*$/i.test(trimmed) && /(?:^|[\s,{])["']?barrel\//.test(trimmed)) {
            return comment;
        }
    }
    return undefined;
}
function guardBarrelDisable(parser) {
    if (protectedParsers.has(parser))
        return parser;
    const existing = guardedParsers.get(parser);
    if (existing)
        return existing;
    const wrapped = {
        meta: {
            name: `${parser.meta?.name ?? "parser"} with barrel/inline`,
            version: parser.meta?.version ?? "1.0.0",
        },
        parseForESLint(text, options) {
            const parsed = parser.parseForESLint(text, options);
            const forbidden = findForbiddenInlineDisable(parsed.ast.comments ?? []);
            if (forbidden) {
                throw Object.assign(new SyntaxError("Inline eslint-disable cannot suppress barrel/* or omit rule names."), { lineNumber: forbidden.loc.start.line, column: forbidden.loc.start.column + 1 });
            }
            return parsed;
        },
    };
    guardedParsers.set(parser, wrapped);
    protectedParsers.add(wrapped);
    return wrapped;
}
function isGlobalIgnore(entry) {
    return Array.isArray(entry.ignores) && Object.keys(entry).every((key) => GLOBAL_IGNORE_KEYS.has(key));
}
function targetsPackageJson(files) {
    if (typeof files === "string")
        return files.includes("package.json");
    if (Array.isArray(files))
        return files.some((item) => targetsPackageJson(item));
    return false;
}
function isEslintParser(value) {
    return typeof value === "object" && value !== null && "parseForESLint" in value && typeof value.parseForESLint === "function";
}
/**
 * Wraps an ESLint flat config to enforce barrel-only workspace exports (`barrel/exports` on workspace
 * `package.json` manifests) and barrel-only workspace imports (`barrel/no-subpath-imports` on JS/TS/VibeLang),
 * isolating `package.json` from non-manifest rules and blocking inline `eslint-disable` bypasses.
 */
export function withWorkspaceBarrels(config, options) {
    const { root, ratchet } = parseOptions(options);
    const workspace = discoverWorkspace(root);
    const manifestParser = createManifestParser();
    const barrelPlugin = {
        rules: {
            exports: createExportsRule(workspace.root, ratchet.exports),
            "no-subpath-imports": createNoSubpathImportsRule(workspace, ratchet.imports),
        },
    };
    const transformed = config.map((entry) => {
        if (isGlobalIgnore(entry))
            return entry;
        const next = { ...entry };
        if (!entry.language && !targetsPackageJson(entry.files)) {
            const prevIgnores = entry.ignores ?? [];
            if (!prevIgnores.includes("**/package.json")) {
                next.ignores = [...prevIgnores, "**/package.json"];
            }
        }
        const parser = entry.languageOptions?.parser;
        if (isEslintParser(parser)) {
            next.languageOptions = {
                ...entry.languageOptions,
                parser: guardBarrelDisable(parser),
            };
        }
        return next;
    });
    const importsEntry = {
        name: "vibestack/barrel-imports",
        files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vibe,vibex}"],
        plugins: { barrel: barrelPlugin },
        rules: { "barrel/no-subpath-imports": "error" },
    };
    transformed.push(importsEntry);
    if (workspace.manifestFiles.length > 0) {
        const exportsEntry = {
            name: "vibestack/barrel-exports",
            files: [...workspace.manifestFiles],
            ignores: [...workspace.manifestIgnores],
            languageOptions: {
                parser: manifestParser,
                parserOptions: { projectService: false, project: false, program: null },
            },
            plugins: { barrel: barrelPlugin },
            rules: { "barrel/exports": "error" },
        };
        transformed.push(exportsEntry);
    }
    return transformed;
}
const DEFAULT_IGNORES = [
    "**/gen/",
    "**/.vibe/",
    "**/dist/",
    "**/.cache/",
    "**/.spec-cache/",
    "**/generated/",
    "**/storybook-static/",
    "**/test/fixtures/",
    ".claude/",
    ".lemmascript/",
    ".studio/",
    ".turbo/",
    "_apalache-out/",
];
const STACK_REF = 'AGENTS.md, "The stack"';
const WRITING_REF = 'AGENTS.md, "Writing code"';
const BANNED_PACKAGES = ["redux", "react-redux", "zustand", "mobx", "jotai", "recoil", "valtio", "xstate", "vue", "svelte", "jest"];
const BANNED_SCOPES = ["reduxjs", "angular", "xstate", "vue", "sveltejs", "jest"];
const STACK_IMPORT_PATTERNS = [
    { regex: `^(?:@(?:${BANNED_SCOPES.join("|")})/|(?:${BANNED_PACKAGES.join("|")})(?:[/-]|$))`, message: `Not part of the stack: ${STACK_REF}.` },
];
const CITATION_RE = String.raw `spec\/\S+\.md, "[^"]+"`;
const SUPPRESSIBLE_RE = String.raw `(?!code\/|barrel\/|no-console\b)[\w@/-]+`;
const CITED_RE = new RegExp(String.raw `^\s*${CITATION_RE}(?:; ${CITATION_RE})*\s*$`);
const SUPPRESSION_RE = new RegExp(String.raw `^ eslint-disable(?:-next-line|-line)? ${SUPPRESSIBLE_RE}(?:, ${SUPPRESSIBLE_RE})* -- \S`);
const ALLOWED_INLINE_CONFIGS = [SUPPRESSION_RE, /^ eslint-enable\b/];
const THROWS_TYPE_RE = String.raw `[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*`;
const THROWS_DIRECTIVE_RE = new RegExp(String.raw `^\*(?:[\s*]*@throws \{[ \t]*${THROWS_TYPE_RE}(?:[ \t]*\|[ \t]*${THROWS_TYPE_RE})*[ \t]*\})+[\s*]*$`);
const CODE_DIRECTIVES = {
    Line: [CITED_RE, SUPPRESSION_RE, /^@ (?:backend|requires|ensures|invariant|decreases|assert|pure|type|ghost)(?: |$)/, /^\/ <reference /, /^ @vitest-environment [\w-]+$/],
    Block: [CITED_RE, ...ALLOWED_INLINE_CONFIGS, /^\*(?:[\s*]*@(?:model|design) \S+)+[\s*]*$/, THROWS_DIRECTIVE_RE],
    Shebang: [/^/],
};
const ANY_INLINE_CONFIG_RE = /^\s*(?:eslint(?:-[a-z]+)*|exported|globals?)(?:\s|$)/;
function createGuardedParser(parser) {
    return {
        meta: { name: `${parser.meta?.name ?? "parser"} with code/inline`, version: parser.meta?.version ?? "1.0.0" },
        parseForESLint(text, options) {
            const parsed = parser.parseForESLint(text, options);
            const loose = (parsed.ast.comments ?? []).find((comment) => ANY_INLINE_CONFIG_RE.test(comment.value) && !ALLOWED_INLINE_CONFIGS.some((form) => form.test(comment.value)));
            if (loose) {
                throw Object.assign(new SyntaxError(`Inline config here is only "eslint-disable[-next-line|-line] <rule>, … -- <reason>", never for code/*, barrel/* or no-console, and "eslint-enable" (${WRITING_REF}).`), { lineNumber: loose.loc.start.line, column: loose.loc.start.column + 1 });
            }
            return parsed;
        },
    };
}
function createCodePlugin(root) {
    const withinFunction = (node) => Boolean(node) && (/Function/.test(String(node?.type ?? "")) || withinFunction(node?.parent));
    const isDocComment = (context, comment) => Boolean(context.options[0]?.jsdoc) && comment.type === "Block" && String(comment.value).startsWith("*")
        && !withinFunction(context.sourceCode.getNodeByRangeIndex(comment.range[0]));
    const leftSchema = { type: "object", additionalProperties: { type: "integer", minimum: 1 } };
    const reportIfExcess = (context, found) => {
        const rel = relative(root, context.filename).split(sep).join("/");
        if (found.length > (context.options[0]?.left?.[rel] ?? 0)) {
            for (const problem of found)
                context.report(problem);
        }
    };
    const commentsRule = {
        meta: { type: "problem", schema: [{ type: "object", properties: { jsdoc: { type: "boolean" }, left: leftSchema }, additionalProperties: false }] },
        create(context) {
            return {
                Program() {
                    const invalid = context.sourceCode.getAllComments()
                        .filter((comment) => !(CODE_DIRECTIVES[comment.type] ?? []).some((directive) => directive.test(comment.value)) && !isDocComment(context, comment))
                        .map((comment) => ({ loc: comment.loc, message: `No code comments: only spec citations and tool directives (${WRITING_REF}).` }));
                    reportIfExcess(context, invalid);
                },
            };
        },
    };
    const usesIdentifier = (names) => `:matches(Identifier[name=${names}]:not(ImportSpecifier[imported.name=${names}] > Identifier.local):not(ObjectExpression > Property[computed=false][shorthand=false] > Identifier.key), MemberExpression[computed=true] > Literal.property[value=${names}])`;
    const schedulingSelectors = {
        [usesIdentifier(/^use(?:Layout|Insertion)?Effect$/)]: `No effect hooks: shared state lives in the spec-backed Machine (${WRITING_REF}).`,
        [usesIdentifier(/^(?:setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|requestIdleCallback)$/)]: `No timers: wait with Effect in VibeLang, or let the Machine say when (${WRITING_REF}).`,
    };
    const effectsRule = {
        meta: { type: "problem", schema: [{ type: "object", properties: { left: leftSchema }, additionalProperties: false }] },
        create(context) {
            const found = [];
            return {
                ...Object.fromEntries(Object.entries(schedulingSelectors).map(([selector, message]) => [selector, (node) => found.push({ node, message })])),
                "Program:exit": () => reportIfExcess(context, found),
            };
        },
    };
    return { rules: { comments: commentsRule, effects: effectsRule } };
}
function asConfigArray(value) {
    if (!value)
        return [];
    return Array.isArray(value) ? value : [value];
}
function mergeSettings(base, extra) {
    if (!extra)
        return base;
    if (!base)
        return extra;
    const merged = { ...base };
    for (const [key, value] of Object.entries(extra)) {
        const existing = merged[key];
        if (existing && typeof existing === "object" && !Array.isArray(existing) && value && typeof value === "object" && !Array.isArray(value)) {
            merged[key] = { ...existing, ...value };
        }
        else {
            merged[key] = value;
        }
    }
    return merged;
}
function scopeEntries(entries, files, extra = {}) {
    return entries.map((entry) => {
        const mergedSettings = mergeSettings(entry.settings, extra.settings);
        return {
            ...entry,
            ...extra,
            files,
            rules: { ...(entry.rules ?? {}), ...(extra.rules ?? {}) },
            ...(mergedSettings ? { settings: mergedSettings } : {}),
        };
    });
}
function createReactEntries(react, reactHooks) {
    const reactConfigs = asConfigArray(react?.configs?.["recommended-type-checked"]);
    const hooksConfigs = asConfigArray(reactHooks?.configs?.flat?.recommended);
    const combined = [...reactConfigs, ...hooksConfigs];
    const hookRuleNames = Object.keys(reactHooks?.rules ?? {});
    const reactRulesObj = reactConfigs.reduce((acc, c) => ({ ...acc, ...(c.rules ?? {}) }), {});
    const deduped = Object.fromEntries(hookRuleNames.filter((rule) => `@eslint-react/${rule}` in reactRulesObj).map((rule) => [`@eslint-react/${rule}`, "off"]));
    return scopeEntries(combined, ["**/*.tsx"], { rules: deduped });
}
/**
 * Reusable ESLint flat-config preset for Vibestack repositories. Consumers pass the ESLint plugins
 * installed in their own project, keeping `eslint.config.js` concise while enforcing stack rules,
 * workspace boundaries, design-system tokens, code discipline, and barrel-only exports.
 */
export function vibestackConfig(options) {
    const { root, plugins, design, extra = [] } = options;
    const tsx = options.tsx ?? ["packages/ui/**/*.{ts,tsx}", "apps/**/*.{ts,tsx}"];
    const own = options.own ?? ["apps/**", "packages/**"];
    const uiPackage = options.uiPackage ?? "packages/ui";
    const untyped = options.untyped ?? ["*.{js,ts}", "**/.storybook/**", ...(design ? [`${design}/**`] : [])];
    const commented = options.commented ?? {};
    const scheduled = options.scheduled ?? {};
    const jsPlugin = plugins.js;
    const tsPlugin = plugins.tseslint;
    const vibeParser = plugins.vibelang;
    const entries = [
        { ignores: [...DEFAULT_IGNORES, ...(options.ignores ?? [])] },
        { linterOptions: { reportUnusedDisableDirectives: "error", reportUnusedInlineConfigs: "error" } },
        ...asConfigArray(jsPlugin?.configs?.recommended),
        ...asConfigArray(tsPlugin?.configs?.recommendedTypeChecked),
    ];
    const baseRules = {
        "no-restricted-imports": ["error", { patterns: STACK_IMPORT_PATTERNS }],
        "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
        "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
        "@typescript-eslint/no-floating-promises": ["error", { allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: ["test", "describe", "it"] }] }],
        "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { arguments: false } }],
        "no-regex-spaces": "off",
        "no-warning-comments": ["error", { terms: ["todo", "fixme", "legacy", "deprecated"], location: "anywhere" }],
    };
    const baseEntry = {
        languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: root } },
        rules: baseRules,
    };
    if (plugins.boundaries) {
        baseEntry.plugins = { boundaries: plugins.boundaries };
        baseEntry.settings = { "boundaries/elements": [{ type: "package", pattern: ["packages/*", "apps/*"], capture: ["name"] }] };
        baseRules["boundaries/dependencies"] = ["error", {
                default: "disallow",
                policies: [{ from: { element: { type: "package" } }, allow: { to: { element: { type: "package", captured: { name: "{{ from.element.captured.name }}" } } } } }],
            }];
        baseRules["boundaries/no-unknown-dependencies"] = "error";
    }
    entries.push(baseEntry);
    if (tsPlugin?.configs?.disableTypeChecked && untyped.length) {
        entries.push(...scopeEntries(asConfigArray(tsPlugin.configs.disableTypeChecked), untyped));
    }
    entries.push({ ignores: ["**/test/**"], rules: { "max-lines-per-function": ["error", { max: 250, skipBlankLines: true, skipComments: true }] } });
    if (vibeParser) {
        const disableTyped = asConfigArray(tsPlugin?.configs?.disableTypeChecked);
        entries.push(...scopeEntries(disableTyped.length ? disableTyped : [{}], ["**/*.{vibe,vibex}"], {
            languageOptions: { parser: vibeParser, parserOptions: { projectService: false } },
            rules: { "no-undef": "off" },
        }));
    }
    entries.push({
        files: ["**/*.{schema,contract}.ts", "**/test/drivers/**", "**/*.vibe"],
        rules: { "no-restricted-imports": ["error", { patterns: [...STACK_IMPORT_PATTERNS, { regex: "^react(?:-dom)?(?:/|$)", message: "Domain, contract, driver and shell code does not import React." }] }] },
    });
    if (plugins.react && plugins.reactHooks) {
        entries.push(...createReactEntries(plugins.react, plugins.reactHooks));
    }
    if (design && plugins.tailwind) {
        const tokensFile = join(root, design, "tokens.json");
        if (existsSync(tokensFile)) {
            const tokens = parseTokens(JSON.parse(readFileSync(tokensFile, "utf8")));
            const dsConfigs = designSystem({ tailwind: plugins.tailwind, tokens, entryPoint: join(root, design, "generated/theme.css") });
            entries.push(...scopeEntries(dsConfigs, tsx, { settings: { "better-tailwindcss": { cwd: join(root, design) } } }));
        }
    }
    if (uiPackage && tsx.length) {
        entries.push({
            files: tsx,
            ignores: [`${uiPackage}/**`],
            rules: {
                "no-restricted-globals": ["error", ...["alert", "confirm", "prompt"].map((name) => ({ name, message: "Use Dialog or Alert from @repo/ui." }))],
                "no-restricted-syntax": ["error", { selector: "JSXOpeningElement[name.name=/^(input|textarea)$/]", message: "Use Input, Textarea or Checkbox from @repo/ui." }],
            },
        });
    }
    if (own.length) {
        const codePlugin = createCodePlugin(root);
        if (tsPlugin?.parser && isEslintParser(tsPlugin.parser)) {
            entries.push({ files: own, ignores: ["**/*.{vibe,vibex}"], languageOptions: { parser: createGuardedParser(tsPlugin.parser) } });
        }
        if (vibeParser) {
            entries.push({ files: own.map((pattern) => pattern.replace(/\/\*\*$/, "/**/*.{vibe,vibex}")), languageOptions: { parser: createGuardedParser(vibeParser) } });
        }
        entries.push({ files: own, plugins: { code: codePlugin }, rules: { "no-console": "error", "code/comments": ["error", { left: commented }], "code/effects": ["error", { left: scheduled }] } });
        if (uiPackage) {
            entries.push({ files: [`${uiPackage}/src/components/**`], ignores: ["**/*.meta.tsx"], rules: { "code/comments": ["error", { jsdoc: true, left: commented }] } });
        }
    }
    entries.push(...extra);
    return withWorkspaceBarrels(entries, { root, allowExports: options.allowExports, allowImports: options.allowImports });
}
