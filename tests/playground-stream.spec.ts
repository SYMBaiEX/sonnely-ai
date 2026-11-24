import { expect, test } from "@playwright/test";
import { readPlaygroundReply } from "../lib/playground-stream";

function response(...events: string[]) {
  return new Response(events.map((data) => "data: " + data + "\n\n").join("")).body!;
}

test("AI SDK assembles the gateway stream through its settlement marker", async () => {
  const output = [];
  for await (const text of readPlaygroundReply(
    response(
      '{"choices":[{"delta":{"content":"**Hello"}}]}',
      '{"choices":[{"delta":{"content":" world**"}}]}',
      "[DONE]",
    ),
  ))
    output.push(text);
  expect(output).toEqual(["**Hello", "**Hello world**"]);
});

test("an incomplete or failed gateway stream is not a completed response", async () => {
  const incomplete = readPlaygroundReply(response('{"choices":[{"delta":{"content":"Partial"}}]}'));
  await expect(incomplete.next()).resolves.toMatchObject({ done: false, value: "Partial" });
  await expect(incomplete.next()).rejects.toThrow(/before billing was finalized/);
  const failed = readPlaygroundReply(response('{"error":{"message":"Reservation rejected"}}', "[DONE]"));
  await expect(failed.next()).rejects.toThrow("Reservation rejected");
});
