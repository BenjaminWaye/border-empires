/**
 * A tower only sees for its owner while that owner still holds the tile.
 * Regression cover for the abandon change: UNCAPTURE_TILE now leaves the
 * tower standing on a neutral tile, and observatory vision keys on the
 * structure's ownerId — without the tile-ownership gate the abandoner would
 * keep full vision from land they no longer hold, for free (CRYSTAL slot
 * demand only counts owned tiles).
 */
import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { reconcileObservatoryVisionBonus, seedObservatoryVisionBonus } from "./runtime-observatory-vision.js";

const buildDeps = () => {
  const set: Array<{ sourceId: string; x: number; y: number; radius: number }> = [];
  const removed: Array<{ sourceId: string; x: number; y: number }> = [];
  return {
    calls: { set, removed },
    deps: {
      isStructureDormant: () => false,
      coverage: {
        setObservatoryVisionBonus: (sourceId: string, x: number, y: number, radius: number) => set.push({ sourceId, x, y, radius }),
        removeObservatoryVisionBonus: (sourceId: string, x: number, y: number) => removed.push({ sourceId, x, y })
      }
    }
  };
};

const tile = (ownerId: string | undefined): DomainTileState =>
  ({ x: 4, y: 7, terrain: "LAND", lastChangedAt: 0, ownerId, observatory: { ownerId: "p1", status: "active" } }) as unknown as DomainTileState;

describe("observatory vision ownership gate", () => {
  it("grants the bonus while the tower's owner still holds the tile", () => {
    const { calls, deps } = buildDeps();
    seedObservatoryVisionBonus(deps, tile("p1"));
    expect(calls.set).toHaveLength(1);
    expect(calls.removed).toHaveLength(0);
  });

  it("drops the bonus when the tile is abandoned and the tower is left behind", () => {
    const { calls, deps } = buildDeps();
    reconcileObservatoryVisionBonus(deps, tile("p1"), tile(undefined));
    expect(calls.set).toHaveLength(0);
    expect(calls.removed).toEqual([{ sourceId: "p1", x: 4, y: 7 }]);
  });
});
