import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("tech choice grants immediately instead of starting timed research", () => {
  const source = fs.readFileSync(new URL("./main.ts", import.meta.url), "utf8");
  assert.match(source, /const startTechResearch =[\s\S]*grantTech\(player, tech\);[\s\S]*return \{ ok: true, tech \};/);
  assert.doesNotMatch(source, /const startTechResearch =[\s\S]*player\.currentResearch = \{/);
  assert.match(source, /if \(msg\.type === "CHOOSE_TECH"\) \{[\s\S]*sendTechUpdate\(actor, "completed"\);/);
});
