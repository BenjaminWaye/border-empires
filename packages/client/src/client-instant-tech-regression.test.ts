import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("client tech flow no longer creates local research countdown state", () => {
  const source = fs.readFileSync(new URL("./client-app-runtime.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /state\.currentResearch = \{\s*techId,\s*startedAt,/);
  assert.doesNotMatch(source, /Researching now\. Completes in/);
  assert.doesNotMatch(source, /Researching •/);
  assert.match(source, /pushFeed\(`Unlocking: \$\{tech\.name\}\.`\, "tech", "info"\);/);
});
