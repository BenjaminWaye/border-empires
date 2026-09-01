import { describe, expect, it } from "vitest";

import { BARBARIAN_RAID_COST, requiredMusterForFort } from "@border-empires/shared";
import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";

// The fort overview's "Capturing requires N mustered manpower" line replaced
// the old Garrison fill line when the fort-garrison mechanic was removed. It
// must report the same number the client's own attack gate enforces
// (findClosestMuster -> requiredMusterForTarget in client-muster-attack-gate.ts),
// not the fort tier's flat cost alone -- barbarian-held tiles are raided for
// BARBARIAN_RAID_COST regardless of what sits on them, so keying the text off
// the fort variant would overstate the cost by ~30x on a barbarian fort.
const baseDeps = {
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
  areaEffectModifiersForTile: () => [],
  townPartialLoadingStartedAt: () => Date.now()
};

const captureLine = (tile: Tile): string | undefined =>
  menuOverviewForTile(tile, baseDeps).find((line) => line.html.includes("Capturing requires"))?.html;

describe("menuOverviewForTile — fort capture cost line", () => {
  it("reports the fort tier's flat muster cost for an enemy-player fort", () => {
    const line = captureLine({
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "enemy",
      ownershipState: "SETTLED",
      fort: { ownerId: "enemy", status: "active", variant: "FORT" }
    });
    expect(line).toContain(`Capturing requires ${requiredMusterForFort("FORT")} mustered manpower.`);
  });

  it("reports the cheap barbarian raid cost on a barbarian-held fort, not the fort tier cost", () => {
    const line = captureLine({
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "barbarian-1",
      ownershipState: "SETTLED",
      fort: { ownerId: "barbarian-1", status: "active", variant: "FORT" }
    });
    expect(line).toContain(`Capturing requires ${BARBARIAN_RAID_COST} mustered manpower.`);
    expect(line).not.toContain(`${requiredMusterForFort("FORT")}`);
  });

  it("omits the line entirely while the fort is still under construction", () => {
    const line = captureLine({
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "enemy",
      ownershipState: "SETTLED",
      fort: { ownerId: "enemy", status: "under_construction" }
    });
    expect(line).toBeUndefined();
  });
});
