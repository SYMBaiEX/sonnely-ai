import { type Tokens } from "./tokens.ts";
/** Plain custom properties, usable without Tailwind. */
export declare const tokensCss: (tokens: Tokens) => string;
/** The Tailwind v4 entry: utilities named after the tokens. */
export declare const themeCss: (tokens: Tokens) => string;
/** `design.md` with its token table regenerated; prose outside the markers is kept. */
export declare function syncDoc(doc: string, tokens: Tokens): string;
/** What `check` reports beyond the token shapes: contrast below AA and a stale design.md. */
export declare const check: (tokens: Tokens, doc: string) => string[];
