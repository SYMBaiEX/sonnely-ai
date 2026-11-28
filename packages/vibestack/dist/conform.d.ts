import { type Found, type Oracle, type Sent } from "./conformance.ts";
import type { Model } from "./gen.ts";
import { type Spec } from "./parse.ts";
import type { Step } from "./simulate.ts";
import { type TestProfile } from "./testing/profile.ts";
import { type Remember, type Reported } from "./util.ts";
export type Simulated = Found<any> & {
    traces: Sent<any>[][];
};
export interface Machine {
    domain: Oracle<any, any>;
    model: Model;
    found: Simulated;
}
export declare function conformanceFound(model: Model, spec: Spec, traces: Step[][], witnesses: {
    w: string;
    trace: Step[];
}[]): Simulated;
/** gen/<name>.conformance.ts: the types a test/drivers/<name>.ts is written to, over a copy of conformance.ts. */
export declare function writeConformance(model: Model, write: (name: string, text: string) => void): void;
/**
 * Every driver, configured program and recorded trace of the package `root`. A driver's pass is remembered until what
 * its run reads changes: the package's tests, drivers, counterexamples and code (util.ts, `testInputs`), and the
 * events the simulator found; a failure runs again. A `driver:` program may be anything, so it runs every time. A shell
 * with no driver gets one to fill in; what the stage writes is added to `wrote`.
 */
export declare function conformance(root: string, machines: Map<string, Machine>, scripts: Record<string, string>, remember: Remember, wrote: Map<string, string>, mode?: TestProfile): Promise<Reported<"traces">[]>;
