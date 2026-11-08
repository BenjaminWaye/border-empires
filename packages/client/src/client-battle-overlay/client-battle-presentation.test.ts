import { describe, expect, it, vi } from "vitest";
import { battleClashMs, type BattlePresentation } from "@border-empires/shared";
import { registerActiveBattleFromTileDelta, type ActiveBattleOverlay } from "./client-battle-overlay.js";
import { battleMarkerEntry, drawBattleMarkers2D } from "./client-battle-overlay-2d.js";
import { ROUT_MS } from "../client-map-3d-popup-marine/popup-marine-timeline.js";

const makeState = () => ({ activeBattles: new Map<string, ActiveBattleOverlay>(), skirmishSeenAt: new Map<string, number>(), squadGearByOwner: new Map() });
const register = (presentation: unknown, seenAt?: number) => {
  const state = makeState();
  if (seenAt !== undefined) state.skirmishSeenAt.set("5,6", seenAt);
  registerActiveBattleFromTileDelta(state, (x, y) => `${x},${y}`, { x: 5, y: 6,
    combatJson: JSON.stringify({ attackerOwnerId: "a", defenderOwnerId: "b", attackerWon: true, originX: 4, originY: 6, presentation }) }, 1000);
  return state;
};
describe("battle category delivery and 2D parity", () => {
  it.each(["decisive", "contested", "last-stand", "comeback"] as const)("retains %s and its complete FX lifetime", (presentation: BattlePresentation) => {
    const state = register(presentation);
    const battle = state.activeBattles.get("5,6")!;
    expect(battle.presentation).toBe(presentation);
    expect(battle.endAt).toBe(1000 + battleClashMs(presentation) + ROUT_MS);
    expect(battleMarkerEntry(battle, "red", "blue").presentation).toBe(presentation);
  });
  it("retains a prior casualty only after this viewer's skirmish actually completed its first exchange", () => {
    expect(register("comeback", -5000).activeBattles.get("5,6")!.skirmishCasualties).toBe(true);
    expect(register("comeback", 500).activeBattles.get("5,6")!.skirmishCasualties).toBe(false);
    expect(register("comeback").activeBattles.get("5,6")!.skirmishCasualties).toBe(false);
  });
  it.each([undefined, "invalid", {}, 0])("falls back safely for old or malformed categories: %s", (value) => {
    const battle = register(value).activeBattles.get("5,6")!;
    expect(battle.presentation).toBeUndefined();
    expect(battle.endAt).toBe(1000 + 1300 + ROUT_MS);
  });
  it("draws visible fights, respects fog, and expires battles on the 2D path", () => {
    const state = { ...register("comeback"), playerColors: new Map<string, string>() };
    const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn() };
    const projection = { size: 100, project: () => ({ sx: 50, sy: 50 }) };
    const draw = (vis: string, now: number) => drawBattleMarkers2D(ctx as unknown as CanvasRenderingContext2D, state, [{ px: 0, py: 0, wk: "5,6", vis }], projection, now);
    draw("fogged", 1100); expect(ctx.arc).not.toHaveBeenCalled();
    draw("visible", 1100); expect(ctx.arc).toHaveBeenCalledTimes(14);
    draw("visible", 10000); expect(state.activeBattles.size).toBe(0);
  });
});


it("shows only one fully visible winner in the 2D comeback ending", () => {
  const state = { ...register("comeback"), playerColors: new Map<string, string>() };
  let standing = 0;
  const ctx = { globalAlpha: 1, save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn() };
  ctx.arc.mockImplementation(() => { if (ctx.globalAlpha === 1) standing += 1; });
  drawBattleMarkers2D(ctx as unknown as CanvasRenderingContext2D, state,
    [{ px: 0, py: 0, wk: "5,6", vis: "visible" }], { size: 100, project: () => ({ sx: 50, sy: 50 }) }, 6000);
  expect(standing).toBe(1);
});


it.each([false, true])("draws unresolved 2D squads with unopposed=%s", (unopposed) => {
  const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn() };
  const entry = { srcWorldX: -1, srcWorldZ: 0, tgtWorldX: 0, tgtWorldZ: 0,
    srcSurfaceY: 0, tgtSurfaceY: 0, attackerColor: "red", defenderColor: "blue", startAt: 0, hashSeed: 123, unopposed, choreography: "crossfire" as const };
  drawBattleMarkers2D(ctx as unknown as CanvasRenderingContext2D,
    { activeBattles: new Map(), playerColors: new Map() }, [{ px: 0, py: 0, wk: "0,0", vis: "visible" }],
    { size: 100, project: () => ({ sx: 50, sy: 50 }) }, 1000, new Map([["0,0", entry]]));
  expect(ctx.arc).toHaveBeenCalledTimes(unopposed ? 7 : 14);
});
