import { describe, expect, it, vi } from "vitest";
import { emitWaystationActivationIfActivated } from "./client-waystation-activation-detect.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const activatedTile = (x: number, y: number, ownerId: string): Tile =>
  ({
    x,
    y,
    ownerId,
    waystation: { activated: true, activatedByPlayerId: ownerId, grantedEffect: "RESOURCE_SLOT", grantedResource: "FOOD" }
  }) as Tile;

describe("emitWaystationActivationIfActivated", () => {
  // Regression for: a live TILE_DELTA_BATCH activation and a WAYSTATION_ACTIVATED
  // eventLog entry for the same activation can arrive as separate messages with
  // no ordering guarantee (client-waystation-activation-catchup.ts). If the
  // eventLog-driven catch-up path already showed the popup and marked it seen,
  // the live path must defer to that instead of showing a second popup.
  it("does not show the popup when deps.isSeen reports it was already shown", () => {
    const tiles = new Map<string, Tile>([["4,5", activatedTile(4, 5, "player-1")]]);
    const showOverlay = vi.fn();
    emitWaystationActivationIfActivated(
      {
        tileUpdates: [{ x: 4, y: 5 }],
        previousWaystationByKey: new Map([["4,5", undefined]]),
        tiles,
        me: "player-1",
        keyFor,
        techCatalog: [],
        onJumpToLocation: vi.fn()
      },
      { showOverlay, isSeen: () => true }
    );
    expect(showOverlay).not.toHaveBeenCalled();
  });

  it("shows the popup and marks it seen when not already shown", () => {
    const tiles = new Map<string, Tile>([["4,5", activatedTile(4, 5, "player-1")]]);
    const showOverlay = vi.fn();
    const markSeen = vi.fn();
    emitWaystationActivationIfActivated(
      {
        tileUpdates: [{ x: 4, y: 5 }],
        previousWaystationByKey: new Map([["4,5", undefined]]),
        tiles,
        me: "player-1",
        keyFor,
        techCatalog: [],
        onJumpToLocation: vi.fn()
      },
      { showOverlay, markSeen, isSeen: () => false }
    );
    expect(showOverlay).toHaveBeenCalledTimes(1);
    expect(markSeen).toHaveBeenCalledWith(4, 5);
  });
});
