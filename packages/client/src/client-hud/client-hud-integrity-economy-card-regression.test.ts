import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Empire Integrity moved off the top bar into the Economy panel (its summary
// card opens the breakdown). Source-string assertions, matching the other
// client-hud-*-regression tests, rather than a full renderClientHud() harness.
describe("client HUD Empire Integrity economy card regression", () => {
  const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

  it("passes integrity to the Economy panel", () => {
    expect(hudSource).toContain("integrityPct: state.defensibilityPct,");
  });

  it("wires the open-integrity buttons across the whole HUD, after the Economy panel HTML is in place", () => {
    const panelInsert = hudSource.indexOf("dom.panelEconomyEl.innerHTML = dom.mobilePanelEconomyEl.innerHTML = economyPanelHtml;");
    const wiring = hudSource.indexOf('dom.hud.querySelectorAll("[data-defensibility-open]")');
    expect(panelInsert).toBeGreaterThan(-1);
    expect(wiring).toBeGreaterThan(panelInsert);
    expect(hudSource).not.toContain('dom.statsChipsEl.querySelectorAll("[data-defensibility-open]")');
  });

  it("only puts the integrity chip on the top bar via integrityChipHtml (penalty range only)", () => {
    expect(hudSource).toContain("${integrityChipHtml({ pct: state.defensibilityPct, defClass, showWarning: showIntegrityWarning, mobile })}");
    expect(hudSource).toContain("state.defensibilityPct < INTEGRITY_PENALTY_PCT");
  });
});
