import { defineConfig } from "vitest/config";
import type { PluginOption } from "vite";
export interface Project {
    root: string;
    tests?: string[];
    plugins?: PluginOption[];
}
export declare const project: ({ root, tests, plugins }: Project) => ReturnType<typeof defineConfig>;
