import { describe, expect, it } from "vitest";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { WORLD_WIDTH } from "@border-empires/shared";

import { supportSummaryForTown } from "./player-update-economy.js";

const makePlayer = (): DomainPlayer => ({
  id: "player-1",
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set(),
  domainIds: new Set(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set()
});

// REGRESSION (2026-09-10): supportSummaryForTown feeds real gold income
// (townGoldPerMinuteForPlayer's supportRatio) directly, not just display --
// it used to be hardcoded to radius 1 regardless of the town's own tier, so
// a GREAT_CITY/METROPOLIS town's supportMax could never exceed 8 even
// though it can draw from up to 24 tiles, and a settled tile on the second
// ring was never counted toward supportCurrent either. It also built its
// neighbor key with a raw (non-wrapped) `tile.x + dx` while every sibling
// support-ring function elsewhere in this codebase already wraps -- fails
// at a world edge, exercised here by placing the far support tile on the
// west edge (x=0) so wrapX has to kick in. Split into its own file rather
// than added to player-update-economy.test.ts, which was already close to
// the repo's 500-line cap.
describe("supportSummaryForTown: second support ring", () => {
  // Skipped (2026-09-12 prod incident): second ring reverted again, see
  // town-growth.ts's supportRingRadiusForTier comment. Re-enable once the
  // ring returns with a properly-scoped cost bound.
  it.skip("counts a distance-2 support tile toward a GREAT_CITY town's supportMax/supportCurrent, wrapping at the map edge", () => {
    const player = makePlayer();
    const greatCity: DomainTileState = {
      x: 0,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      town: { type: "MARKET", populationTier: "GREAT_CITY", name: "Aldergate" }
    };
    // Two tiles west of the town wraps around the map edge back to a large x.
    const farSupport: DomainTileState = {
      x: WORLD_WIDTH - 2,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED"
    };
    const tiles = new Map<string, DomainTileState>([
      ["0,10", greatCity],
      [`${WORLD_WIDTH - 2},10`, farSupport]
    ]);

    expect(supportSummaryForTown(player.id, greatCity, tiles)).toEqual({ supportCurrent: 1, supportMax: 1 });
  });
});
