export declare class InstallationChanged extends Error {
    constructor();
}
/**
 * What was said of installed files, remembered across processes while each is unchanged: the same device, inode, size,
 * and modification and change times, which a copy or an archive cannot set back. An unchanged toolchain is not read again.
 */
export declare const LASTING: string;
export declare function lasting(key: string, files: string[], now?: string): {
    value: string | undefined;
    keep: (value: string) => string;
};
/** The executable's bytes, independent of the directory its installation lives in. */
export declare const executableDigest: (file: string, knownStamp?: string) => string;
export declare function packageLocation(name: string, from: string, exists?: (file: string) => boolean): string | undefined;
export declare function packageRoots(exe: string, name: string, exists?: (file: string) => boolean): readonly [string | undefined, string | undefined];
export declare const evaluatorIdentity: (root: string) => string | undefined;
export interface Evaluator {
    id: string;
    unchanged: () => boolean;
}
export declare function installedEvaluator(root: string): Evaluator | undefined;
