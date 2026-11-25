import { type TestProfile } from "./testing/profile.ts";
import { type Remember, type Reported } from "./util.ts";
export type Explored = {
    kind: "held";
    actions: number;
} | {
    kind: "broke";
    properties: string[];
    report: string;
} | {
    kind: "diverged";
    output: string;
} | {
    kind: "failed";
    why: string;
    output: string;
};
/**
 * What the page of the package at `root` reads, which its exploration is remembered under: the package's files but
 * those only its checks read; each file its code or its scripts name by a path, and each directory, which Tailwind
 * scans as text; what each workspace package its code imports, or its scripts run, offers; and, in turn, what those
 * name, the generated modules it imports among them, or all of them where its code names none, as through an alias.
 * A page that runs one of these tools may run any of them, as Studio's does, and reads the code of them all, as the
 * stages do (cache.ts). An unbounded enclosing directory has no reusable fingerprint.
 */
export declare function pageInputs(root: string, mode?: TestProfile): string | undefined;
/**
 * What a run of Bombadil found, from its exit status and what it printed: an exploration that took no action held
 * nothing, and a replay that could not follow its trace has diverged from the page.
 */
export declare function explored(status: number, stdout: string, stderr: string, replay: boolean): Explored;
/**
 * The explore stage of the package `directory`, checked from `checking`: nothing if it has no page. A trace saved by
 * an earlier failure is replayed first; then the page is explored for the profile's time. A pass is remembered until
 * what the page reads (`pageInputs`), the installed Bombadil and the packages it loads, or the script change.
 */
export declare function explore(directory: string, remember: Remember, mode?: TestProfile, checking?: string): Promise<Reported<"explore" | "skipped">[]>;
