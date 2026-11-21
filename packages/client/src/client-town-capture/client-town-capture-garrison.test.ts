// @vitest-environment happy-dom
// Playtest 2026-11-21: a captured town lands ungarrisoned and gives no coin or manpower, and the capture card
// only mentioned that in its closing footnote. It now warns and offers "Garrison now" unless auto-garrison is on.
import { NEW_PLAYER_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadedAutoSettleState } from "../client-auto-settle-prompt/client-auto-settle-prefs.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { showTownCaptureOverlay, type TownCaptureInfo } from "./client-town-capture.js";
import { emitTownCaptureIfCaptured } from "./client-town-capture-detect.js";
import { registerTownCaptureGarrison, resetTownCaptureGarrisonForTest } from "./client-town-capture-garrison.js";

const town = { name: "Quartzcrown", type: "FARMING", populationTier: "TOWN", population: 23_791 } as NonNullable<Tile["town"]>;
const captured = (ownershipState: Tile["ownershipState"]): Tile => ({ x: 481, y: 75, terrain: "LAND", ownerId: "me", ownershipState, town } as Tile);
const autoSettle = (towns: boolean): Pick<ClientState, "autoSettle"> => ({ autoSettle: loadedAutoSettleState({ ...NEW_PLAYER_AUTO_SETTLE_PREFS, answered: true, towns }) });

/** The info the capture detector would hand the card for a tile that just flipped to "me". */
const detect = (tile: Tile): TownCaptureInfo | undefined => {
  let shown: TownCaptureInfo | undefined;
  emitTownCaptureIfCaptured(
    {
      tileUpdates: [{ x: tile.x, y: tile.y }],
      previousTileByKey: new Map([["481,75", { ownerId: "rival", town }]]),
      tiles: new Map([["481,75", tile]]),
      me: "me", meName: "House Me", keyFor: (x, y) => `${x},${y}`, onJumpToTown: () => undefined
    },
    { showOverlay: (info) => { shown = info; } }
  );
  return shown;
};

describe("town capture card garrison prompt", () => {
  afterEach(() => {
    document.getElementById("town-capture-overlay")?.remove();
    resetTownCaptureGarrisonForTest();
  });

  it("offers Garrison now for an ungarrisoned capture, and it garrisons the town then jumps there", () => {
    const garrisonAt = vi.fn(() => true);
    registerTownCaptureGarrison(autoSettle(false), garrisonAt);
    const info = detect(captured("FRONTIER"));
    expect(info?.garrison?.kind).toBe("manual");
    const jump = vi.fn();
    showTownCaptureOverlay({ ...info!, onJumpToTown: jump });
    expect(document.getElementById("town-capture-garrison-warning")?.textContent).toContain("Not garrisoned");
    document.getElementById("town-capture-garrison")?.click();
    expect(garrisonAt).toHaveBeenCalledWith(481, 75);
    expect(jump).toHaveBeenCalledOnce();
    expect(document.getElementById("town-capture-overlay")).toBeNull();
  });

  it("says auto-garrison will handle it instead of a button when the towns pref is on", () => {
    registerTownCaptureGarrison(autoSettle(true), () => true);
    const info = detect(captured("FRONTIER"));
    expect(info?.garrison).toEqual({ kind: "auto" });
    showTownCaptureOverlay(info!);
    expect(document.getElementById("town-capture-garrison")).toBeNull();
    expect(document.getElementById("town-capture-note")?.textContent).toContain("Auto-garrison is on");
  });

  it("prompts nothing for a town that is already garrisoned", () => {
    registerTownCaptureGarrison(autoSettle(false), () => true);
    const info = detect(captured("SETTLED"));
    expect(info?.garrison).toBeUndefined();
    showTownCaptureOverlay(info!);
    expect(document.getElementById("town-capture-garrison")).toBeNull();
    expect(document.getElementById("town-capture-garrison-warning")).toBeNull();
  });
});
