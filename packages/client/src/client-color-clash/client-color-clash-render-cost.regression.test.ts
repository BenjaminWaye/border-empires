// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { allEmpireColorCandidates, empireColorChecker, type EmpireColorEntry, type EmpireColorsInUse } from "@border-empires/shared";
import { syncAuthPanelState } from "../client-auth-ui/client-auth-ui.js";
import { colorClashReason } from "./client-color-clash.js";

// Bug report bc313812 (staging, 2026-11-28): the game stalled for ~300 ms at a
// time on a phone. Every HUD render re-ran the setup screen's colour checks,
// hidden or not, and on a full sector each "too close" verdict rebuilt the
// shared checker and rescanned every candidate colour against every empire.

/** A sector where no candidate keeps the minimum distance: the expensive case. */
const fullMap = (): EmpireColorsInUse => {
  const empires: EmpireColorEntry[] = [];
  for (const color of allEmpireColorCandidates()) {
    if (empireColorChecker({ exact: [], empires }).isFree(color)) empires.push({ playerId: `p${empires.length}`, name: `P${empires.length}`, color });
    if (empires.length >= 30 && empireColorChecker({ exact: [], empires }).isFull()) break;
  }
  return { exact: [], empires };
};

/** A colour one step away from a rival's: refused as "too close", which triggers the full-map scan. */
const nudged = (hex: string): string => `#${hex.slice(1, 5)}${(parseInt(hex.slice(5), 16) ^ 4).toString(16).padStart(2, "0")}`;

const makeSwatches = (count: number): HTMLButtonElement[] =>
  Array.from({ length: count }, () => document.createElement("button"));

describe("colour checks stay cheap across HUD renders (bug report bc313812)", () => {
  const inUse = fullMap();
  const crowdedColors = inUse.empires.slice(0, 7).map((empire) => nudged(empire.color));

  test("the fixture is a genuinely full sector with near-clashing picks", () => {
    expect(empireColorChecker(inUse).isFull()).toBe(true);
    for (const hex of crowdedColors) expect(empireColorChecker(inUse).rejection(hex)).toBeUndefined();
  });

  test("checking the same picks every render does not repeat the full-map scan", () => {
    // 60 renders x 7 picks. Rebuilding the checker per check cost ~40 ms each
    // (~17 s here); with one memoised checker the scan runs once.
    const startedAt = performance.now();
    for (let render = 0; render < 60; render += 1) for (const hex of crowdedColors) colorClashReason(hex, inUse);
    expect(performance.now() - startedAt).toBeLessThan(1_500);
  });

  test("an in-game HUD render leaves the hidden setup colour picker alone", () => {
    const swatches = makeSwatches(6);
    const colorInput = document.createElement("input");
    colorInput.value = crowdedColors[0]!;
    const clashEl = document.createElement("p");
    syncAuthPanelState(
      { profileSetupRequired: false, suggestedColors: [], me: "me", playerColors: new Map(), playerNames: new Map() },
      {
        authEmailLinkSentTo: "",
        authPanelEl: document.createElement("div"),
        authEmailSentAddressEl: document.createElement("span"),
        authProfileColorEl: colorInput,
        authColorPresetButtons: swatches,
        authColorClashEl: clashEl
      } as unknown as Parameters<typeof syncAuthPanelState>[1]
    );
    for (const swatch of swatches) expect(swatch.dataset.color).toBeUndefined();
    expect(clashEl.textContent).toBe("");
  });
});
