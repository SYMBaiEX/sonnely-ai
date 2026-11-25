import { type Spec } from "../parse.ts";
import { type Remember, type Reported } from "../util.ts";
import type { TestProfile } from "./profile.ts";
/** The configuration every package shares (vibestack/testing/vitest.ts): `spec init` writes it, and `check` where test/ has nothing to run it. */
export declare const VITEST_CONFIG = "import { project } from \"vibestack/testing/vitest\";\n\nexport default project({ root: import.meta.dirname });\n";
/**
 * The tests stage of one of `codeDirs`: the rules its tests are held to, then its own `test` script, run in its
 * directory. A pass is remembered until something the tests read changes; in a `check` that Turborepo runs, which
 * waits for the package's `test`, the script has just run and is not run again.
 */
export declare function tests(checking: string, dir: string, specs: Spec[], remember: Remember, mode?: TestProfile, fresh?: boolean, autoVitest?: boolean): Promise<Reported<"tests">[]>;
