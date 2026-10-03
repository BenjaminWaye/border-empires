import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

const runtimeWithOpenLand = (openLand: Array<{ x: number; y: number }>) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["inviter", buildPlayer("inviter")]]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "inviter", ownershipState: "SETTLED" },
        ...openLand.map((tile) => ({ ...tile, terrain: "LAND" as const }))
      ],
      activeLocks: []
    }
  });

describe("rally spawn outcome", () => {
  it("reports a spawn beside the inviter as within the rally radius", () => {
    const runtime = runtimeWithOpenLand([{ x: 11, y: 10 }]);
    const onRallySpawnPlaced = vi.fn();

    expect(runtime.ensurePlayerHasSpawnTerritory("friend", { x: 10, y: 10 }, onRallySpawnPlaced)).toBe(true);

    expect(onRallySpawnPlaced).toHaveBeenCalledWith({ spawn: { x: 11, y: 10 }, distance: 1, withinRadius: true });
  });

  it("reports a spawn as outside the rally radius when the only open land is far from the inviter", () => {
    const runtime = runtimeWithOpenLand([{ x: 100, y: 100 }]);
    const onRallySpawnPlaced = vi.fn();

    expect(runtime.ensurePlayerHasSpawnTerritory("friend", { x: 10, y: 10 }, onRallySpawnPlaced)).toBe(true);

    expect(onRallySpawnPlaced).toHaveBeenCalledWith({ spawn: { x: 100, y: 100 }, distance: 90, withinRadius: false });
  });

  // ensurePlayerHasSpawnTerritory claims the nearest fair spawn site BEFORE the rally-radius search, and a fair
  // site must be >= 50 tiles from every settled tile (FAIR_SPAWN_SITE_MIN_SETTLED_DISTANCE) -- so while any site
  // remains, a rally spawn lands >= 50 tiles from the inviter even with open land right beside them. Found while
  // adding the fallback counter; fixing it is a gameplay decision, so it is left as a todo.
  it.todo("prefers open land within the rally radius over a distant fair spawn site");

  it("does not report anything for an ordinary spawn or when the player already has territory", () => {
    const onRallySpawnPlaced = vi.fn();
    runtimeWithOpenLand([{ x: 11, y: 10 }]).ensurePlayerHasSpawnTerritory("friend", undefined, onRallySpawnPlaced);
    runtimeWithOpenLand([{ x: 11, y: 10 }]).ensurePlayerHasSpawnTerritory("inviter", { x: 10, y: 10 }, onRallySpawnPlaced);
    expect(onRallySpawnPlaced).not.toHaveBeenCalled();
  });
});
