import fs from "node:fs";
import { expect, test } from "vitest";

test("tech choice grants immediately instead of starting timed research", () => {
  const source = fs.readFileSync(new URL("./main.ts", import.meta.url), "utf8");
  expect(source).toMatch(/const startTechResearch =[\s\S]*grantTech\(player, tech\);[\s\S]*return \{ ok: true, tech \};/);
  expect(source).not.toMatch(/const startTechResearch =[\s\S]*player\.currentResearch = \{/);
  expect(source).toMatch(/if \(msg\.type === "CHOOSE_TECH"\) \{[\s\S]*sendTechUpdate\(actor, "completed"\);/);
});
