import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { collectBattleRenderEntries } from "../client-map-3d-capture-overlays.js";
import { registerActiveBattleFromTileDelta } from "../client-battle-overlay/client-battle-overlay.js";
import { drawDockLandings2D } from "./client-dock-landing-2d.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const NOW = 10_000;
function fixture() {
  const state = createInitialState(); state.me = "attacker";
  state.dockPairs = [{ ax: 1, ay: 1, bx: 5, by: 1, route: [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }] }];
  state.tiles.set("1,1", { x: 1, y: 1, terrain: "LAND", dockId: "a", ownerId: "attacker" });
  state.tiles.set("5,1", { x: 5, y: 1, terrain: "LAND", dockId: "b", ownerId: "defender" });
  for (const x of [2, 3, 4]) state.tiles.set(`${x},1`, { x, y: 1, terrain: "SEA" });
  state.capture = { startAt: NOW, resolvesAt: Date.now() + 30_000, target: { x: 5, y: 1 }, origin: { x: 1, y: 1 }, actionType: "ATTACK" };
  return state;
}
const collect = (state: ReturnType<typeof fixture>, nowMs: number) =>
  collectBattleRenderEntries(state, keyFor, () => "#0088ff", () => 0, 0, 0, nowMs);

afterEach(() => vi.restoreAllMocks());

describe("dock carrier battle lifecycle in both renderers", () => {
  it("keeps the same beached carrier when the skirmish becomes a resolved battle", () => {
    const state = fixture(); const before = collect(state, NOW).skirmishes[0]!;
    expect(before.landing?.startAt).toBe(NOW);
    state.capture = undefined;
    registerActiveBattleFromTileDelta(state, keyFor, { x: 5, y: 1, combatJson: JSON.stringify({
      attackerOwnerId: "attacker", defenderOwnerId: "defender", attackerWon: true, originX: 1, originY: 1
    }) }, NOW + 8000);
    const after = collect(state, NOW + 8000).entries[0]!;
    expect(after.landing).toEqual(before.landing);
    expect(after.srcWorldX).toBe(before.srcWorldX);
    expect(collect(state, NOW + 20_000).entries).toHaveLength(0);
  });
  it("shows the carrier to the defender from the incoming attack alert", () => {
    const state = fixture(); state.me = "defender"; state.capture = undefined;
    state.incomingAttacksByTile.set("5,1", { attackerName: "Attacker", attackerId: "attacker", fromX: 1, fromY: 1, resolvesAt: Date.now() + 30_000 });
    expect(collect(state, NOW).skirmishes[0]!.landing).toBeDefined();
  });
  it("draws a boat and disembarking infantry in the canvas fallback, then clears after the battle", () => {
    const state = fixture();
    const ctx = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
      fillRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    const draw = (nowMs: number): void => drawDockLandings2D(state, keyFor, (x, y) => ({ sx: x * 40, sy: y * 40 }), ctx, () => "#0088ff", 40, 10, 10, nowMs);
    draw(NOW); vi.mocked(ctx.arc).mockClear();
    draw(NOW + 2300);
    expect(ctx.fillRect).toHaveBeenCalled(); expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.translate).toHaveBeenCalledWith(200, 40);
    state.capture = undefined; vi.mocked(ctx.fillRect).mockClear(); draw(NOW + 5000);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
