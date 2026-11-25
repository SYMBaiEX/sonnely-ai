/** What one line of a spec is: a story or rule heading, a fence that opens or closes, a line inside a fence, or prose. */
export type LineKind = "story" | "rule" | "open" | "open quint" | "close" | "quint" | "fenced" | "prose";
/**
 * Every line of a spec with what it is. A fence of any kind (``` or ~~~, of any length) closes only with a fence of
 * the same character at least as long and nothing after it; `##` and `###` inside a fence are not headings.
 */
export declare function scanSpec(text: string): {
    text: string;
    kind: LineKind;
}[];
/**
 * `text` with `\r\n` read as `\n`, or a refusal naming the file and line if it holds NUL or a line break other than
 * `\n`. Quint, TypeScript, Dafny and these tools do not all agree on where a line ends at `\r`, `\v`, `\f`, U+0085,
 * U+2028 or U+2029, so a reviewer could see lines that differ from what a compiler reads, and prose could end a
 * comment early. No source needs NUL.
 */
export declare function plainText(file: string, text: string): string;
