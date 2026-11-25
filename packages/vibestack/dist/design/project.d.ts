export declare function writeTextIfChanged(file: string, text: string): void;
export declare function loadTokens(directory: string): import("./tokens.ts").Tokens;
export declare function buildTokenProject(directory: string, tokens?: import("./tokens.ts").Tokens): void;
export declare function checkTokenProject(directory: string): string[];
