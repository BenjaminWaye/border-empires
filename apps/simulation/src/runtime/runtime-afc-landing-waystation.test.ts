import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// Regression for "waystations revealed on spawn ruin the spawn sequence": the
// landing AFC's reach auto-claims its disk, and claiming a waystation tile
// activates it -- a free reward whose popup covered the landing. Waystations
// the landing would claim are now removed instead of granted.
const buildWorld = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 0; y <= 20; y += 1) {
    for (let x = 0; x <= 24; x += 1) tiles.push({ x, y, terrain: "LAND", waystation: { activated: false } });
  }
  return tiles;
};

const land = (player = buildPlayer("newcomer")) => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["newcomer", player]]),
    seedTiles: new Map(),
    initialState: { tiles: buildWorld(), activeLocks: [] }
  });
  const events = collectEvents(runtime);
  expect(runtime.ensurePlayerHasSpawnTerritory("newcomer")).toBe(true);
  const tiles = runtime.exportState().tiles;
  const afc = tiles.find((tile) => tile.afcJson !== undefined && tile.ownerId === "newcomer")!;
  const owned = tiles.filter((tile) => tile.ownerId === "newcomer");
  return { tiles, afc, owned, events };
};

const isActivated = (json: string | undefined): boolean => json !== undefined && (JSON.parse(json) as { activated?: boolean }).activated === true;

describe("AFC landing next to waystations", () => {
  it("removes the waystations the landing claims instead of activating them", () => {
    const { tiles, afc, owned } = land();
    expect(afc).toBeDefined();
    expect(owned.length).toBeGreaterThan(1);
    expect(owned.filter((tile) => tile.waystationJson !== undefined).map((tile) => `${tile.x},${tile.y}`)).toEqual([]);
    expect(tiles.filter((tile) => isActivated(tile.waystationJson))).toEqual([]);
    // Ground outside the disk keeps its waystation for normal expansion.
    expect(tiles.some((tile) => tile.ownerId === undefined && tile.waystationJson !== undefined)).toBe(true);
  });

  it("covers a Dominion III landing's radius-4 reach", () => {
    const { tiles, afc, owned } = land(buildPlayer("newcomer", { domainIds: new Set<string>(["afc-dominion-3"]) }));
    expect(owned.some((tile) => Math.max(Math.abs(tile.x - afc.x), Math.abs(tile.y - afc.y)) === 4)).toBe(true);
    expect(tiles.filter((tile) => isActivated(tile.waystationJson))).toEqual([]);
  });

  it("never sends a stale unowned delta for a claimed tile after its claim", () => {
    const { owned, events } = land();
    const lastDeltaByKey = new Map<string, Record<string, unknown>>();
    for (const event of events as SimulationEvent[]) {
      if (event.eventType !== "TILE_DELTA_BATCH") continue;
      for (const delta of event.tileDeltas as unknown as Array<Record<string, unknown> & { x: number; y: number }>) {
        lastDeltaByKey.set(`${delta.x},${delta.y}`, delta);
      }
    }
    const clearedAfterClaim = owned
      .map((tile) => `${tile.x},${tile.y}`)
      .filter((key) => {
        const delta = lastDeltaByKey.get(key);
        return delta !== undefined && "ownerId" in delta && delta.ownerId !== "newcomer";
      });
    expect(clearedAfterClaim).toEqual([]);
  });
});
