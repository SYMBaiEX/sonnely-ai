import { defineConfig } from "vitest/config";
import type { PluginOption } from "vite";
export interface Project {
    /** The package directory: `import.meta.dirname` of its vitest.config.ts. */
    root: string;
    /** The tests that are not browser tests, where they are not TESTS. */
    tests?: string[];
    /** Vite plugins the tests' sources need, such as Tailwind's. */
    plugins?: PluginOption[];
}
/** The package's tests, and those generate.ts derives from its schemas and contracts, written first (its `main`). */
export declare const project: ({ root, tests, plugins }: Project) => ReturnType<typeof defineConfig>;
