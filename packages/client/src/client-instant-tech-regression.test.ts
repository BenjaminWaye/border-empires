import fs from "node:fs";
import { expect, test } from "vitest";

test("client tech flow no longer creates local research countdown state", () => {
  const source = fs.readFileSync(new URL("./client-player-actions.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/state\.currentResearch = \{\s*techId,\s*startedAt,/);
  expect(source).not.toMatch(/Researching now\. Completes in/);
  expect(source).not.toMatch(/Researching •/);
  expect(source).toMatch(/pushFeed\(`Unlocking: \$\{tech\.name\}\.`\, "tech", "info"\);/);
});
