import { describe, expect, it, vi } from "vitest";
import { emitWaystationActivationIfActivated } from "./client-waystation-activation-detect.js";
const tileUpdates = [{
  x: 4,
  y: 5,
  waystationJson: JSON.stringify({ activated: true, activatedByPlayerId: "player-1", grantedEffect: "RESOURCE_TILE", grantedResource: "FOOD" })
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
      { showOverlay, isSeen: () => true }
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
      { showOverlay, markSeen, isSeen: () => false }
    );
    expect(showOverlay).toHaveBeenCalledTimes(1);
    expect(showOverlay).toHaveBeenCalledWith(expect.objectContaining({ grantedEffect: "RESOURCE_TILE", grantedResource: "FOOD" }));
    expect(markSeen).toHaveBeenCalledWith(4, 5);
  });
});
