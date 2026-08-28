import { describe, expect, it } from "vitest";

import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { TileOverviewModifier } from "../client-tile-overview-modifiers/client-tile-overview-modifiers.js";
import type { Tile } from "../client-types.js";

// Regression: converterModeStatusLine/converterModeLockLine used to add a
// "selling off its slot"/"currently contributing output and upkeep" status
// line and a "Mode flip available in Xm" cooldown line to an active
// converter's overview — both removed per user decision (redundant with what
// the mode-flip button itself already shows). Kept in its own file rather
// than growing client-tile-menu-view.test.ts, which is already over the
// repo's 500-line cap (AGENTS.md).
const activeSynthTile: Tile = {
  x: 90,
  y: 329,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  economicStructure: { ownerId: "me", type: "UMBRITE_SYNTHESIZER", status: "active" },
  upkeepEntries: [{ label: "Fur Synthesizer", perMinute: { GOLD: 5 } }]
};

const deps = {
  state: { me: "me" },
  prettyToken: (value: string) => value,
  playerNameForOwner: (ownerId?: string | null) => ownerId ?? undefined,
  terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
  displayTownGoldPerMinute: () => 0,
  populationPerMinuteLabel: () => "0/m",
  townNextGrowthEtaLabel: () => "never",
  supportedOwnedTownsForTile: () => [] as Tile[],
  connectedDockCountForTile: () => 0,
  hostileObservatoryProtectingTile: () => undefined,
  constructionCountdownLineForTile: () => "",
  tileHistoryLines: () => [] as string[],
  isTileOwnedByAlly: () => false,
  areaEffectModifiersForTile: () => [] as TileOverviewModifier[],
  townPartialLoadingStartedAt: () => Date.now()
};

describe("menuOverviewForTile — converter mode status/lock line removal", () => {
  it("no longer shows a converter mode status/lock line for active synth structures", () => {
    const lines = menuOverviewForTile(activeSynthTile, deps);
    expect(lines.some((line) => line.html.includes("currently contributing output and upkeep"))).toBe(false);
    expect(lines.some((line) => line.html.includes("selling off its slot"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Mode flip available"))).toBe(false);
  });
});
