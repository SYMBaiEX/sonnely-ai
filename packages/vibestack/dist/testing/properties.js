import { expect, it } from "@effect/vitest";
import { Arbitrary, Cause, Effect, Equal, Schema } from "effect";
import { Base64 } from "effect/encoding";
import { profile } from "./profile.js";
const mode = import.meta.env?.MODE === "nightly" ? "nightly" : "normal";
export const fuzz = profile(mode);
export const holds = (source, property, options) => {
    const used = { ...fuzz, ...options };
    return Arbitrary.checkEffect(Arbitrary.isArbitrary(source) ? source : Arbitrary.schema(source), (value) => {
        try {
            return Effect.succeed(property(value));
        }
        catch (error) {
            return Effect.fail(Cause.die(error));
        }
    }, used).pipe(Effect.flatMap((result) => {
        const failure = Arbitrary.formatCheckFailure(result);
        if (failure === undefined)
            return Effect.void;
        const file = expect.getState().testPath;
        const replay = `const path = require("node:path"); const cli = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs"); const run = require("node:child_process").spawnSync(process.execPath, [cli, ...${JSON.stringify(["run", ...file ? [file] : [], "--mode", mode === "nightly" ? "nightly" : "test"])}], { stdio: "inherit" }); if (run.error) throw run.error; process.exit(run.status ?? 1);`;
        const command = `node -e "eval(Buffer.from('${Base64.encode(replay)}','base64').toString())"`;
        return Effect.die(new Error(`${failure}\nSeed: ${used.seed}\nRerun: ${command}`));
    }));
};
/** Decoding what was encoded gives the value back. */
export function roundTrips(schema) {
    const same = Schema.toEquivalence(schema), encode = Schema.encodeSync(schema), decode = Schema.decodeUnknownSync(schema);
    return (value) => same(decode(encode(value)), value);
}
/** Encoding is stable: a value that went through its encoding and back encodes as it did before. */
export function encodesStably(schema) {
    const encode = Schema.encodeSync(schema), decode = Schema.decodeUnknownSync(schema);
    return (value) => { const once = encode(value); return Equal.equals(encode(decode(once)), once); };
}
/** Applying `f` twice is applying it once. */
export const idempotent = (f) => (input) => { const once = f(input); return Equal.equals(f(once), once); };
/** `f` gives equal outputs for the same input. */
export const deterministic = (f) => (input) => Equal.equals(f(input), f(input));
/** `rule` holds of every input and what `f` makes of it. */
export const invariant = (f, rule) => (input) => rule(input, f(input));
/** `back` undoes `f`. */
export const inverse = (f, back) => (input) => Equal.equals(back(f(input)), input);
const CONTRACT = "~vibestack/testing/Contract";
export const contract = (declared) => ({ ...declared, [CONTRACT]: true });
export const isContract = (u) => typeof u === "object" && u !== null && CONTRACT in u;
/** The properties `c` declares, by name: generate.ts writes one `contractTest` for each. */
export const declared = (c) => ({
    deterministic: c.deterministic ? deterministic(c.run) : undefined,
    idempotent: c.idempotent ? idempotent(c.run) : undefined,
    invariant: c.invariant && invariant(c.run, c.invariant),
    inverse: c.inverse && inverse(c.run, c.inverse),
});
export function contractTest(name, c, property) {
    it.effect(`${name} is ${property}`, () => holds(c.input, declared(c)[property] ?? (() => { throw new Error(`${name} declares no ${property} property`); })));
}
export function schemaTests(name, schema) {
    const arbitrary = Arbitrary.schema(schema);
    it.effect(`${name}: decoding what was encoded gives the value back`, () => holds(arbitrary, roundTrips(schema)));
    it.effect(`${name}: encoding is stable`, () => holds(arbitrary, encodesStably(schema)));
}
