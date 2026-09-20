import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression for the 2026-09-18 incident: a season could auto-start an hour
// after the previous one ended, even with no player vote, skipping players
// past the old season's scoreboard. Season rollover must only happen via the
// START_NEW_SEASON vote path -- this asserts the auto-start timer is not
// wired back into gateway-app.ts's startup sequence.
describe("gateway-app season rollover wiring", () => {
  it("never calls startImperialWardAutoStartTimer on startup", () => {
    const source = readFileSync(fileURLToPath(new URL("./gateway-app.ts", import.meta.url)), "utf8");
    expect(source).not.toContain("startImperialWardAutoStartTimer");
  });
});
