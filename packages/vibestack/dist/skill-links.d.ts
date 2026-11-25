export declare const SKILL_ROOT = ".agents/skills";
export declare const GENERATED_AGENT_DIRECTORIES: string[];
export declare const GENERATED_AGENT_IGNORES: string[];
export interface PackageAssets {
    pkgRoot: string;
    version: string;
    agentsMd: string;
    specMd: string;
    claudeSettings: string;
    skillsDirs: string[];
    packageJson: Record<string, unknown>;
}
/** Locate bundled Vibestack assets, checking `assets/` in the package first and falling back to the monorepo root in dev. */
export declare function resolvePackageAssets(basePkgDir?: string): PackageAssets;
/**
 * Fast, postinstall-safe symlink refresher (`vibestack link`).
 * Creates/updates only gitignored local links for AI coding agents and CLAUDE.md.
 * Never mutates package.json, .gitignore, or any tracked project file.
 */
export declare function linkProjectAgents(project: string, warn?: (message: string) => void): string[];
export declare function setupProjectAgents(project: string, warn: (message: string) => void): string[];
