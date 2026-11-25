import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeWhole } from "../run.js";
import { check, syncDoc, themeCss, tokensCss } from "./generate.js";
import { parseTokens } from "./tokens.js";
const read = (file) => readFileSync(file, "utf8");
export function writeTextIfChanged(file, text) {
    if (!existsSync(file) || read(file) !== text)
        writeWhole(file, text);
}
export function loadTokens(directory) {
    return parseTokens(JSON.parse(read(join(directory, "tokens.json"))));
}
export function buildTokenProject(directory, tokens = loadTokens(directory)) {
    const generated = join(directory, "generated");
    mkdirSync(generated, { recursive: true });
    writeTextIfChanged(join(generated, "tokens.css"), tokensCss(tokens));
    writeTextIfChanged(join(generated, "theme.css"), themeCss(tokens));
    const design = join(directory, "design.md");
    writeTextIfChanged(design, syncDoc(read(design), tokens));
}
export function checkTokenProject(directory) {
    return check(loadTokens(directory), read(join(directory, "design.md")));
}
