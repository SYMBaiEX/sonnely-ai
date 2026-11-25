import { type Effect, type Layer } from "effect";
import type { Driver, Outcome } from "../conformance.ts";
/** How an application written with Effect is reached; `R` is what `layer` provides. */
export interface EffectDriver<E, V, R> {
    dispatch(key: string, event: E, by?: unknown): Effect.Effect<Outcome, unknown, R>;
    observe(key: string): Effect.Effect<V, unknown, R>;
    observeOutput?(key: string): Effect.Effect<unknown, unknown, R>;
    receive?(key: string, raw: unknown, by?: unknown): Effect.Effect<Outcome, unknown, R>;
}
/**
 * A driver from Effect code. Each `reset` releases the runtime and builds `layer` again, so every trace starts from
 * a fresh application and its finalizers run; a layer with `TestClock.layer()` lets the driver move time.
 */
export declare function effectDriver<E, V, R, LE>(layer: Layer.Layer<R, LE>, app: EffectDriver<E, V, R>): Driver<E, V> & AsyncDisposable;
