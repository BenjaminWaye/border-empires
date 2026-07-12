import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Emperor-endorsement bonus (galaxy meta-layer Phase 1). Source-string
// assertions rather than a full renderClientHud() DOM harness — matches the
// existing client-hud-*-regression.test.ts convention for cheaply locking in
// wiring in this file without constructing the full HudDeps mock object.
describe("client HUD Imperial Ward chip regression", () => {
  it("renders the Imperial Ward chip into the always-visible stat-chip bar", () => {
    const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

    expect(hudSource).toContain('import { imperialWardChipHtml, bindImperialWardChip } from "../client-imperial-ward/client-imperial-ward.js";');
    expect(hudSource).toContain("${imperialWardChipHtml(state)}");
    expect(hudSource).toContain("bindImperialWardChip(dom.statsChipsEl, sendGameMessage);");
  });
});
