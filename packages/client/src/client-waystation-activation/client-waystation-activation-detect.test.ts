import { describe, expect, it, vi } from "vitest";
import { emitWaystationActivationIfActivated } from "./client-waystation-activation-detect.js";
const NOW = 1_800_000_000_000;
const serverNow = (): number => NOW;
const tileUpdates = [{
  x: 4,
  y: 5,
  waystationJson: JSON.stringify({ activated: true, activatedByPlayerId: "player-1", activatedAt: NOW - 500, grantedEffect: "RESOURCE_TILE", grantedResource: "FOOD" })
}];

describe("emitWaystationActivationIfActivated", () => {
  // Regression for: a live TILE_DELTA_BATCH activation and a WAYSTATION_ACTIVATED
  // eventLog entry for the same activation can arrive as separate messages with
  // no ordering guarantee (client-waystation-activation-catchup.ts). If the
  // eventLog-driven catch-up path already showed the popup and marked it seen,
  // the live path must defer to that instead of showing a second popup.
  it("does not show the popup when deps.isSeen reports it was already shown", () => {
    const showOverlay = vi.fn();
    emitWaystationActivationIfActivated(
      {
        tileUpdates,
        me: "player-1",
        techCatalog: [],
        onJumpToLocation: vi.fn()
      },
      { showOverlay, isSeen: () => true, serverNow }
    );
    expect(showOverlay).not.toHaveBeenCalled();
  });

  it("shows the popup and marks it seen when not already shown", () => {
    const showOverlay = vi.fn();
    const markSeen = vi.fn();
    emitWaystationActivationIfActivated(
      {
        tileUpdates,
        me: "player-1",
        techCatalog: [],
        onJumpToLocation: vi.fn()
      },
      { showOverlay, markSeen, isSeen: () => false, serverNow }
    );
    expect(showOverlay).toHaveBeenCalledTimes(1);
    expect(showOverlay).toHaveBeenCalledWith(expect.objectContaining({ grantedEffect: "RESOURCE_TILE", grantedResource: "FOOD" }));
    expect(markSeen).toHaveBeenCalledWith(4, 5);
  });

  // Regression: a player who withdrew and landed a new empire got the previous
  // empire's "+5 000 Population into <old town>" card. Withdrawing releases every
  // old territory tile, and the re-sent delta carried the waystation's permanent
  // consumed record, which this path took for a fresh activation.
  it.each([
    ["an old activation", { activatedAt: NOW - 3 * 60 * 60_000 }],
    ["a legacy record with no activation time", {}]
  ])("does not replay %s re-sent with a later tile delta", (_label, stamp) => {
    const showOverlay = vi.fn();
    const markSeen = vi.fn();
    emitWaystationActivationIfActivated(
      {
        tileUpdates: [{
          x: 438,
          y: 290,
          waystationJson: JSON.stringify({ activated: true, activatedByPlayerId: "player-1", ...stamp, grantedEffect: "POPULATION", grantedTownName: "Mosscorner Lane", grantedTownX: 440, grantedTownY: 292 })
        }],
        me: "player-1",
        techCatalog: [],
        onJumpToLocation: vi.fn()
      },
      { showOverlay, markSeen, isSeen: () => false, serverNow }
    );
    expect(showOverlay).not.toHaveBeenCalled();
    expect(markSeen).not.toHaveBeenCalled();
  });
});
