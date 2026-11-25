// @vitest-environment happy-dom
// Playtest 2026-11-21: a captured town lands ungarrisoned and gives no coin or manpower, and the capture card
// only mentioned that in its closing footnote. It now warns and offers "Garrison now", reading the town's
// state live when it shows (it can show minutes after the capture) and again on the press.
import { NEW_PLAYER_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadedAutoSettleState } from "../client-auto-settle-prompt/client-auto-settle-prefs.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { showTownCaptureOverlay, type TownCaptureInfo } from "./client-town-capture.js";
import { installTownCaptureGarrison, resetTownCaptureGarrisonForTest } from "./client-town-capture-garrison.js";

const town = { name: "Quartzcrown", type: "FARMING", populationTier: "TOWN", population: 23_791 } as NonNullable<Tile["town"]>;
const tile = (extra: Partial<Tile> = {}): Tile => ({ x: 481, y: 75, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", town, ...extra } as Tile);
const info = (extra: Partial<TownCaptureInfo> = {}): TownCaptureInfo => ({
  x: 481, y: 75, townName: "Quartzcrown", populationTier: "TOWN", terrainProfile: "GRASS", coastal: true,
  population: 23_791, maxPopulation: 100_000, empireName: "House Me", ownedTownCount: 1, destroyed: false, onJumpToTown: () => undefined,
  ...extra
});

const install = (t: Tile, opts: { towns?: boolean; queued?: boolean } = {}) => {
  const state = {
    me: "me",
    tiles: new Map([["481,75", t]]),
    autoSettle: loadedAutoSettleState({ ...NEW_PLAYER_AUTO_SETTLE_PREFS, answered: true, towns: opts.towns ?? false }),
    developmentQueue: opts.queued ? [{ kind: "SETTLE", tileKey: "481,75" }] : [],
    settleProgressByTile: new Map(),
    autoSettleTargets: new Set<string>()
  } as unknown as ClientState;
  const garrisonSelected = vi.fn();
  installTownCaptureGarrison(state, garrisonSelected);
  return { state, garrisonSelected };
};
const el = (id: string) => document.getElementById(id);

describe("town capture card garrison prompt", () => {
  afterEach(() => {
    el("town-capture-overlay")?.remove();
    resetTownCaptureGarrisonForTest();
  });

  it("warns and garrisons the town after selecting it, then closes", () => {
    const { state, garrisonSelected } = install(tile());
    const select = vi.fn(() => { state.selected = { x: 481, y: 75 }; });
    showTownCaptureOverlay(info({ onJumpToTown: select }));
    expect(el("town-capture-garrison-warning")?.textContent).toContain("No coin or manpower until you garrison it.");
    el("town-capture-garrison")?.click();
    expect(select).toHaveBeenCalledOnce();
    expect(garrisonSelected).toHaveBeenCalledOnce();
    expect(select.mock.invocationCallOrder[0]).toBeLessThan(garrisonSelected.mock.invocationCallOrder[0]!);
    expect(el("town-capture-overlay")).toBeNull();
  });

  // Playtest 2026-11-25: Garrison now / Jump to Town were one-off rounded buttons in the system sans.
  it("draws Garrison now and Jump to Town with the shared HUD button classes", () => {
    install(tile());
    showTownCaptureOverlay(info());
    expect(Array.from(el("town-capture-garrison")!.classList)).toEqual(expect.arrayContaining(["v2s-btn", "v2s-btn-primary"]));
    expect(el("town-capture-jump")!.classList.contains("v2s-btn")).toBe(true);
    expect(el("town-capture-jump")!.classList.contains("v2s-btn-primary")).toBe(false);
  });

  it("keeps the button with auto-garrison on, which still waits on coin and manpower", () => {
    install(tile(), { towns: true });
    showTownCaptureOverlay(info());
    expect(el("town-capture-garrison")).not.toBeNull();
    expect(el("town-capture-garrison-warning")?.textContent).toContain("Auto-garrison picks it up");
  });

  it("only jumps when the town got garrisoned between the card showing and the press", () => {
    const { state, garrisonSelected } = install(tile());
    const jump = vi.fn();
    showTownCaptureOverlay(info({ onJumpToTown: jump }));
    state.tiles.set("481,75", tile({ ownershipState: "SETTLED" }));
    el("town-capture-garrison")?.click();
    expect(garrisonSelected).not.toHaveBeenCalled();
    expect(jump).toHaveBeenCalledOnce();
  });

  it("shows no prompt for a town already garrisoned, one with a garrison queued, or a razed settlement", () => {
    install(tile({ ownershipState: "SETTLED" }));
    showTownCaptureOverlay(info());
    expect(el("town-capture-garrison")).toBeNull();
    expect(el("town-capture-note")?.textContent).not.toContain("once the town is garrisoned");
    el("town-capture-close")?.click();

    install(tile(), { queued: true });
    showTownCaptureOverlay(info());
    expect(el("town-capture-garrison")).toBeNull();
    expect(el("town-capture-note")?.textContent).toContain("Garrison on its way");
    el("town-capture-close")?.click();

    install(tile());
    showTownCaptureOverlay(info({ destroyed: true, populationTier: "SETTLEMENT" }));
    expect(el("town-capture-garrison")).toBeNull();
    expect(el("town-capture-garrison-warning")).toBeNull();
  });
});
