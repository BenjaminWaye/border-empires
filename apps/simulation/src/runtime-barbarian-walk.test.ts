import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { BARBARIAN_MULTIPLY_THRESHOLD, MAX_BARBARIAN_TILES } from "@border-empires/shared";
import { applyBarbarianWalkOrMultiply, type BarbarianWalkContext } from "./runtime-barbarian-walk.js";
import type { LockRecord } from "./runtime-types.js";

const lock = {
  commandId: "c1",
  playerId: "barbarian-1",
  actionType: "ATTACK",
  manpowerCost: 0,
  originX: 1,
  originY: 1,
  targetX: 2,
  targetY: 1,
  originKey: "1,1",
  targetKey: "2,1",
  resolvesAt: 0,
  source: "player"
} as unknown as LockRecord;

const setup = (barbTileCount: number) => {
  const events: SimulationEvent[] = [];
  const progress = new Map<string, number>([["1,1", BARBARIAN_MULTIPLY_THRESHOLD - 1]]);
  const tiles = new Map<string, DomainTileState>([["1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }]]);
  const ctx: BarbarianWalkContext = {
    barbarianTileProgress: progress,
    tiles,
    summaryForPlayer: () => ({ territoryTileKeys: new Set(Array.from({ length: barbTileCount }, (_, i) => `k${i}`)) }) as ReturnType<BarbarianWalkContext["summaryForPlayer"]>,
    emitEvent: (event) => events.push(event),
    replaceTileState: (key, tile) => {
      tiles.set(key, tile);
    },
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as ReturnType<BarbarianWalkContext["tileDeltaFromState"]>
  };
  // The barbarian wins against a player's tile worth 1 progress.
  const previousTarget: DomainTileState = { x: 2, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" };
  applyBarbarianWalkOrMultiply(ctx, lock, previousTarget);
  return { events, progress, tiles };
};

describe("applyBarbarianWalkOrMultiply territory cap", () => {
  it("multiplies (keeps the source tile) once progress reaches the threshold and there is room", () => {
    const { events, tiles } = setup(MAX_BARBARIAN_TILES - 1);
    expect(events.map((e) => e.eventType)).toContain("BARB_MULTIPLIED");
    expect(tiles.get("1,1")?.ownerId).toBe("barbarian-1");
  });

  it("walks instead at the cap: the origin is released and the progress is kept for later", () => {
    const { events, progress, tiles } = setup(MAX_BARBARIAN_TILES);
    expect(events.map((e) => e.eventType)).not.toContain("BARB_MULTIPLIED");
    const ate = events.find((e) => e.eventType === "BARB_ATE_TILE");
    expect(ate).toMatchObject({ capBlocked: true, newProgress: BARBARIAN_MULTIPLY_THRESHOLD });
    expect(tiles.get("1,1")?.ownerId).toBeUndefined();
    expect(progress.get("2,1")).toBe(BARBARIAN_MULTIPLY_THRESHOLD);
    expect(progress.has("1,1")).toBe(false);
  });
});
