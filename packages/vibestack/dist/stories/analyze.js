import { createHash } from "node:crypto";
import { existsSync, globSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { formatStamp } from "../run.js";
import { fileCitations, owner, tsApi } from "../util.js";
/** A value in a metadata file that only running it would give, such as JSX or a function. */
const dynamic = Symbol("dynamic");
/** The package a directory belongs to: the nearest `package.json` above it. */
export function packageOf(dir, observe) {
    const file = join(dir, "package.json");
    observe?.(file);
    if (existsSync(file))
        return { name: JSON.parse(readFileSync(file, "utf8")).name ?? basename(dir), dir };
    return dirname(dir) === dir ? { name: basename(dir), dir } : packageOf(dirname(dir), observe);
}
/** `spec/billing/index.md` is `billing`, `spec/billing/payments.md` is `billing__payments` (SPEC.md, "Writing a spec"). */
const moduleOf = (spec) => spec.replace(/^(\.\/)?spec\//, "").replace(/\.md$/, "").replace(/\/index$/, "").replaceAll("/", "__");
/**
 * The generated module of `spec`: in the component's own package, or, for a shared package such as a component
 * library, in the spec's owner, else the root's (SPEC.md, "One spec tree").
 */
export const modelFile = (abs, spec, observe) => {
    const own = packageOf(dirname(abs)).dir, name = `${moduleOf(spec)}.ts`;
    const parents = ancestors(own);
    const root = parents.find((dir) => existsSync(join(dir, spec)));
    if (observe) {
        const boundary = root ?? parents.findLast((dir) => existsSync(join(dir, "package.json"))) ?? own;
        for (const parent of parents) {
            observe(join(parent, spec));
            if (parent === boundary)
                break;
        }
    }
    const dir = root && owner(root, spec.replace(/^\.\//, ""), observe);
    const candidates = [join(own, "gen", name), ...(root && dir ? [join(root, dir, "gen", name)] : []), ...(root ? [join(root, "gen", name)] : [])];
    return candidates.find((file) => {
        observe?.(file);
        return existsSync(file);
    });
};
const ancestors = (dir) => (dirname(dir) === dir ? [dir] : [dir, ...ancestors(dirname(dir))]);
export const modelTag = (text) => /@model\s+(\S+)/.exec(text)?.[1];
const skippedSource = /(^|\/)(node_modules|\.[^/]+)\/|\.(test|spec|stories|meta)\.tsx?$|\.d\.ts$/;
export const isComponentSource = (file) => file.endsWith(".tsx") && !skippedSource.test(file);
/** The component files the globs name, sorted: never tests, stories, metadata or anything installed. */
export function sources(root, globs) {
    return globSync(globs, { cwd: root }).map((file) => file.replaceAll("\\", "/")).filter(isComponentSource).sort().map((file) => join(root, file));
}
/** Plain order of text, the same on every machine. */
export const compare = (a, b) => Number(a > b) - Number(a < b);
/** Where `<name>.meta.ts(x)` or `<name>.stories.ts(x)` would stand beside a component. */
const sibling = (abs, name, kind) => ["tsx", "ts"].map((ext) => join(dirname(abs), `${name}.${kind}.${ext}`));
/** The files beside a component that change its stories, present or not: metadata, hand-written stories, its model. */
export function beside(abs, names) {
    const spec = existsSync(abs) ? modelTag(readFileSync(abs, "utf8")) : undefined;
    const model = spec && modelFile(abs, spec);
    return [...names.flatMap((name) => [...sibling(abs, name, "meta"), ...sibling(abs, name, "stories")]), ...(model ? [model] : [])];
}
export function programs(root, configs, configLookups) {
    const ts = tsApi();
    const rel = (file) => relative(root, file).replaceAll("\\", "/");
    const fail = (problem) => {
        throw new Error(ts.flattenDiagnosticMessageText(problem.messageText, "\n"));
    };
    const given = ts.getParsedCommandLineOfConfigFile(join(root, "tsconfig.json"), {}, {
        ...ts.sys, onUnRecoverableConfigFileDiagnostic: fail,
        readDirectory: () => [],
        directoryExists(dir) {
            const exists = ts.sys.directoryExists(dir);
            if (!exists)
                configLookups.push(["directory", rel(dir)]);
            return exists;
        },
        realpath(file) {
            const resolved = ts.sys.realpath(file);
            if (resolved !== file)
                configLookups.push(["realpath", rel(file), rel(resolved)]);
            return resolved;
        },
        fileExists(file) {
            const exists = ts.sys.fileExists(file);
            if (!exists)
                configs.set(file, undefined);
            return exists;
        },
        readFile(file) {
            const content = ts.sys.readFile(file);
            configs.set(file, content);
            if (content !== undefined) {
                const resolved = ts.sys.realpath(file);
                if (resolved !== file) {
                    configs.set(resolved, content);
                    configLookups.push(["realpath", rel(file), rel(resolved)]);
                }
            }
            return content;
        },
    }).options;
    const options = { ...given, jsx: given.jsx ?? ts.JsxEmit.ReactJSX, noEmit: true, skipLibCheck: true };
    const host = ts.createCompilerHost(options, true);
    const parse = host.getSourceFile;
    const parsed = new Map();
    host.getSourceFile = (name, ...rest) => {
        const stat = statSync(name, { bigint: true, throwIfNoEntry: false });
        const stamp = stat ? formatStamp(stat) : "";
        if (parsed.get(name)?.stamp !== stamp)
            parsed.set(name, { stamp, file: parse(name, ...rest) });
        return parsed.get(name).file;
    };
    const imports = new Map();
    const installed = (file) => /(^|[\\/])node_modules([\\/]|$)/.test(file);
    const links = new Map();
    let moduleCache;
    host.resolveModuleNameLiterals = (literals, from, redirected, options, source) => {
        const dependencies = new Set();
        const probes = new Map();
        const record = (op) => probes.set(op[0] + "\0" + op[1], op);
        const owned = (file) => {
            if (!installed(file))
                return file;
            const pkg = /^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)(?=[\\/]|$)/.exec(file)?.[1];
            if (!pkg)
                return;
            if (!links.has(pkg)) {
                const resolved = ts.sys.realpath(pkg);
                links.set(pkg, installed(resolved) ? undefined : resolved);
            }
            const target = links.get(pkg);
            if (!target)
                return;
            record(["realpath", rel(pkg), rel(target)]);
            return target + file.slice(pkg.length);
        };
        const observing = {
            ...host,
            fileExists(file) {
                const exists = host.fileExists(file);
                const input = !exists && owned(file);
                if (input)
                    record(["file", rel(input)]);
                return exists;
            },
            directoryExists(dir) {
                const exists = ts.sys.directoryExists(dir);
                const input = !exists && owned(dir);
                if (input)
                    record(["directory", rel(input)]);
                else if (!exists && /[\\/]node_modules(?:[\\/]@[^\\/]+)?(?:[\\/][^\\/]+)?$/.test(dir))
                    record(["directory", rel(dir)]);
                return exists;
            },
            readFile(file) {
                const text = host.readFile(file);
                const input = text !== undefined && owned(file);
                if (input && text !== undefined)
                    record(["manifest", rel(input), createHash("sha1").update(text).digest("hex")]);
                return text;
            },
            realpath(file) {
                const resolved = ts.sys.realpath(file);
                if (resolved !== file && !installed(resolved))
                    record(["realpath", rel(file), rel(resolved)]);
                return resolved;
            },
        };
        const internal = !owned(from);
        const modules = literals.map((literal) => {
            const mode = ts.getModeForUsageLocation(source, literal, options);
            const result = ts.resolveModuleName(literal.text, from, options, internal ? host : observing, internal ? moduleCache : undefined, redirected, mode);
            const file = result.resolvedModule?.resolvedFileName;
            const input = !internal && file && owned(file);
            if (file && input) {
                dependencies.add(file);
                dependencies.add(input);
            }
            return result;
        });
        if (!internal)
            imports.set(from, { files: [...dependencies], lookups: [...probes.values()] });
        return modules;
    };
    let last;
    return (files, reset) => {
        links.clear();
        moduleCache = ts.createModuleResolutionCache(host.getCurrentDirectory(), host.getCanonicalFileName, options);
        if (reset)
            imports.clear();
        const metas = [...new Set(files.map(dirname))].flatMap((dir) => readdirSync(dir).filter((name) => /\.meta\.tsx?$/.test(name)).map((name) => join(dir, name)));
        const models = files.flatMap((file) => beside(file, []).filter((input) => input.endsWith(".ts") && existsSync(input)));
        last = ts.createProgram({ rootNames: [...new Set([...files, ...metas, ...models])], options, host, oldProgram: reset ? undefined : last });
        return { program: last, imports };
    };
}
const key = (ts, name) => (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : undefined);
const declared = (ts, file, name) => file.statements.flatMap((s) => (ts.isVariableStatement(s) ? [...s.declarationList.declarations] : [])).find((d) => d.name.getText() === name);
const exported = (ts, s) => ts.canHaveModifiers(s) && ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
function bare(ts, node) {
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))
        node = node.expression;
    return node;
}
function literal(ts, given, seen = new Set()) {
    if (!given)
        return undefined;
    const node = bare(ts, given);
    if (seen.has(node))
        return dynamic;
    if (ts.isStringLiteralLike(node))
        return node.text;
    if (ts.isNumericLiteral(node))
        return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword)
        return node.kind === ts.SyntaxKind.TrueKeyword;
    if (node.kind === ts.SyntaxKind.NullKeyword)
        return null;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
        seen.add(node);
        const n = literal(ts, node.operand, seen);
        seen.delete(node);
        return typeof n === "number" ? -n : dynamic;
    }
    if (ts.isArrayLiteralExpression(node)) {
        seen.add(node);
        const items = node.elements.map((el) => literal(ts, el, seen));
        seen.delete(node);
        return items.includes(dynamic) ? dynamic : items;
    }
    if (ts.isObjectLiteralExpression(node)) {
        seen.add(node);
        const result = Object.fromEntries(node.properties.flatMap((p) => {
            const name = p.name && key(ts, p.name);
            return name === undefined ? [[dynamic, true]] : [[name, ts.isPropertyAssignment(p) ? literal(ts, p.initializer, seen) : ts.isShorthandPropertyAssignment(p) ? literal(ts, p.name, seen) : dynamic]];
        }));
        seen.delete(node);
        return result;
    }
    if (!ts.isIdentifier(node))
        return dynamic;
    const named = declared(ts, node.getSourceFile(), node.text)?.initializer;
    if (!named)
        return node.text === "undefined" ? undefined : dynamic;
    seen.add(node);
    const resolved = literal(ts, named, seen);
    seen.delete(node);
    return resolved;
}
const record = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const records = (value) => Object.fromEntries(Object.entries(record(value)).map(([name, v]) => [name, record(v)]));
const FIELDS = ["args", "examples", "states", "bounds", "schema", "decorator", "play"];
function readMeta(ts, checker, file) {
    const node = declared(ts, file, "meta")?.initializer;
    const object = node && bare(ts, node);
    if (!object || !ts.isObjectLiteralExpression(object))
        return undefined;
    const meta = record(literal(ts, object));
    const schema = object.properties.find((p) => p.name && key(ts, p.name) === "schema");
    const covered = schema && checker.getTypeAtLocation(schema).getProperty("Type");
    return {
        file: file.fileName,
        args: record(meta.args),
        examples: records(meta.examples),
        states: records(meta.states),
        bounds: record(meta.bounds),
        open: meta.args === dynamic || dynamic in record(meta.args),
        schema: schema && (covered ? checker.getTypeOfSymbol(covered).getProperties().map((p) => p.name) : []),
        decorator: "decorator" in meta,
        play: Object.keys(record(meta.play)),
        extra: Object.keys(meta).filter((name) => !FIELDS.includes(name)),
    };
}
function readManual(ts, file) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const main = record(literal(ts, source.statements.find(ts.isExportAssignment)?.expression));
    const names = source.statements.flatMap((s) => (!exported(ts, s) ? [] : ts.isVariableStatement(s) ? s.declarationList.declarations.map((d) => d.name.getText()) : ts.isFunctionDeclaration(s) && s.name ? [s.name.text] : []));
    return { file, id: typeof main.id === "string" ? main.id : undefined, title: typeof main.title === "string" ? main.title : undefined, exports: names };
}
function readModel(ts, checker, file, spec) {
    const namespace = checker.getSymbolAtLocation(file);
    if (!namespace)
        return;
    const exports = new Map(checker.getExportsOfModule(namespace).map((s) => [s.name, s]));
    const initial = exports.get("initial");
    const event = exports.get("Event");
    if (!initial)
        return undefined;
    const state = checker.getTypeOfSymbol(initial);
    const events = event ? checker.getDeclaredTypeOfSymbol(event) : undefined;
    const names = (events?.isUnion() ? events.types : events ? [events] : []).flatMap((t) => {
        const tag = t.getProperty("type");
        const of = tag && checker.getTypeOfSymbol(tag);
        return of?.isStringLiteral() ? [of.value] : [];
    });
    return { model: { spec, module: moduleOf(spec), state: checker.typeToString(state), events: names, file: file.fileName, initial: literal(ts, declared(ts, file, "initial")?.initializer) }, state };
}
function shape(ts, checker, type, text) {
    const whole = checker.getNonNullableType(type);
    const parts = whole.isUnion() ? whole.types : [whole];
    const all = (flags) => parts.every((t) => t.flags & flags);
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown))
        return { kind: "unknown" };
    if (whole.getCallSignatures().length)
        return { kind: "function" };
    if (checker.isArrayType(whole) || checker.isTupleType(whole))
        return { kind: "array" };
    if (parts.some((t) => /^(ReactElement|ReactPortal|Element)$/.test((t.aliasSymbol ?? t.symbol)?.name ?? "")))
        return { kind: "node" };
    if (all(ts.TypeFlags.BooleanLike))
        return { kind: "boolean" };
    if (all(ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral)) {
        const options = parts.map((t) => (t.isLiteral() ? t.value : checker.typeToString(t) === "true"));
        const at = (option) => {
            const found = new RegExp(`(?<![\\w-])${String(option).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).exec(text);
            return found ? found.index : Infinity;
        };
        return { kind: "union", options: options.sort((a, b) => at(a) - at(b) || (typeof a === "number" && typeof b === "number" ? a - b : compare(String(a), String(b)))) };
    }
    if (all(ts.TypeFlags.NumberLike))
        return { kind: "number" };
    if (all(ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike))
        return { kind: "string" };
    return { kind: all(ts.TypeFlags.Object | ts.TypeFlags.Intersection) ? "object" : "unknown" };
}
function body(ts, decl) {
    let node = ts.isVariableDeclaration(decl) ? decl.initializer : decl;
    while (node && ts.isExpression(node)) {
        const unwrapped = bare(ts, node);
        if (!ts.isCallExpression(unwrapped)) {
            node = unwrapped;
            break;
        }
        node = unwrapped.arguments[0];
    }
    return node && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) ? node : undefined;
}
const GEN_MODULE = /(?:^|\/)gen\/[^/]+\.(?:ts|effect\.vibe)$/;
function readCitations(text) {
    const seen = new Set();
    const out = [];
    for (const { spec, heading } of fileCitations("", text)) {
        const id = `${spec}\0${heading}`;
        if (seen.has(id))
            continue;
        seen.add(id);
        out.push({ spec, heading });
    }
    return out;
}
function genUses(ts, file) {
    const names = new Set();
    for (const statement of file.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
            continue;
        if (!GEN_MODULE.test(statement.moduleSpecifier.text))
            continue;
        const clause = statement.importClause;
        if (!clause || clause.isTypeOnly)
            continue;
        if (clause.name)
            names.add(clause.name.text);
        const bindings = clause.namedBindings;
        if (!bindings)
            continue;
        if (ts.isNamespaceImport(bindings))
            names.add(bindings.name.text);
        else
            for (const element of bindings.elements)
                if (!element.isTypeOnly)
                    names.add(element.propertyName?.text ?? element.name.text);
    }
    return [...names].sort(compare);
}
function jsxChildren(ts, decl, self) {
    const root = body(ts, decl)?.body;
    if (!root)
        return [];
    const names = new Set();
    const visit = (node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tag = node.tagName;
            const name = ts.isIdentifier(tag) ? tag.text : ts.isPropertyAccessExpression(tag) && tag.name.text !== "Fragment" ? tag.getText() : "";
            if (/^[A-Z]/.test(name) && name !== "Fragment" && name !== self)
                names.add(name);
        }
        ts.forEachChild(node, visit);
    };
    visit(root);
    return [...names].sort(compare);
}
function variantDefaults(ts, decl) {
    const call = decl && ts.findAncestor(decl, (n) => ts.isCallExpression(n) && n.expression.getText() === "cva");
    return record(record(literal(ts, call?.arguments[1])).defaultVariants);
}
export const STATE = /^(disabled|loading|error|invalid)$/;
export function analyze(built, abs) {
    const ts = tsApi();
    const checker = built.getTypeChecker();
    const file = built.getSourceFile(abs);
    const module = file && checker.getSymbolAtLocation(file);
    if (!file || !module)
        return [];
    const own = (d) => !built.isSourceFileFromExternalLibrary(d.getSourceFile()) && !built.isSourceFileDefaultLibrary(d.getSourceFile());
    const spec = modelTag(file.text);
    const model = spec && modelFile(abs, spec);
    const gen = model && built.getSourceFile(model);
    const citations = readCitations(file.text);
    const uses = genUses(ts, file);
    const found = checker.getExportsOfModule(module).flatMap((exportOf) => {
        const symbol = exportOf.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exportOf) : exportOf;
        const decl = symbol.valueDeclaration;
        if (!/^[A-Z]/.test(exportOf.name) || !decl || decl.getSourceFile() !== file)
            return [];
        const signature = checker.getTypeOfSymbolAtLocation(symbol, decl).getCallSignatures()[0];
        if (!signature || !/Element|ReactNode|^any$/.test(checker.typeToString(signature.getReturnType())))
            return [];
        const tags = (name) => symbol.getJsDocTags(checker).filter((t) => t.name === name).map((t) => ts.displayPartsToString(t.text).trim());
        const metaSource = sibling(abs, exportOf.name, "meta").map((path) => built.getSourceFile(path)).find(Boolean);
        const meta = metaSource && readMeta(ts, checker, metaSource);
        const manual = sibling(abs, exportOf.name, "stories").find(existsSync);
        const { model, state } = (gen && tags("model").length ? readModel(ts, checker, gen, spec) : undefined) ?? {};
        const binding = body(ts, decl)?.parameters[0]?.name;
        const taken = new Map((binding && ts.isObjectBindingPattern(binding) ? binding.elements : []).filter((e) => !e.dotDotDotToken).map((e) => [(e.propertyName ?? e.name).getText(), e.initializer]));
        const mentioned = new Set([...Object.keys(meta?.args ?? {}), ...Object.values(meta?.examples ?? {}).flatMap((example) => Object.keys(example)), ...Object.keys(meta?.bounds ?? {}), ...(meta?.schema ?? [])]);
        const first = signature.parameters[0];
        const symbols = (first ? checker.getPropertiesOfType(checker.getTypeOfSymbolAtLocation(first, decl)) : [])
            .filter((p) => p.name === "children" || taken.has(p.name) || mentioned.has(p.name) || STATE.test(p.name) || p.declarations?.some(own));
        symbols.sort((a, b) => {
            const left = a.valueDeclaration ?? a.declarations?.[0];
            const right = b.valueDeclaration ?? b.declarations?.[0];
            return compare(left?.getSourceFile().fileName ?? "", right?.getSourceFile().fileName ?? "")
                || (left?.pos ?? 0) - (right?.pos ?? 0) || compare(a.name, b.name);
        });
        const props = symbols.map((p) => {
            const type = checker.getTypeOfSymbolAtLocation(p, decl);
            const at = p.declarations?.find(own);
            const written = at && ts.isPropertySignature(at) && at.type ? checker.getTypeFromTypeNode(at.type).aliasSymbol?.declarations?.[0] : undefined;
            const preset = taken.get(p.name) ? literal(ts, taken.get(p.name)) : variantDefaults(ts, at)[p.name];
            if (model && checker.getNonNullableType(type) === state)
                model.prop ??= p.name;
            const description = ts.displayPartsToString(p.getDocumentationComment(checker));
            return {
                name: p.name,
                ...shape(ts, checker, type, (written ?? at)?.getText() ?? ""),
                required: !(p.flags & ts.SymbolFlags.Optional),
                ...(preset !== undefined && preset !== dynamic ? { default: preset } : {}),
                ...(description ? { description } : {}),
            };
        });
        const children = jsxChildren(ts, decl, exportOf.name);
        return [{
                name: exportOf.name,
                file: abs,
                line: file.getLineAndCharacterOfPosition(decl.getStart()).line + 1,
                description: ts.displayPartsToString(symbol.getDocumentationComment(checker)),
                package: packageOf(dirname(abs)).name,
                props,
                meta,
                manual: manual ? readManual(ts, manual) : undefined,
                model,
                ...(gen && tags("model").length && !model ? { unlinked: `@model ${spec} has no state to show: ${moduleOf(spec)}.ts exports no \`initial\`; name the spec whose model holds what it shows` } : {}),
                design: tags("design"),
                inherited: symbols.filter((p) => !p.declarations?.some(own)).map((p) => p.name),
                ...(children.length ? { children } : {}),
                ...(citations.length ? { citations } : {}),
                ...(uses.length ? { uses } : {}),
            }];
    });
    const whole = basename(abs).replace(/\.tsx?$/, "");
    return found.some((c) => c.name === whole) ? found.map((c) => (c.name === whole ? c : { ...c, part: whole })) : found;
}
