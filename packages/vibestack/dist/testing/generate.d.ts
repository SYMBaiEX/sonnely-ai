/** In every header: a change to what is generated rewrites every file. */
export declare const VERSION = 1;
/** An export no test could be derived for, or with `export: "*"` a whole module, which fails `main`. */
export interface Skipped {
    file: string;
    export: string;
    reason: string;
}
export interface Generated {
    written: string[];
    unchanged: string[];
    removed: string[];
    skipped: Skipped[];
}
/**
 * Bring `<packageDir>/.cache/generated/tests` up to date. Modules are imported to read their exports, a `.vibe` one
 * through the package's `vibelang/register`, so a schema or contract module must load without side effects, and one
 * that throws is skipped.
 */
export declare function generateTests(packageDir: string): Promise<Generated>;
/**
 * `spec tests [<directory>]` (vibestack/spec.ts) and `project()` (vitest.ts): generate, say what was skipped, and
 * throw, listing them, when a whole module gets no test, so that a package's tests fail rather than miss it.
 */
export declare function main(packageDir?: string): Promise<void>;
