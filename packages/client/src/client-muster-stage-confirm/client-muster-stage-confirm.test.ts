import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchMusterTileAction } from "../client-muster-tile-actions.js";
import { createInitialState } from "../client-state/client-state.js";
import type { BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import type { Tile } from "../client-types.js";

const stubWindowStorage = (): void => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  });
};

const ownTile = (overrides: Partial<Tile> = {}): Tile => ({ x: 3, y: 3, terrain: "LAND", ownerId: "me", ...overrides });

const setup = () => {
  stubWindowStorage();
  const state = createInitialState();
  state.me = "me";
  state.authEmail = "player@example.test";
  state.manpowerCap = 1_000;
  const sendGameMessage = vi.fn(() => true);
  const sheets: BreakPactSheetOptions[] = [];
  const deps = { state, sendGameMessage, pushFeed: vi.fn(), renderHud: vi.fn(), showStageMusterSheet: (options: BreakPactSheetOptions) => { sheets.push(options); return true; } };
  return { sendGameMessage, sheets, deps };
};

afterEach(() => vi.unstubAllGlobals());

// Playtest 2026-11-12 (pt-optimiser): tapping "Stage Muster" to learn what it
// was staged a flag straight away; its description only lived in a tooltip.
describe("Stage Muster first-time confirm", () => {
  it("explains and waits for confirmation the first time a flag is staged", () => {
    const { sendGameMessage, sheets, deps } = setup();
    dispatchMusterTileAction("muster_hold", ownTile(), deps);
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.consequences[0]).toContain("150 manpower");
    expect(sheets[0]!.consequences.join(" ")).toContain("Clear Muster returns it");
    sheets[0]!.onConfirm();
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_MUSTER", x: 3, y: 3, mode: "HOLD" });
  });

  it("sends nothing when the explainer is dismissed, and asks again next time", () => {
    const { sendGameMessage, sheets, deps } = setup();
    dispatchMusterTileAction("muster_hold", ownTile(), deps);
    dispatchMusterTileAction("muster_hold", ownTile(), deps);
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(sheets).toHaveLength(2);
  });

  it("stages at once after the player has confirmed once", () => {
    const { sendGameMessage, sheets, deps } = setup();
    dispatchMusterTileAction("muster_hold", ownTile(), deps);
    sheets[0]!.onConfirm();
    dispatchMusterTileAction("muster_hold", ownTile({ x: 4 }), deps);
    expect(sheets).toHaveLength(1);
    expect(sendGameMessage).toHaveBeenLastCalledWith({ type: "SET_MUSTER", x: 4, y: 3, mode: "HOLD" });
  });

  it("keeps Set Hold on an existing flag instant", () => {
    const { sendGameMessage, sheets, deps } = setup();
    dispatchMusterTileAction("muster_hold", ownTile({ muster: { mode: "ADVANCE", amount: 10 } as NonNullable<Tile["muster"]> }), deps);
    expect(sheets).toHaveLength(0);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_MUSTER", x: 3, y: 3, mode: "HOLD" });
  });

  it("stages anyway when no sheet can be shown", () => {
    const { sendGameMessage, deps } = setup();
    dispatchMusterTileAction("muster_hold", ownTile(), { ...deps, showStageMusterSheet: () => false });
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_MUSTER", x: 3, y: 3, mode: "HOLD" });
  });
});
