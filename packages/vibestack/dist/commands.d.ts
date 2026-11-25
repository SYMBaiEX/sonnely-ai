import { type TestProfile } from "./testing/profile.ts";
import type { Spec } from "./parse.ts";
export interface CommandResult {
    ok: boolean;
    stage: string;
    summary: string;
    detail: string;
    where?: string;
}
export interface SimulationPrepFn {
    (root: string, specs: Spec[], targets: readonly string[], seedParent: string): Promise<{
        results: CommandResult[];
        seedDirectory?: string;
        partialDirectory?: string;
    }>;
}
export declare function startPhaseTimings(): () => string;
export declare function runConformanceCommand(root: string, moduleName?: string, mode?: TestProfile): Promise<boolean>;
export declare function runExploreCommand(root: string, mode?: TestProfile): Promise<boolean>;
export declare function runCiCommand(root: string, args: string[], prepareSimulationReceipts: SimulationPrepFn): Promise<number>;
export declare function launchStudio(root: string, args: string[]): void;
export declare function launchCreate(root: string, args: string[]): void;
