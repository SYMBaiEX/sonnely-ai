// Quint IR -> TypeScript. Reads the JSON that `quint typecheck --out` writes for a
// pure module and emits one TypeScript module annotated for LemmaScript, plus a
// Quint harness module that drives the same definitions for simulation.
//
// The supported Quint subset is deliberately small; anything outside it throws
// with the name of the construct, so a spec can never be silently mistranslated.
//
// This file reads the module: what it imports, which names it may bind and how a
// name is spelled. The rest is in gen/: types.ts (everything decided by a type),
// print.ts (expressions), classify.ts (which definition is a transition, a guard
// or a rule), secrecy.ts (where a secret may go), typescript.ts and harness.ts (the two outputs).
import { classify, ROLES, SENDER } from "./gen/classify.js";
import { harness, HARNESS } from "./gen/harness.js";
import { BUILTIN, printer } from "./gen/print.js";
import { checkSecrets } from "./gen/secrecy.js";
import { EMITTED, HELPERS, typescript } from "./gen/typescript.js";
import { fail, typeOfIn, typeWalks } from "./gen/types.js";
import path from "node:path";
/** Names a spec may not bind: the generated code, the harness, Dafny's standard library (Std) or the proof library (ProofLib) use them, TypeScript reserves them, or Dafny does and LemmaScript passes them on unchanged. */
const TAKEN = new Set([...EMITTED, ...HARNESS, ...`
  Std ProofLib Number Math Object Array JSON Record Set Map String Boolean Symbol Error RangeError undefined NaN Infinity globalThis
  break case catch class const continue debugger default delete do else enum export extends false finally for function
  if import in instanceof new null return super switch this throw true try typeof var void while with yield let static await
  eval arguments implements interface package private protected public
  assigned least greatest older hide
`.split(/\s+/).filter(Boolean)]);
const RULE_OR_GUARD = new RegExp(`^(${[...ROLES, "can"].join("|")})[A-Z]`);
const GENERATED = new RegExp(`^(${[...HELPERS, "eval", "Out", "set", "opaque", "table", "else"].join("|")})_|^x\\d+$|__\\d+$`);
const WITNESS_PREFIX = "eval_witness_";
const REFUSAL_PREFIX = "eval_refuse_";
function concreteWitnesses(defs, roles, at) {
    const tuple = (value) => value.kind === "app" && value.opcode === "Tup" ? value.args : undefined;
    const transitions = new Map(roles.transitions.map((t) => [t.name, t]));
    const count = (t) => t.params.length + Number(!!roles.sender && !t.params.some((p) => p.name === SENDER));
    const stepsFor = (def) => {
        const target = def.name.slice(WITNESS_PREFIX.length);
        const guard = roles.transitions.some((t) => t.guard === target);
        if (!guard && !roles.sometimes.includes(target))
            fail(`${at(def.name)}: name a declared \`sometimes\` rule or transition guard after \`${WITNESS_PREFIX}\``);
        const items = tuple(def.expr);
        const first = items?.[0];
        const event = first?.kind === "str" && transitions.get(first.value);
        const rows = items && !(event && count(event) > 0) ? items : [def.expr];
        const steps = rows.map((row, index) => {
            const [name, ...args] = tuple(row) ?? [row];
            const transition = name?.kind === "str" && transitions.get(name.value);
            if (!transition)
                return fail(`${at(def.name)}: step ${index + 1} must name a transition of this model`);
            if (args.length !== count(transition))
                return fail(`${at(def.name)}: step ${index + 1} (${transition.name}) takes ${count(transition)} arguments`);
            const reference = `M::${def.name}${rows === items ? `._${index + 1}` : ""}`;
            return { transition, args: args.map((_, i) => `${reference}._${i + 2}`) };
        });
        if (!steps.length)
            fail(`${at(def.name)}: give at least one transition`);
        if (guard && steps.at(-1)?.transition.guard !== target)
            fail(`${at(def.name)}: the last transition must be guarded by ${target}`);
        return [target, steps];
    };
    return new Map(defs.map(stepsFor));
}
/** Eager values may read later declarations, including through function calls. Follow Quint's local bindings. */
function orderedConstants(code) {
    const definitions = new Map(code.map((d) => [d.name, d]));
    const seen = new Set();
    const values = [];
    function visit(def) {
        if (seen.has(def.name))
            return;
        seen.add(def.name);
        function read(e, locals) {
            if (e.kind === "let") {
                read(e.opdef.expr, locals);
                read(e.expr, new Set([...locals, e.opdef.name]));
            }
            else if (e.kind === "lambda") {
                read(e.expr, new Set([...locals, ...e.params.map((p) => p.name)]));
            }
            else if (e.kind === "name" || e.kind === "app") {
                const name = e.kind === "name" ? e.name : e.opcode;
                const dep = definitions.get(name);
                if (dep && !locals.has(name))
                    visit(dep);
                if (e.kind === "app")
                    for (const arg of e.args)
                        read(arg, locals);
            }
        }
        read(def.expr, new Set());
        if (def.qualifier === "pureval")
            values.push(def);
    }
    for (const def of code)
        if (def.qualifier === "pureval")
            visit(def);
    return values;
}
export function generate(ir, name, source, origin, deps) {
    // Quint assigns IDs as it parses the source, then reorders declarations for typechecking.
    // Emit by numeric source ID so a simulator-only declaration cannot reshuffle the ordinary model.
    const module = ir.modules.find((m) => m.name === name) ?? fail(`module ${name} not found`);
    const decls = module.declarations.toSorted((a, b) => a.id - b.id);
    // --- what the module imports -------------------------------------------------
    // `import kernel.* from "./kernel"` brings a library's names in as they are. `import order as O from "./order"`
    // brings any spec in, a state machine included, under the names O::pay, O::Order and so on.
    /** A spec's path below spec/ (or std/), as an import names it. */
    const stem = (file) => file.replaceAll(path.sep, "/").replace(/^(?:spec|std)\//, "").replace(/(^|\/)index\.md$|\.md$/, "");
    const links = decls.filter((d) => d.kind === "import").map((d) => {
        const dep = deps.get(d.protoName) ?? fail(`internal: ${d.protoName} has no model`);
        // How this spec writes the import: the path relative to it, and the name it ends in (SPEC.md, "Using one spec from another").
        const rel = path.posix.relative(path.posix.dirname(stem(source)), stem(dep.source));
        const from = rel.startsWith("../") ? rel : `./${rel}`;
        const short = from.split("/").pop();
        if (dep.opaques.length)
            fail(`import of ${short}: it declares opaque functions (${dep.opaques.map((o) => o.name).join(", ")}), which only its own spec can simulate; move them into the spec that imports it`);
        if (d.qualifiedName)
            return { module: dep.name, exports: dep.exports, alias: d.qualifiedName };
        if (d.defName !== "*")
            fail(`import ${short}: write \`import ${short}.* from "${from}"\` or \`import ${short} as X from "${from}"\``);
        if (dep.stateType)
            fail(`import of ${short}: a spec with a state of its own is imported under a name, as in \`import ${short} as X from "${from}"\``);
        return { module: dep.name, exports: dep.exports, alias: undefined };
    });
    const imports = links.map((l) => l.module);
    const twice = imports.find((m, i) => imports.indexOf(m) !== i);
    if (twice)
        fail(`${twice} is imported twice; import a spec once, either as it is or under one name`);
    const qualify = (alias, n) => (alias ? `${alias}::${n}` : n);
    /** An imported name as this module writes it, and the module it came from. */
    const imported = (kind) => links.flatMap((l) => l.exports[kind].map((n) => [qualify(l.alias, n), l.module]));
    const cameFrom = new Map(imported("values"));
    // --- what it defines ------------------------------------------------------------
    const localTypedefs = decls.filter((d) => d.kind === "typedef");
    for (const d of localTypedefs)
        d.module = name; // so that the harness can name a type by the module that defines it
    const localVariants = localTypedefs.flatMap((t) => (t.type.kind === "sum" ? t.type.fields.fields.map((f) => f.fieldName) : []));
    const variants = new Set([...localVariants, ...imported("variants").map(([n]) => n)]);
    const defs = decls.filter((d) => d.kind === "def" && !localVariants.includes(d.name) && !BUILTIN.test(d.name));
    for (const d of [...decls.filter((d) => !["def", "typedef", "import", "const"].includes(d.kind)), ...defs.filter((d) => d.qualifier !== "puredef" && d.qualifier !== "pureval")])
        fail(`${d.name ?? d.kind}: only types, imports, \`pure val\` and \`pure def\` belong in a spec, besides the \`const\` of an opaque function (state and actions are generated)`);
    const inferred = (id) => ir.types[id]?.type;
    const typeOf = typeOfIn(inferred);
    // A set named `<param>Values` tells the simulator what to try for a parameter. It never reaches TypeScript, so any Quint is allowed in it.
    const isSampleSet = (d) => d.qualifier === "pureval" && d.name.endsWith("Values") && inferred(d.id)?.kind === "set";
    const ownSamples = defs.filter(isSampleSet).map((d) => ({ name: d.name, elem: inferred(d.id).elem }));
    // `weight_<event>`, `fair_<event>` and `within_<rule>` tell the simulator how often to try an event, which events a run
    // cannot put off for ever and how soon a `leadsTo` rule is met (SPEC.md, "What goes in the Quint blocks"); like
    // sample sets, they never reach TypeScript.
    const settings = defs.filter((d) => d.qualifier === "pureval" && /^(weight|fair|within)_/.test(d.name));
    const examples = defs.filter((d) => d.qualifier === "pureval" && d.name.startsWith(WITNESS_PREFIX));
    const refusalExamples = defs.filter((d) => d.qualifier === "pureval" && d.name.startsWith(REFUSAL_PREFIX));
    const guides = [...examples, ...refusalExamples];
    const code = defs.filter((d) => !isSampleSet(d) && !settings.includes(d) && !guides.includes(d));
    /** Names only the simulator reads; a definition that used one would refer to nothing in TypeScript. */
    const simulatorOnly = new Set([...ownSamples, ...settings, ...guides, ...links.flatMap((l) => l.exports.samples.map((s) => ({ name: qualify(l.alias, s.name) })))].map((d) => d.name));
    // `const f: (A, B) => R` is an opaque function: no body, only the laws stated with it (SPEC.md, "Opaque functions").
    const consts = decls.filter((d) => d.kind === "const");
    for (const d of consts)
        if (d.typeAnnotation?.kind !== "oper" || !d.typeAnnotation.args.length)
            fail(`${d.name}: a \`const\` is an opaque function, written \`const ${d.name}: (A, B) => R\` on one line`);
    const localNames = new Set([...code, ...consts].map((d) => d.name));
    const beneath = (m) => [m, ...deps.get(m).imports.flatMap(beneath)];
    const prefixes = [...new Set(imports.flatMap(beneath))];
    /** A name the spec binds (a type, definition, parameter or local `val`) must survive translation unchanged. */
    const bind = (n, witness = false) => {
        const owner = prefixes.find((m) => n.startsWith(`${m}_`));
        return TAKEN.has(n) || (!witness && GENERATED.test(n)) ? fail(`\`${n}\` cannot be used as a name: TypeScript or the generated code uses it`)
            : variants.has(n) ? fail(`\`${n}\` is a variant of a type and cannot also name a parameter or value`)
                : owner ? fail(`\`${n}\` cannot be used as a name: names beginning ${owner}_ are how the generated code refers to that module`)
                    : n;
    };
    [...defs, ...localTypedefs, ...consts].forEach((d) => bind(d.name, guides.includes(d)));
    // --- types: the module's own, and those of what it imports under the names it knows them by ---
    /** A type from a module imported under a name, with the types it mentions renamed the same way. */
    const requalify = (t, alias) => !alias || t === null || typeof t !== "object" ? t
        : Array.isArray(t) ? t.map((x) => requalify(x, alias))
            : t.kind === "const" ? { ...t, name: qualify(alias, t.name) }
                : Object.fromEntries(Object.entries(t).map(([k, v]) => [k, requalify(v, alias)]));
    // Every type a module can name comes along with it, including what it imported itself: a machine whose state holds a
    // library's type is imported under a name together with that type (as M::T), however deep the import.
    const seen = new Set();
    const typedefs = [
        ...links.flatMap((l) => l.exports.visible.map((d) => ({ ...d, type: requalify(d.type, l.alias), name: qualify(l.alias, d.name), alias: l.alias ?? d.alias, base: d.base ?? d.name }))),
        ...localTypedefs,
    ].filter((d) => !seen.has(d.name) && !!seen.add(d.name));
    /** Modules whose types this one names without importing them itself; the harness and the TypeScript import them too. */
    const typeOnly = [...new Set(typedefs.map((d) => d.module))].filter((m) => m !== name && !imports.includes(m)).sort();
    const types = typeWalks(typedefs, name);
    /**
     * What each sample set holds, how the harness names it and, for the spec's own, where the spec defines it, so that
     * the harness can hold it to the parameter it is for. The sets of the specs this one imports apply too; its own win.
     */
    const samples = new Map([
        ...links.flatMap((l) => l.exports.samples.map((s) => [s.name, { elem: requalify(s.elem, l.alias), ref: `D_${l.module}::${s.name}`, line: undefined }])),
        ...ownSamples.map((s) => [s.name, { elem: s.elem, ref: `M::${s.name}`, line: origin(s.name)?.line }]),
    ]);
    // --- definitions, by the naming convention ----------------------------------------
    const sig = (d) => {
        const t = typeOf(d.id);
        const params = d.expr.params.map((p, i) => ({ name: bind(p.name), type: t.args[i] }));
        return { params, result: t.res };
    };
    const vals = orderedConstants(code);
    const constantIds = new Map(vals.map((value) => [value.name, value.id]));
    const funs = code.filter((d) => d.qualifier === "puredef");
    for (const d of funs)
        if (d.expr.kind !== "lambda")
            fail(`${d.name}: a \`pure def\` takes parameters; for a constant write \`pure val ${d.name} = …\``);
    // A rule must be a definition: as a `pure val` it would be generated as a constant and never checked.
    for (const v of vals)
        if (RULE_OR_GUARD.test(v.name) && typeOf(v.id).kind === "bool")
            fail(`${v.name}: a rule or guard is a \`pure def\` with parameters (SPEC.md, "What goes in the Quint blocks"), not a \`pure val\`; if it is a constant, name it otherwise`);
    const initial = vals.find((d) => d.name === "initial");
    // The machines imported under a name, as this module spells their types: what a `refines<Alias>` may map onto.
    const machines = links.flatMap((l) => {
        const dep = deps.get(l.module);
        const spelled = (t) => requalify(t, l.alias);
        return l.alias && dep.stateType ? [{ alias: l.alias, module: l.module, stateType: spelled(dep.stateType),
                transitions: dep.transitions.map((t) => ({ ...t, params: t.params.map((p) => ({ ...p, type: spelled(p.type) })) })) }] : [];
    });
    const declared = classify(funs, initial && typeOf(initial.id), sig, types, machines);
    const at = (d) => `${d} (${source}${origin(d) ? `:${origin(d).line}` : ""})`;
    // The laws in an opaque function's rule are what is assumed of it; every other law is proved.
    const opaques = consts.map((d) => {
        const params = d.typeAnnotation.args.map((type, i) => ({ name: `p${i}`, type }));
        if (!params.every((p) => types.isScalar(p.type)))
            fail(`${at(d.name)}: an opaque function takes only simple values (int, bool, str or a plain variant), which the simulator can tabulate`);
        return { name: d.name, params, result: d.typeAnnotation.res, laws: declared.laws.filter((l) => origin(l.name)?.rule === origin(d.name)?.rule) };
    });
    const roles = { ...declared, laws: declared.laws.filter((l) => !opaques.some((o) => o.laws.includes(l))), opaques };
    checkSecrets({ funs, vals, sig, inferred, where: at, variants }, roles, types);
    const events = roles.transitions.map((t) => t.name);
    const setting = (kind, targets, what, ok, want) => new Map(settings.filter((d) => d.name.startsWith(`${kind}_`)).map((d) => {
        const target = d.name.slice(kind.length + 1);
        if (!targets.includes(target))
            fail(`${at(d.name)}: there is no ${what} named ${target}; name it \`${kind}_<${what}>\``);
        return [target, ok(d.expr) ? d.expr.value : fail(`${at(d.name)}: write ${want}`)];
    }));
    const count = (e) => e.kind === "int" && e.value >= 1 && e.value <= 100;
    const weights = setting("weight", events, "transition", count, "a whole number from 1 to 100: how many times as often as an event of weight 1 the simulator tries it");
    const within = setting("within", roles.leadsTo, "leadsTo rule", count, "a whole number from 1 to 100: the most events a run may take before it meets the rule");
    const fair = setting("fair", events, "transition", (e) => e.kind === "str" && ["weak", "strong"].includes(e.value), '"weak" (taken if it stays possible) or "strong" (taken if it keeps becoming possible)');
    if (fair.size && !roles.leadsTo.length)
        fail(`${[...fair.keys()].map((e) => `fair_${e}`).join(", ")}: fairness matters only to \`leadsTo\` rules, and the spec has none`);
    // --- TypeScript -------------------------------------------------------------------
    // A heading is prose from the spec; it must not be able to end the comment it is quoted in.
    const doc = (d) => (origin(d) ? `/** ${origin(d).rule.replace(/\*\//g, "* /").replace(/[\r\n]+/g, " ")} (${source}) */\n` : "");
    const importLine = (l) => {
        const item = (n, isType) => `${isType ? "type " : ""}${n} as ${l.module}_${n}`;
        return `import { ${[...l.exports.types.map((t) => item(t, true)), ...l.exports.values.map((v) => item(v, false))].join(", ")} } from "./${l.module}.ts";`;
    };
    const header = [
        `// GENERATED from ${source} by vibestack/spec.ts. Do not edit: change the spec and run \`pnpm gen\`.`,
        `//@ backend dafny`,
        ...links.map(importLine),
        ...typeOnly.map((m) => `import { ${[...new Set(typedefs.filter((d) => d.module === m).map((d) => d.base))].map((b) => `type ${b} as ${m}_${b}`).join(", ")} } from "./${m}.ts";`),
    ];
    const bundleHeader = links.length || typeOnly.length ? [""] : header;
    const proofTypes = typeWalks(typedefs, name, `${name}_`);
    const proofTypeOfConstant = (constant) => {
        const id = constantIds.get(constant);
        return id === undefined ? undefined : proofTypes.tsType(typeOf(id));
    };
    const importedConstantType = (reference) => {
        const module = cameFrom.get(reference);
        return module === undefined ? undefined : deps.get(module).proofTypeOfConstant(reference.split("::").pop());
    };
    /** The module's TypeScript with its own top-level names under a prefix. */
    const render = (prefix, docs = true, proof = true) => {
        const local = (n) => prefix + n;
        const helper = (which) => local(`${which}_${name}`);
        // A definition from another module is spelled <module>_<name>, however it was imported.
        const ref = (n) => (localNames.has(n) ? local(n) : cameFrom.has(n) ? `${cameFrom.get(n)}_${n.split("::").pop()}` : n);
        const scoped = typeWalks(typedefs, name, prefix);
        const print = printer({ types: scoped, inferred, importedConstantType, ref, helper, bind, variants, definitions: new Set([...localNames, ...cameFrom.keys()]), simulatorOnly, proof });
        return typescript({ header: proof ? bundleHeader : header, typedefs: localTypedefs, vals, funs, sig, typeOf, doc: docs ? doc : () => "", local, source }, roles, scoped, print, helper);
    };
    const ts = render("", true, false);
    const refusals = new Map();
    for (const example of refusalExamples) {
        const guard = example.name.slice(REFUSAL_PREFIX.length);
        const definition = funs.find((f) => f.name === guard);
        if (!definition || !roles.transitions.some((t) => t.guard === guard))
            fail(`${at(example.name)}: name a transition guard after \`${REFUSAL_PREFIX}\``);
        if (opaques.length)
            fail(`${at(example.name)}: an initial refusal example requires a model without opaque functions`);
        const params = sig(definition).params.slice(1);
        const value = example.expr;
        if (value.kind !== "app" || value.opcode !== "Rec" || !params.length || value.args.length !== 2 * params.length)
            fail(`${at(example.name)}: give a record with one field for each argument of ${guard} after its state`);
        const fields = new Map();
        for (let i = 0; i < value.args.length; i += 2)
            fields.set(value.args[i].value, value.args[i + 1]);
        for (const { name, type } of params) {
            const field = fields.get(name);
            if (!field)
                fail(`${at(example.name)}: the refusal record needs the argument ${name} of ${guard}`);
            if (types.shape(typeOf(field.id)) !== types.shape(type))
                fail(`${at(example.name)}: the refusal argument ${name} does not have the type expected by ${guard}`);
        }
        refusals.set(guard, example.name);
    }
    const run = harness(name, source, [...imports, ...typeOnly], funs, sig, samples, roles, types, { weights, fair, refusals });
    for (const [guard, declaration] of refusals) {
        const evaluation = run.evals.find((e) => e.name === guard);
        if (evaluation?.params[0]?.from !== "state" || !evaluation.params.slice(1).every((p) => p.from === "pick"))
            fail(`${at(declaration)}: ${guard} must be a sampled guard of the current state and its arguments`);
    }
    const witnesses = concreteWitnesses(examples, roles, at);
    const witness = witnesses.size ? {
        harness: harness(name, source, [...imports, ...typeOnly], funs, sig, samples, roles, types, { weights, fair }, witnesses).text,
        paths: new Map([...witnesses].map(([goal, steps]) => [goal, steps.map(({ transition }) => transition.name)])),
    } : undefined;
    const refusal = run.refusalHarness ? { harness: run.refusalHarness, guards: new Set(refusals.keys()) } : undefined;
    return {
        name, source, imports, ...roles, fair, within, evals: run.evals, uncompared: run.uncompared, harness: run.text, guardHarness: run.guardHarness, guideNames: guides.map((d) => d.name), witness, refusal,
        ts, render, proofTypeOfConstant, decode: types.decode, canon: types.canon,
        shape: roles.stateType ? types.comparison(roles.stateType) : undefined,
        outputShape: roles.output ? types.comparison(roles.output.out) : undefined,
        exports: { types: localTypedefs.map((d) => d.name), values: [...localNames], variants: localVariants, visible: typedefs, samples: ownSamples },
    };
}
