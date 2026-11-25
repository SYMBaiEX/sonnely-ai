import { type Options } from "./emit.ts";
export interface Watcher {
    on(event: string, listener: (file: string) => void): unknown;
}
/**
 * Storybook's main config for the project whose `.storybook` directory is `dir`: the generated stories and the
 * hand-written ones, regenerated as components change. The project is never the working directory, which
 * belongs to whatever loads the config.
 */
export declare function defineMain(dir: string, options?: Omit<Options, "root">): {
    framework: string;
    stories: string[];
    addons: string[];
    core: {
        disableTelemetry: boolean;
    };
    viteFinal: <Config extends {
        plugins?: unknown[];
    }>(config: Config) => Config & {
        plugins: unknown[];
    };
};
