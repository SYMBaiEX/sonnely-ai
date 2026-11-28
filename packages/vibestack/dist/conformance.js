// Runs the real application against its spec, with the generated module as the oracle (SPEC.md, "Conformance"):
// conform.ts runs it on each test/drivers/<name>.ts in the traces stage. Copied into gen/ as _conformance.ts for the
// types a driver is written to, so it imports nothing.
/** A disagreement between the application and its spec, with the fewest events that show it, as data to save and replay. */
export class ConformanceError extends Error {
    trace;
    seed;
    /** The journey or walk that found it, or "replay". */
    origin;
    constructor(message, trace, seed, origin) {
        super(message);
        this.name = "ConformanceError";
        this.trace = trace;
        this.seed = seed;
        this.origin = origin;
    }
}
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const eventTypeOf = (sent) => String(sent?.type ?? "");
function prepareEvent(sent) {
    const { by, ...raw } = sent;
    return { sent, raw: raw, by, type: eventTypeOf(sent), key: canonical(sent, "scalar") };
}
function isOutputEnvelope(oracle, value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const record = value;
    const keys = Object.keys(record);
    return keys.length === 2 && Object.hasOwn(record, "state") && Object.hasOwn(record, "out")
        && Array.isArray(record.out) && oracle.parseState(value) === undefined && oracle.parseState(record.state) !== undefined;
}
function applyPrepared(oracle, before, item, outputFlag) {
    const result = oracle.step(before, item.raw, item.by);
    if (outputFlag.value === undefined)
        outputFlag.value = isOutputEnvelope(oracle, result);
    const emits = outputFlag.value;
    const after = emits ? result.state : result;
    const out = emits ? result.out : undefined;
    return { before, event: item.sent, allowed: true, after, ...(out !== undefined ? { out } : {}) };
}
function stepPrepared(oracle, before, item, outputFlag) {
    if (!oracle.enabled(before, item.raw, item.by))
        return { before, event: item.sent, allowed: false, after: before };
    return applyPrepared(oracle, before, item, outputFlag);
}
function orderEventsDiverse(events) {
    const unique = new Map();
    for (const event of events) {
        const prepared = prepareEvent(event);
        if (!unique.has(prepared.key))
            unique.set(prepared.key, prepared);
    }
    const sorted = [...unique.entries()].sort(([a], [b]) => compareText(a, b)).map(([, item]) => item);
    const buckets = new Map();
    for (const item of sorted) {
        const byKey = item.by === undefined ? "" : canonical(item.by, "scalar");
        const key = `${item.type}\0${byKey}`;
        const list = buckets.get(key);
        if (list)
            list.push(item);
        else
            buckets.set(key, [item]);
    }
    const ordered = [];
    const groups = [...buckets.values()];
    for (let round = 0; ordered.length < sorted.length; round++) {
        for (const group of groups)
            if (round < group.length)
                ordered.push(group[round]);
    }
    return ordered;
}
function describeSteps(steps) {
    if (!steps.length)
        return "initial";
    return steps.map((step) => `${eventTypeOf(step.event)}${step.allowed ? "" : " (refused)"}`).join(" -> ");
}
function deduplicateSpines(spines) {
    const keyed = spines.map((spine) => {
        const keys = spine.steps.map((step) => canonical(step.event, "scalar"));
        return { spine, keys, joined: keys.join("\0") };
    });
    keyed.sort((a, b) => b.keys.length - a.keys.length || compareText(a.joined, b.joined));
    const kept = [];
    for (const candidate of keyed) {
        const subsumed = kept.some((existing) => candidate.keys.length <= existing.keys.length
            && candidate.keys.every((key, index) => existing.keys[index] === key));
        if (!subsumed)
            kept.push(candidate);
    }
    return kept.map((entry) => entry.spine).reverse();
}
const MAX_CONCRETE_PER_ABSTRACT = 4;
const MAX_INLINE_REFUSALS = 64;
function collectSimpleSpines(oracle, ordered, abstractKeyOf, initialAbstract, maxDepth, maxPaths, outputFlag) {
    const simpleSpines = [];
    let truncated = false;
    const visit = (state, abstractKey, visited, steps) => {
        if (simpleSpines.length >= maxPaths) {
            truncated = true;
            return;
        }
        let extended = false;
        if (steps.length < maxDepth) {
            const seenNext = new Set();
            for (const item of ordered) {
                const stepped = stepPrepared(oracle, state, item, outputFlag);
                if (!stepped.allowed)
                    continue;
                const nextAbstract = abstractKeyOf(stepped.after);
                if (visited.has(nextAbstract))
                    continue;
                const dedup = `${item.type}\0${nextAbstract}`;
                if (seenNext.has(dedup))
                    continue;
                seenNext.add(dedup);
                extended = true;
                visited.add(nextAbstract);
                steps.push(stepped);
                visit(stepped.after, nextAbstract, visited, steps);
                steps.pop();
                visited.delete(nextAbstract);
                if (simpleSpines.length >= maxPaths) {
                    truncated = true;
                    return;
                }
            }
        }
        if (!extended && steps.length > 0)
            simpleSpines.push({ targetState: abstractKey, steps: [...steps] });
    };
    visit(oracle.initial, initialAbstract, new Set([initialAbstract]), []);
    return { spines: deduplicateSpines(simpleSpines), truncated };
}
function attachInlineRefusals(oracle, ordered, rawSpines, modeKeyOf, includeRefusals) {
    const emittedRefusedTypes = new Set();
    const emittedModeRefusals = new Set();
    let totalRefusals = 0;
    const refusalsAt = (state) => {
        if (!includeRefusals || totalRefusals >= MAX_INLINE_REFUSALS)
            return [];
        const mode = modeKeyOf(state);
        const chosen = [];
        const seenTypesHere = new Set();
        const candidates = [];
        for (const item of ordered) {
            if (oracle.enabled(state, item.raw, item.by))
                continue;
            if (seenTypesHere.has(item.type))
                continue;
            const modePair = `${mode}\0${item.type}`;
            if (emittedRefusedTypes.has(item.type) && emittedModeRefusals.has(modePair))
                continue;
            seenTypesHere.add(item.type);
            candidates.push({ before: state, event: item.sent, allowed: false, after: state });
        }
        candidates.sort((a, b) => Number(emittedRefusedTypes.has(eventTypeOf(a.event))) - Number(emittedRefusedTypes.has(eventTypeOf(b.event))));
        for (const stepped of candidates) {
            if (totalRefusals >= MAX_INLINE_REFUSALS)
                break;
            const type = eventTypeOf(stepped.event);
            emittedRefusedTypes.add(type);
            emittedModeRefusals.add(`${mode}\0${type}`);
            chosen.push(stepped);
            totalRefusals++;
        }
        return chosen;
    };
    return rawSpines.map((spine) => {
        const steps = [];
        steps.push(...refusalsAt(oracle.initial));
        for (const step of spine.steps) {
            steps.push(step);
            steps.push(...refusalsAt(step.after));
        }
        return {
            description: describeSteps(steps),
            targetState: spine.targetState,
            steps,
            events: steps.map((step) => step.event),
        };
    });
}
function prioritizeSpines(spines, maxPaths, priorityTargets) {
    const selected = [];
    const chosen = new Set();
    const coveredTypes = new Set();
    const coveredTargets = new Set();
    for (const [index, spine] of spines.entries()) {
        if (selected.length >= maxPaths)
            return selected;
        const addsType = spine.steps.some((step) => step.allowed && !coveredTypes.has(eventTypeOf(step.event)));
        if (!addsType)
            continue;
        chosen.add(index);
        selected.push(spine);
        for (const step of spine.steps)
            if (step.allowed)
                coveredTypes.add(eventTypeOf(step.event));
        coveredTargets.add(spine.targetState);
    }
    for (const [index, spine] of spines.entries()) {
        if (selected.length >= maxPaths)
            return selected;
        if (chosen.has(index) || !priorityTargets.has(spine.targetState) || coveredTargets.has(spine.targetState))
            continue;
        chosen.add(index);
        selected.push(spine);
        coveredTargets.add(spine.targetState);
    }
    for (const [index, spine] of spines.entries()) {
        if (selected.length >= maxPaths)
            break;
        if (chosen.has(index))
            continue;
        selected.push(spine);
    }
    return selected;
}
export function planModel(oracle, events, shape = "scalar", options = {}) {
    const strategy = options.strategy ?? "transitions";
    const includeRefusals = options.includeRefusals ?? strategy === "transitions";
    const maxStates = options.maxStates ?? 256;
    const maxDepth = options.maxDepth ?? 12;
    const maxPaths = options.maxPaths ?? 64;
    for (const [name, count] of Object.entries({ maxStates, maxDepth, maxPaths })) {
        if (!Number.isSafeInteger(count) || count < 0)
            throw new Error(`model plan ${name} must be a nonnegative safe integer`);
    }
    const ordered = orderEventsDiverse(events);
    const allTransitions = [...new Set([...(options.transitions ?? []), ...ordered.map((item) => item.type)])].sort(compareText);
    if (!ordered.length || maxStates === 0 || maxPaths === 0) {
        return {
            strategy,
            paths: [],
            prefixForTransition: new Map(),
            coverage: {
                states: 1,
                paths: 0,
                truncated: ordered.length > 0,
                transitions: { total: allTransitions.length, accepted: [], refused: [], uncovered: allTransitions },
            },
        };
    }
    const outputFlag = { value: options.hasOutput };
    const probeEvents = ordered.slice(0, 48);
    const predicateEntries = Object.entries(options.predicates ?? {}).sort(([a], [b]) => compareText(a, b));
    const eventsByType = new Map();
    for (const item of ordered) {
        const list = eventsByType.get(item.type);
        if (list)
            list.push(item);
        else
            eventsByType.set(item.type, [item]);
    }
    const transitionNames = [...eventsByType.keys()].sort(compareText);
    const modeKeyOf = (state) => transitionNames.map((name) => eventsByType.get(name).some((item) => oracle.enabled(state, item.raw, item.by)) ? "1" : "0").join("");
    const abstractKeyOf = (state) => {
        if (options.stateKey)
            return options.stateKey(state);
        const enabledBits = probeEvents.map((item) => (oracle.enabled(state, item.raw, item.by) ? "1" : "0")).join("");
        if (!predicateEntries.length)
            return enabledBits;
        const predBits = predicateEntries.map(([, fn]) => (fn(state) ? "1" : "0")).join("");
        return `${enabledBits}|${predBits}`;
    };
    const initialAbstract = abstractKeyOf(oracle.initial);
    const nodes = [{
            concreteKey: canonical(oracle.initial, shape),
            abstractKey: initialAbstract,
            state: oracle.initial,
            steps: [],
            pathKey: "",
        }];
    const nodeByPath = new Map([["", 0]]);
    const seenConcrete = new Set([nodes[0].concreteKey]);
    const abstractCount = new Map([[initialAbstract, 1]]);
    const abstractFirst = new Map([[initialAbstract, 0]]);
    const acceptedByType = new Map();
    const refusedByType = new Map();
    let truncated = false;
    const inspectRefusals = (nodeIndex) => {
        const node = nodes[nodeIndex];
        for (const item of ordered) {
            if (refusedByType.has(item.type))
                continue;
            if (oracle.enabled(node.state, item.raw, item.by))
                continue;
            refusedByType.set(item.type, { nodeIndex, step: { before: node.state, event: item.sent, allowed: false, after: node.state } });
        }
    };
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const expanded = new Set();
        for (const item of ordered) {
            if (!oracle.enabled(node.state, item.raw, item.by)) {
                if (!refusedByType.has(item.type)) {
                    refusedByType.set(item.type, { nodeIndex: i, step: { before: node.state, event: item.sent, allowed: false, after: node.state } });
                }
                continue;
            }
            const stepped = applyPrepared(oracle, node.state, item, outputFlag);
            if (!acceptedByType.has(item.type))
                acceptedByType.set(item.type, { nodeIndex: i, step: stepped });
            const nextConcrete = canonical(stepped.after, shape);
            const nextAbstract = abstractKeyOf(stepped.after);
            const edgeKey = `${item.type}\0${nextAbstract}`;
            if (node.steps.length >= maxDepth || seenConcrete.has(nextConcrete) || expanded.has(edgeKey))
                continue;
            expanded.add(edgeKey);
            const count = abstractCount.get(nextAbstract) ?? 0;
            if (count >= MAX_CONCRETE_PER_ABSTRACT)
                continue;
            if (nodes.length >= maxStates) {
                truncated = true;
                continue;
            }
            seenConcrete.add(nextConcrete);
            abstractCount.set(nextAbstract, count + 1);
            const nextIndex = nodes.length;
            const pathKey = node.pathKey ? `${node.pathKey}\0${item.key}` : item.key;
            nodes.push({
                concreteKey: nextConcrete,
                abstractKey: nextAbstract,
                state: stepped.after,
                steps: [...node.steps, stepped],
                pathKey,
            });
            if (!nodeByPath.has(pathKey))
                nodeByPath.set(pathKey, nextIndex);
            if (!abstractFirst.has(nextAbstract))
                abstractFirst.set(nextAbstract, nextIndex);
        }
    }
    for (const seedTrace of options.seedTraces ?? []) {
        let state = oracle.initial;
        const prefix = [];
        let prefixKey = "";
        for (const sent of seedTrace) {
            const item = prepareEvent(sent);
            const stepped = stepPrepared(oracle, state, item, outputFlag);
            if (!stepped.allowed)
                break;
            const existingAccepted = acceptedByType.get(item.type);
            if (!existingAccepted || prefix.length < nodes[existingAccepted.nodeIndex].steps.length) {
                let hostIndex = nodeByPath.get(prefixKey);
                if (hostIndex === undefined) {
                    hostIndex = nodes.length;
                    nodes.push({
                        concreteKey: canonical(state, shape),
                        abstractKey: abstractKeyOf(state),
                        state,
                        steps: [...prefix],
                        pathKey: prefixKey,
                    });
                    nodeByPath.set(prefixKey, hostIndex);
                }
                acceptedByType.set(item.type, { nodeIndex: hostIndex, step: stepped });
            }
            prefix.push(stepped);
            prefixKey = prefixKey ? `${prefixKey}\0${item.key}` : item.key;
            state = stepped.after;
            const nextAbstract = abstractKeyOf(state);
            if (!abstractFirst.has(nextAbstract)) {
                const idx = nodes.length;
                nodes.push({
                    concreteKey: canonical(state, shape),
                    abstractKey: nextAbstract,
                    state,
                    steps: [...prefix],
                    pathKey: prefixKey,
                });
                if (!nodeByPath.has(prefixKey))
                    nodeByPath.set(prefixKey, idx);
                abstractFirst.set(nextAbstract, idx);
                inspectRefusals(idx);
            }
        }
    }
    let rawSpines;
    if (strategy === "simple") {
        const simple = collectSimpleSpines(oracle, ordered, abstractKeyOf, initialAbstract, maxDepth, maxPaths, outputFlag);
        rawSpines = simple.spines;
        truncated ||= simple.truncated;
    }
    else {
        const candidates = [];
        for (const nodeIndex of abstractFirst.values()) {
            const node = nodes[nodeIndex];
            if (node.steps.length > 0)
                candidates.push({ targetState: node.abstractKey, steps: node.steps });
        }
        if (strategy === "transitions") {
            for (const { nodeIndex, step } of acceptedByType.values()) {
                const host = nodes[nodeIndex];
                candidates.push({ targetState: abstractKeyOf(step.after), steps: [...host.steps, step] });
            }
            for (const { nodeIndex } of refusedByType.values()) {
                const host = nodes[nodeIndex];
                if (host.steps.length > 0)
                    candidates.push({ targetState: host.abstractKey, steps: host.steps });
            }
        }
        rawSpines = deduplicateSpines(candidates);
        if (!rawSpines.length && includeRefusals && refusedByType.size > 0) {
            rawSpines = [{ targetState: initialAbstract, steps: [] }];
        }
    }
    if (rawSpines.length > maxPaths) {
        const refusalTargets = new Set([...refusedByType.values()].map(({ nodeIndex }) => nodes[nodeIndex].abstractKey));
        rawSpines = strategy === "transitions" ? prioritizeSpines(rawSpines, maxPaths, refusalTargets) : rawSpines.slice(0, maxPaths);
        truncated = true;
    }
    const paths = attachInlineRefusals(oracle, ordered, rawSpines, modeKeyOf, includeRefusals);
    const prefixForTransition = new Map();
    for (const [type, { nodeIndex, step }] of acceptedByType) {
        prefixForTransition.set(type, { prefix: nodes[nodeIndex].steps.map((s) => s.event), event: step.event });
    }
    const accepted = [...new Set(paths.flatMap((p) => p.steps.filter((s) => s.allowed).map((s) => eventTypeOf(s.event))))].sort(compareText);
    const refused = [...new Set(paths.flatMap((p) => p.steps.filter((s) => !s.allowed).map((s) => eventTypeOf(s.event))))].sort(compareText);
    const uncovered = allTransitions.filter((t) => !accepted.includes(t));
    return {
        strategy,
        paths,
        prefixForTransition,
        coverage: {
            states: abstractFirst.size,
            paths: paths.length,
            truncated,
            transitions: { total: allTransitions.length, accepted, refused, uncovered },
        },
    };
}
/**
 * Run the journeys, deterministic model-based paths, probes of a driver that can `receive`, then seeded random walks;
 * throw a ConformanceError at the first disagreement, shrunk to the fewest events that show it, or an Error at the
 * first probe that fails.
 */
export async function check(oracle, found, driver, options = {}) {
    const { differ, run, fail, seen, outcomes, acceptedTransitions, refusedTransitions, keys, walks, steps, seed } = runner(oracle, found, driver, options);
    const ranTraces = new Set();
    for (const j of found.journeys) {
        const trace = j.events.map((e) => [keys[0], e]);
        ranTraces.add(canonical(j.events, "scalar"));
        const why = await differ(trace);
        if (why)
            await fail(`journey "${j.story}" / "${j.rule}"`, trace, why);
    }
    const plan = options.paths === false ? undefined : planModel(oracle, found.events, found.shape, {
        strategy: options.paths ?? "transitions",
        stateKey: options.stateKey,
        transitions: found.transitions,
        hasOutput: !!found.outputShape,
        seedTraces: [...found.journeys.map((j) => j.events), ...(found.traces ?? [])],
    });
    let executedPlans = 0;
    for (const modelPath of plan?.paths ?? []) {
        const key = canonical(modelPath.events, "scalar");
        if (ranTraces.has(key))
            continue;
        ranTraces.add(key);
        executedPlans++;
        const trace = modelPath.events.map((e) => [keys[0], e]);
        const why = await differ(trace);
        if (why)
            await fail(`model path "${modelPath.description}"`, trace, why);
    }
    const probes = driver.receive ? await probe(oracle, found, driver, keys[0], run, options.view, plan?.prefixForTransition) : 0;
    const random = rng(seed);
    for (let w = 0; w < walks; w++) {
        const model = new Map();
        const trace = [];
        for (let i = 0; i < steps; i++) {
            const key = keys[Math.floor(random() * keys.length)];
            const state = model.get(key) ?? oracle.initial;
            const allowed = found.events.filter(({ by, ...e }) => oracle.enabled(state, e, by));
            const pool = allowed.length && random() < 0.75 ? allowed : found.events;
            const sent = pool[Math.floor(random() * pool.length)];
            const { by, ...event } = sent;
            trace.push([key, sent]);
            const after = transition(oracle, found, state, event, by);
            if (typeof after === "string")
                throw new Error(after);
            model.set(key, after.after);
        }
        const why = await differ(trace);
        if (why)
            await fail(`walk ${w + 1} of seed ${seed}`, trace, why);
    }
    const knownTransitions = [...new Set([...(found.transitions ?? []), ...found.events.map(eventTypeOf)])].sort(compareText);
    const accepted = [...acceptedTransitions].sort(compareText);
    const refused = [...refusedTransitions].sort(compareText);
    const coverage = {
        total: knownTransitions.length,
        accepted,
        refused,
        uncovered: knownTransitions.filter((t) => !acceptedTransitions.has(t)),
    };
    return {
        plans: executedPlans,
        journeys: found.journeys.length,
        probes,
        walks,
        observed: seen.size,
        outcomes: [...outcomes],
        coverage,
        effects: found.outputShape ? driver.observeOutput ? "checked" : "not observed" : "none",
    };
}
/**
 * Run exactly `trace`, saved as `from`, through the application; throw a ConformanceError if it still disagrees, and
 * an Error if it holds an event the spec no longer has, which only a person can bring up to date or delete.
 */
export async function replay(oracle, found, driver, trace, options = {}, from = "a saved trace") {
    const gone = trace.find(([, { by, ...event }]) => oracle.parseEvent(event) === undefined || (found.sender ? oracle.parseSender?.(by) === undefined : by !== undefined));
    if (gone)
        throw new Error(`the spec has outgrown ${from}: ${show(gone[1])} is not one of its events now; bring the trace up to date, or delete it`);
    const why = await runner(oracle, found, driver, options).differ(trace);
    if (why)
        throw new ConformanceError(`conformance to ${found.source}: ${from}, replayed, ${trace.length} events:\n${lines(trace)}\n${why}`, trace, options.seed ?? 1, "replay");
}
/**
 * Each kind of event, after the shortest journey prefix that allows it: malformed, it must be refused and change
 * nothing; with an extra field and fields that change on a second read, it must do what the clean event does, as
 * the application copies what it decodes (SPEC.md, "Using the generated code"). Returns how many were sent.
 */
async function probe(oracle, found, driver, key, run, view, prefixForTransition) {
    const prefixes = [[], ...found.journeys.flatMap((j) => j.events.map((_, i) => j.events.slice(0, i + 1)))];
    const after = (prefix) => prefix.reduce((s, { by, ...e }) => { const t = transition(oracle, found, s, e, by); return typeof t === "string" ? s : t.after; }, oracle.initial);
    let sent = 0;
    const typeOf = (e) => e.type;
    for (const type of new Set(found.events.map(typeOf))) {
        const planned = prefixForTransition?.get(type);
        const samples = found.events.filter((e) => typeOf(e) === type);
        const [prefix, sample] = planned
            ? [[...planned.prefix], planned.event]
            : prefixes.flatMap((p) => samples.filter(({ by, ...e }) => oracle.enabled(after(p), e, by)).map((e) => [p, e]))[0] ?? [[], samples[0]];
        const { by, ...event } = sample;
        const model = await run(prefix.map((e) => [key, e]));
        if (typeof model === "string")
            throw new Error(`conformance to ${found.source}: before probing ${type}: ${model}`);
        let state = model.get(key);
        const fields = Object.keys(event).filter((f) => f !== "type");
        const malformed = [{ ...event, type: `${type}?` }, ...fields.flatMap((f) => [{ ...event, [f]: 1.5 }, { ...event, [f]: 2 ** 53 }, Object.fromEntries(Object.entries(event).filter(([g]) => g !== f))])];
        const read = new Set();
        const sly = Object.defineProperties({ ...event, unexpected: "ignored" }, Object.fromEntries(fields.map((f) => [f, {
                enumerable: true, get: () => read.has(f) ? changed(event[f]) : (read.add(f), event[f]),
            }])));
        for (const raw of [...malformed.filter((raw) => oracle.parseEvent(raw) === undefined), sly]) {
            const at = `conformance to ${found.source}: probe ${raw === sly ? `${show(event)} with an extra field and fields that change when read again` : show(raw)}, after ${prefix.length} events of a journey`;
            const expected = raw === sly ? transition(oracle, found, state, event, by) : { allowed: false, after: state };
            if (typeof expected === "string")
                throw new Error(`${at}: ${expected}`);
            let did;
            try {
                did = await driver.receive(key, raw, by);
            }
            catch (error) {
                throw new Error(`${at}: the application failed: ${error instanceof Error ? error.message : show(error)}`, { cause: error });
            }
            sent++;
            if (did !== (expected.allowed ? "accepted" : "refused"))
                throw new Error(`${at}: the application ${show(did)} it, where the spec ${expected.allowed ? "accepts" : "refuses"} it`);
            const problem = compareObservation(oracle, found, expected.after, await driver.observe(key), view);
            if (problem)
                throw new Error(`${at}: ${key} ${problem}`);
            state = expected.after;
        }
    }
    return sent;
}
/** A value that is not `x`, as a field read a second time gives it. */
const changed = (x) => typeof x === "number" ? x + 1_000_000 : typeof x === "string" ? `${x}?` : typeof x === "boolean" ? !x : undefined;
const lines = (trace) => trace.map(([k, e]) => `  ${k} ${show(e)}`).join("\n");
/** What `check` and `replay` share: running a trace through the driver beside the oracle, and shrinking one that disagrees. */
function runner(oracle, found, driver, options) {
    const { view, keys = ["a", "b"], walks = 1, steps = 20, seed = 1 } = options;
    if (!found.events.length)
        throw new Error(`the simulator found no events of ${found.source}`);
    if (!keys.length || keys.some((key) => typeof key !== "string" || !key) || new Set(keys).size !== keys.length)
        throw new Error("conformance keys must be distinct nonempty strings");
    for (const [name, count] of Object.entries({ walks, steps, seed }))
        if (!Number.isSafeInteger(count) || count < 0)
            throw new Error(`conformance ${name} must be a nonnegative safe integer`);
    const seen = new Set();
    const outcomes = new Set();
    const acceptedTransitions = new Set();
    const refusedTransitions = new Set();
    /** The first way the application differs from the spec along `trace`, or else the spec's state of each key after it. */
    const run = async (trace) => {
        await driver.reset();
        const model = new Map();
        for (const key of keys) {
            const raw = await driver.observe(key);
            const problem = compareObservation(oracle, found, oracle.initial, raw, view);
            if (problem)
                return `initial ${key}: ${problem}`;
            model.set(key, oracle.initial);
        }
        for (const [i, [key, sent]] of trace.entries()) {
            const at = `event ${i + 1}, ${key} ${show(sent)}`;
            const { by, ...rawEvent } = sent;
            const before = model.get(key);
            const applied = transition(oracle, found, before, rawEvent, by);
            if (typeof applied === "string")
                return `${at}: ${applied}`;
            const { event, allowed, after, out } = applied;
            const did = await driver.dispatch(key, event, by);
            if (did !== "accepted" && did !== "refused")
                return `${at}: dispatch returned ${show(did)}; it returns "accepted" or "refused" and throws otherwise`;
            outcomes.add(did);
            if (allowed !== (did === "accepted"))
                return `${at}: the spec ${allowed ? "allows" : "refuses"} it, the application ${did} it`;
            if (allowed)
                acceptedTransitions.add(eventTypeOf(event));
            else
                refusedTransitions.add(eventTypeOf(event));
            if (found.outputShape && driver.observeOutput) {
                const actual = await driver.observeOutput(key);
                if (canonical(actual, found.outputShape) !== canonical(out, found.outputShape))
                    return `${at}: emitted effects differ from the spec`;
            }
            model.set(key, after);
            for (const [k, state] of model) {
                const raw = await driver.observe(k);
                const problem = compareObservation(oracle, found, state, raw, view);
                if (problem)
                    return `${at}: ${k} ${problem}`;
                seen.add(canonical(raw, view ? "scalar" : found.shape));
            }
        }
        return model;
    };
    const differ = async (trace) => { const r = await run(trace); return typeof r === "string" ? r : undefined; };
    const fail = async (what, trace, initialWhy) => {
        let why = initialWhy;
        for (let i = trace.length - 1; i >= 0; i--) {
            const shorter = trace.toSpliced(i, 1);
            const nextWhy = await differ(shorter);
            if (nextWhy) {
                trace = shorter;
                why = nextWhy;
            }
        }
        throw new ConformanceError(`conformance to ${found.source}: ${what}, shrunk to ${trace.length} events:\n${lines(trace)}\n${why ?? await differ(trace)}`, trace, seed, what);
    };
    return { differ, run, fail, seen, outcomes, acceptedTransitions, refusedTransitions, keys, walks, steps, seed };
}
export function canonical(value, shape) {
    const sort = (value, shape) => {
        if (shape !== "scalar" && "variants" in shape)
            shape = shape.variants[value?.tag] ?? "scalar";
        if (Array.isArray(value)) {
            const element = shape !== "scalar" && "set" in shape ? shape.set : shape !== "scalar" && "list" in shape ? shape.list : "scalar";
            const items = value.map((item) => sort(item, element));
            if (shape !== "scalar" && "set" in shape) {
                return items
                    .map((item) => [item, JSON.stringify(item)])
                    .sort((a, b) => compareText(a[1], b[1]))
                    .map(([item]) => item);
            }
            return items;
        }
        if (value && typeof value === "object")
            return Object.fromEntries(Object.keys(value).sort().map((key) => [key,
                sort(value[key], shape !== "scalar" && "fields" in shape ? shape.fields[key] ?? "scalar" : shape !== "scalar" && "map" in shape ? shape.map : "scalar")]));
        return value;
    };
    const result = JSON.stringify(sort(value, shape));
    if (result === undefined)
        throw new Error("an observation must be a JSON value");
    return result;
}
const show = (x) => JSON.stringify(x) ?? String(x);
/** A small seeded generator, so that a walk repeats exactly. */
function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
/** Validate an input once for both driver and recorded-trace conformance. */
export function transition(oracle, found, before, raw, by) {
    const event = oracle.parseEvent(raw);
    if (event === undefined)
        return `${show(raw)} is not an event of the spec`;
    if (found.sender ? by === undefined || !oracle.parseSender || oracle.parseSender(by) === undefined : by !== undefined)
        return found.sender ? "the event needs a valid sender" : "the spec's events have no sender";
    const result = oracle.step(before, event, by);
    const { state: after, out } = found.outputShape ? result : { state: result, out: undefined };
    return { event, allowed: oracle.enabled(before, event, by), after, out };
}
/** Compare what the real application exposed, keeping sets independent of their iteration order. */
export function compareObservation(oracle, found, expected, raw, view) {
    const actual = view ? raw : oracle.parseState(raw);
    if (actual === undefined)
        return `reads back as ${show(raw)}, which is not a state the spec allows`;
    const want = canonical(view ? view(expected) : expected, view ? "scalar" : found.shape);
    const have = canonical(actual, view ? "scalar" : found.shape);
    return want === have ? undefined : `should be ${want}, but the application has ${have}`;
}
/** The first disagreement in a recorded trace. At least one real state must have been observed. */
export function departure(oracle, found, lines) {
    let current = oracle.initial;
    let observed = 0;
    for (const [i, raw] of lines.entries()) {
        const fail = (why) => ({ line: i + 1, why });
        if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some((key) => !["event", "by", "state", "out"].includes(key)))
            return fail(`${show(raw)} is not {event?, by?, state?, out?}`);
        const line = raw;
        if (line.event === undefined) {
            if (line.by !== undefined || Object.hasOwn(line, "out"))
                return fail("a start line has no sender or emitted effects");
            if (Object.hasOwn(line, "state")) {
                const state = oracle.parseState(line.state);
                if (state === undefined)
                    return fail(`the program starts from an invalid state ${show(line.state)}`);
                current = state;
                observed++;
            }
            else
                current = oracle.initial;
            continue;
        }
        const applied = transition(oracle, found, current, line.event, line.by);
        if (typeof applied === "string")
            return fail(applied);
        current = applied.after;
        if (Object.hasOwn(line, "out")) {
            if (!found.outputShape)
                return fail("this spec does not emit effects");
            if (canonical(line.out, found.outputShape) !== canonical(applied.out, found.outputShape))
                return fail("emitted effects differ from the spec");
        }
        if (Object.hasOwn(line, "state")) {
            observed++;
            const problem = compareObservation(oracle, found, current, line.state);
            if (problem)
                return fail(problem);
        }
    }
    if (!observed)
        return { line: Math.max(1, lines.length), why: "the trace contains no observed state" };
}
