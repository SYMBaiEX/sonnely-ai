type BrowserInstall = "both" | "full" | "shell";
export declare function hostedCiWorkspace(): string | undefined;
export declare function installChromium(mode: BrowserInstall, cwd?: string): Promise<void>;
export declare function prepareChromiumShell(): Promise<boolean>;
export declare function chromiumForExplore(): Promise<NodeJS.ProcessEnv>;
export {};
