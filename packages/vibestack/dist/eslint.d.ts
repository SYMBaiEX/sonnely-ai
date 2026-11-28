/** Minimal structural shape of an ESLint flat-config entry. */
export interface FlatConfig {
    name?: string | undefined;
    basePath?: string | undefined;
    files?: (string | string[])[] | undefined;
    ignores?: string[] | undefined;
    language?: string | undefined;
    linterOptions?: object | undefined;
    languageOptions?: {
        parser?: object | undefined;
        parserOptions?: object | undefined;
    } | undefined;
    plugins?: object | undefined;
    settings?: object | undefined;
    rules?: object | undefined;
}
/** Options for {@link withWorkspaceBarrels}. */
export interface WorkspaceBarrelsOptions {
    /** Repository root containing `pnpm-workspace.yaml` (or `package.json#workspaces`), typically `import.meta.dirname`. */
    readonly root: string;
    /** Existing non-barrel `exports` keys temporarily allowed per repo-relative manifest POSIX path. */
    readonly allowExports?: Readonly<Record<string, readonly string[]>>;
    /** Existing non-barrel import specifiers temporarily allowed per repo-relative source file POSIX path. */
    readonly allowImports?: Readonly<Record<string, readonly string[]>>;
}
export declare function withWorkspaceBarrels<T extends FlatConfig = FlatConfig>(config: readonly T[], options: WorkspaceBarrelsOptions): T[];
export interface VibestackEslintPlugins {
    js?: unknown;
    tseslint?: unknown;
    vibelang?: unknown;
    react?: unknown;
    reactHooks?: unknown;
    boundaries?: unknown;
    tailwind?: unknown;
}
export interface VibestackConfigOptions {
    root: string;
    plugins: VibestackEslintPlugins;
    design?: string;
    tsx?: string[];
    own?: string[];
    untyped?: string[];
    ignores?: string[];
    uiPackage?: string;
    commented?: Record<string, number>;
    scheduled?: Record<string, number>;
    allowExports?: Record<string, readonly string[]>;
    allowImports?: Record<string, readonly string[]>;
    extra?: readonly FlatConfig[];
}
export declare const STACK_IMPORT_PATTERNS: {
    regex: string;
    message: string;
}[];
/**
 * Reusable ESLint flat-config preset for Vibestack repositories. Consumers pass the ESLint plugins
 * installed in their own project, keeping `eslint.config.js` concise while enforcing stack rules,
 * workspace boundaries, design-system tokens, code discipline, and barrel-only exports.
 */
export declare function vibestackConfig(options: VibestackConfigOptions): FlatConfig[];
