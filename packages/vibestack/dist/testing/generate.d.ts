export declare const VERSION = 1;
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
export declare function generateTests(packageDir: string): Promise<Generated>;
export declare function main(packageDir?: string): Promise<void>;
