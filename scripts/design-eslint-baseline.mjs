import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const baselinePath = new URL("../design-baseline.json", import.meta.url);
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const write = process.argv.includes("--write");
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const run = spawnSync(command, ["exec", "eslint", "apps/app/src/web/**/*.{ts,tsx}", "--format", "json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

if (run.error) throw run.error;
if (!run.stdout.trim()) throw new Error(run.stderr || "eslint produced no JSON output");

const results = JSON.parse(run.stdout);
const current = {};
const fatal = [];
let total = 0;

for (const row of results) {
  const file = relative(root, row.filePath).replaceAll("\\", "/");
  const groups = new Map();
  for (const message of row.messages ?? []) {
    if (message.severity !== 2) continue;
    if (!message.ruleId) {
      fatal.push(`${file}:${message.line ?? 0}: ${message.message}`);
      continue;
    }
    const key = message.message ?? "";
    if (!groups.has(key)) groups.set(key, new Map());
    const rules = groups.get(key);
    rules.set(message.ruleId, (rules.get(message.ruleId) ?? 0) + 1);
  }
  if (!groups.size) continue;
  current[file] = {};
  for (const [message, rules] of [...groups].sort()) {
    const count = [...rules.values()].reduce((sum, value) => sum + value, 0);
    current[file][[...rules.keys()].sort().join("\n") + "\n" + message] = count;
    total += count;
  }
}

if (fatal.length) {
  for (const line of fatal.slice(0, 40)) console.error(line);
  console.error("eslint reported fatal diagnostics; fix them before comparing the design baseline");
  process.exit(1);
}

if (write) {
  baseline.eslint = { suppressed: current };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`design eslint baseline written: ${total} errors across ${Object.keys(current).length} files`);
  process.exit(0);
}

const expected = baseline.eslint?.suppressed ?? {};
const increased = [];
const decreased = [];
const files = new Set([...Object.keys(expected), ...Object.keys(current)]);
let expectedTotal = 0;

for (const file of files) {
  const before = expected[file] ?? {};
  const after = current[file] ?? {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const oldCount = before[key] ?? 0;
    const newCount = after[key] ?? 0;
    expectedTotal += oldCount;
    if (newCount > oldCount) increased.push(`${file}: ${newCount - oldCount} new: ${key.split("\n").at(-1)}`);
    if (newCount < oldCount) decreased.push(`${file}: ${oldCount - newCount} fixed: ${key.split("\n").at(-1)}`);
  }
}

if (increased.length || decreased.length) {
  for (const line of [...increased, ...decreased].slice(0, 80)) console.error(line);
  if (increased.length) console.error("design-lint errors increased; fix the new violations instead of raising the baseline");
  if (decreased.length) console.error("design-lint errors decreased; run pnpm lint:design:write to tighten the baseline");
  process.exit(1);
}

console.log(`design eslint baseline holds: ${total} errors across ${Object.keys(current).length} files`);
