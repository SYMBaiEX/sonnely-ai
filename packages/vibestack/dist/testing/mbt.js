import { planModel, } from "../conformance.js";
export { planModel, };
function wrapModelError(where, error) {
    const detail = error instanceof Error ? error.message : String(error);
    return new Error(`Model test failed at ${where}: ${detail}`, { cause: error });
}
export async function runModel(oracle, adapter, options) {
    if (!options.events.length) {
        throw new Error("Model test requires at least one event");
    }
    const transitionNames = Object.keys(adapter.events).sort();
    const plan = planModel(oracle, options.events, options.shape ?? "scalar", {
        ...options,
        transitions: options.transitions ?? transitionNames,
    });
    if (options.assertCoverage && plan.coverage.transitions.uncovered.length > 0) {
        throw new Error(`Model test uncovered transitions (${plan.coverage.transitions.accepted.length}/${plan.coverage.transitions.total}): ${plan.coverage.transitions.uncovered.join(", ")}`);
    }
    const runWithContext = async (body) => {
        const ctx = await adapter.setup();
        let primaryError;
        let failed = false;
        try {
            await body(ctx);
        }
        catch (error) {
            failed = true;
            primaryError = error;
        }
        try {
            await adapter.teardown?.(ctx);
        }
        catch (teardownError) {
            if (!failed)
                throw teardownError;
            const primaryMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
            const teardownMsg = teardownError instanceof Error ? teardownError.message : String(teardownError);
            throw new Error(`${primaryMsg} (teardown also failed: ${teardownMsg})`, { cause: teardownError });
        }
        if (failed)
            throw primaryError;
    };
    let totalSteps = 0;
    if (!plan.paths.length) {
        await runWithContext(async (ctx) => {
            try {
                await adapter.assertState(oracle.initial, ctx, { path: "initial", index: 0, targetState: "initial" });
            }
            catch (error) {
                throw wrapModelError('path "initial", initial state', error);
            }
        });
    }
    for (const modelPath of plan.paths) {
        await runWithContext(async (ctx) => {
            try {
                await adapter.assertState(oracle.initial, ctx, {
                    path: modelPath.description,
                    index: 0,
                    targetState: modelPath.targetState,
                });
            }
            catch (error) {
                throw wrapModelError(`path "${modelPath.description}", initial state`, error);
            }
            for (const [index, step] of modelPath.steps.entries()) {
                totalSteps++;
                const { by, ...raw } = step.event;
                const event = raw;
                const meta = {
                    path: modelPath.description,
                    index: index + 1,
                    before: step.before,
                    after: step.after,
                    allowed: step.allowed,
                    by: by,
                    ...(step.out !== undefined ? { out: step.out } : {}),
                };
                const label = `path "${modelPath.description}", step ${index + 1} (${event.type}${step.allowed ? "" : ", refused"})`;
                try {
                    if (!step.allowed && adapter.assertRefusal) {
                        await adapter.assertRefusal(step.event, step.before, ctx, meta);
                    }
                    else {
                        const handler = adapter.events[event.type];
                        if (typeof handler !== "function") {
                            throw new Error(`No handler registered for event type "${event.type}"`);
                        }
                        await handler(event, ctx, meta);
                    }
                }
                catch (error) {
                    throw wrapModelError(label, error);
                }
                try {
                    await adapter.assertState(step.after, ctx, {
                        path: modelPath.description,
                        index: index + 1,
                        targetState: modelPath.targetState,
                        step,
                        by: by,
                    });
                }
                catch (error) {
                    throw wrapModelError(`${label}, state assertion`, error);
                }
            }
        });
    }
    return {
        strategy: plan.strategy,
        paths: plan.paths.length,
        steps: totalSteps,
        coverage: plan.coverage,
    };
}
