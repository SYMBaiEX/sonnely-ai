// A conformance driver for an application written with Effect (SPEC.md, "Conformance"): test/drivers/<name>.ts
// exports one, and the traces stage of `pnpm check` runs it.
import { ManagedRuntime } from "effect";
/**
 * A driver from Effect code. Each `reset` releases the runtime and builds `layer` again, so every trace starts from
 * a fresh application and its finalizers run; a layer with `TestClock.layer()` lets the driver move time.
 */
export function effectDriver(layer, app) {
    let runtime = ManagedRuntime.make(layer);
    const observeOutput = app.observeOutput?.bind(app), receive = app.receive?.bind(app);
    return {
        reset: async () => { await runtime.dispose(); runtime = ManagedRuntime.make(layer); },
        dispatch: (key, event, by) => runtime.runPromise(app.dispatch(key, event, by)),
        observe: (key) => runtime.runPromise(app.observe(key)),
        ...observeOutput && { observeOutput: (key) => runtime.runPromise(observeOutput(key)) },
        ...receive && { receive: (key, raw, by) => runtime.runPromise(receive(key, raw, by)) },
        [Symbol.asyncDispose]: () => runtime.dispose(),
    };
}
