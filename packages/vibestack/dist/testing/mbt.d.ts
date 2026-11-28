import { planModel, type ComparisonShape, type ModelPath, type ModelPlan, type ModelStep, type Oracle, type PathStrategy, type PlanOptions, type TransitionCoverage } from "../conformance.ts";
export { planModel, type ModelPath, type ModelPlan, type ModelStep, type PathStrategy, type PlanOptions, type TransitionCoverage, };
export type ModelState<O> = O extends {
    readonly initial: infer S;
} ? S : never;
export type ModelEvent<O> = O extends {
    parseEvent(raw: unknown): infer E;
} ? Extract<Exclude<E, undefined>, {
    readonly type: string;
}> : never;
export type ModelSender<O> = O extends {
    parseSender(raw: unknown): infer B;
} ? Exclude<B, undefined> : undefined;
export type ModelInput<E, By> = [By] extends [undefined] ? E : E & {
    readonly by: By;
};
export interface ModelStepMeta<S, By> {
    readonly path: string;
    readonly index: number;
    readonly before: S;
    readonly after: S;
    readonly allowed: boolean;
    readonly by: By;
    readonly out?: unknown;
}
export interface ModelStateMeta<S, E, By> {
    readonly path: string;
    readonly index: number;
    readonly targetState: string;
    readonly step?: ModelStep<S, E>;
    readonly by?: By;
}
export type EventHandlers<S, E extends {
    readonly type: string;
}, By, Ctx> = {
    readonly [K in E["type"]]: (event: Extract<E, {
        readonly type: K;
    }>, ctx: Ctx, meta: ModelStepMeta<S, By>) => void | Promise<void>;
};
export interface ModelAdapter<S, E extends {
    readonly type: string;
}, By, Ctx> {
    readonly setup: () => Ctx | Promise<Ctx>;
    readonly teardown?: (ctx: Ctx) => void | Promise<void>;
    readonly events: EventHandlers<S, E, By, Ctx>;
    readonly assertState: (state: S, ctx: Ctx, meta: ModelStateMeta<S, E, By>) => void | Promise<void>;
    readonly assertRefusal?: (event: ModelInput<E, By>, state: S, ctx: Ctx, meta: ModelStepMeta<S, By>) => void | Promise<void>;
}
export interface RunModelOptions<S, E, By> extends PlanOptions<S, E> {
    readonly events: readonly ModelInput<E, By>[];
    readonly shape?: ComparisonShape;
    readonly assertCoverage?: boolean;
}
export interface ModelRunReport<S, E> {
    readonly strategy: PathStrategy;
    readonly paths: number;
    readonly steps: number;
    readonly coverage: ModelPlan<S, E>["coverage"];
}
export declare function runModel<O extends Oracle<any, any>, Ctx>(oracle: O, adapter: ModelAdapter<ModelState<O>, ModelEvent<O>, ModelSender<O>, Ctx>, options: RunModelOptions<ModelState<O>, ModelEvent<O>, ModelSender<O>>): Promise<ModelRunReport<ModelState<O>, ModelEvent<O>>>;
