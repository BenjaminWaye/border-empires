import { describe, expect, it } from "vitest";
import { musterFlagCap } from "@border-empires/shared";

import { trackerHtml } from "../client-hud-v2/client-hud-v2-tracker.js";
import { renderManpowerPanelHtml } from "../client-side-panel-html/client-side-panel-html.js";
import type { Tile } from "../client-types.js";
import { buildManpowerPanelMusterFlags } from "./client-muster-flags-panel.js";

// Playtest 2026-11-12 (pt-optimiser): one muster flag read "115 / 150" in the
// tracker and "69 / 732" then "93 / 744" in the Manpower panel. The panel
// printed the predicted fill as a raw float ("69.732"), and the tracker used
// the base cap for every flag, ignoring Expand Capacity. Both now print the
// same whole "amount / this flag's cap".
const MANPOWER_CAP = 1_000;
const flagTile: Tile = {
  x: 5, y: 6, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  muster: { ownerId: "me", amount: 69.732, mode: "HOLD", updatedAt: 0, capLevel: 2 }
};

describe("muster flag fill", () => {
  const flags = buildManpowerPanelMusterFlags([flagTile], "me", MANPOWER_CAP, MANPOWER_CAP, new Map());
  const cap = musterFlagCap(MANPOWER_CAP, 2);

  it("reads the same whole numbers over the flag's own cap in the panel and the tracker", () => {
    expect(cap).toBe(350);
    const panel = renderManpowerPanelHtml({
      manpower: 500, manpowerCap: MANPOWER_CAP, manpowerRegenPerMinute: 1, manpowerBreakdown: { cap: [], regen: [] },
      musterFlags: flags, formatManpowerAmount: (value) => `${value}`, rateToneClass: () => ""
    });
    const tracker = trackerHtml({
      buildSlots: { busy: 0, limit: 3 }, afcReady: 0, flags, flagCap: musterFlagCap(MANPOWER_CAP, 0), manpowerCap: MANPOWER_CAP,
      building: [], queue: [], slotsOpen: false, nowMs: 0
    });
    expect(panel).toContain("69 / 350");
    expect(panel).not.toContain("69.732");
    expect(tracker).toContain("69 / 350");
  });
});
