import { type VibestackMode } from "./config.ts";
import { type DoctorReport } from "./doctor.ts";
import { linkProjectAgents } from "./skill-links.ts";
export { linkProjectAgents as linkAgents };
export declare const MANIFEST_PATH = ".agents/.vibestack-manifest.json";
export interface ManagedManifest {
    version: string;
    files: Record<string, string>;
}
export interface InitOptions {
    mode?: VibestackMode;
    exclude?: string[];
    yes?: boolean;
    warn?: (message: string) => void;
}
export interface UpgradeOptions {
    version?: string;
    dryRun?: boolean;
    from?: string;
    force?: boolean;
    warn?: (message: string) => void;
}
export interface UpgradeResult {
    fromVersion?: string;
    toVersion: string;
    dryRun: boolean;
    bumped: string[];
    added: string[];
    updated: string[];
    removed: string[];
    conflicts: string[];
    pinned: string[];
    linked: string[];
    doctor?: DoctorReport;
}
export declare function initProject(root: string, options?: InitOptions): string[];
export declare function upgradeProject(root: string, options?: UpgradeOptions): Promise<UpgradeResult>;
export declare function formatUpgradeResult(result: UpgradeResult): string;
