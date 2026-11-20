import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { applySimulationEventsToRecoveredState, type RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { buildWorldgenBaselineIndex, compactSnapshotForStorage, expandSnapshotFromStorage } from "../snapshot-compaction/snapshot-compaction.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { SpawnPlacementIndex } from "./spawn-placement-index.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

// Worldgen posts a Planetary Defense patrol 20 tiles out from each starting
// site in its roster. Live spawns used to recompute the roster from live
// tiles instead, and that recompute shifts once anything is owned, so about
// half the sites players actually landed on had no patrol nearby. The worldgen
// roster is now saved with the season and live spawns claim from it.
const fairSpawnSites = [{ x: 40, y: 60 }, { x: 120, y: 200 }];
const baselineTiles: RecoveredSimulationState["tiles"] = [{ x: 0, y: 0, terrain: "LAND" }];

describe("fair spawn roster persistence", () => {
  it("survives snapshot compaction and expansion", async () => {
    const compact = await compactSnapshotForStorage(
      { initialState: { tiles: [...baselineTiles], activeLocks: [], fairSpawnSites }, commandEvents: [] },
      buildWorldgenBaselineIndex(baselineTiles)
    );
    const expanded = expandSnapshotFromStorage(JSON.parse(JSON.stringify(compact)), baselineTiles);
    expect(expanded.initialState.fairSpawnSites).toEqual(fairSpawnSites);
  });

  it("survives event-recovery replay", () => {
    const recovered = applySimulationEventsToRecoveredState({ tiles: [...baselineTiles], activeLocks: [], fairSpawnSites }, []);
    expect(recovered.fairSpawnSites).toEqual(fairSpawnSites);
  });

  it("makes the spawn index use the saved roster instead of recomputing one", () => {
    const tiles = new Map<string, DomainTileState>([["0,0", { x: 0, y: 0, terrain: "LAND" }]]);
    const index = new SpawnPlacementIndex();
    index.restoreFairSpawnSites(fairSpawnSites);
    expect(index.fairSpawnSites(tiles)).toEqual(fairSpawnSites);
    expect(index.persistedFairSpawnSites()).toEqual(fairSpawnSites);
  });

  it("keeps the lazy recompute, and saves nothing, for a season without a saved roster", () => {
    const tiles = new Map<string, DomainTileState>([["0,0", { x: 0, y: 0, terrain: "LAND" }]]);
    const index = new SpawnPlacementIndex();
    index.restoreFairSpawnSites(undefined);
    expect(index.fairSpawnSites(tiles)).toEqual([]);
    expect(index.persistedFairSpawnSites()).toBeUndefined();
  });

  it("carries the roster through a runtime restart", () => {
    const buildRuntime = (initialState: RecoveredSimulationState) =>
      new SimulationRuntime({ now: () => 1_000, initialPlayers: new Map([["p1", buildPlayer("p1")]]), initialState });
    const first = buildRuntime({ tiles: [...baselineTiles], activeLocks: [], fairSpawnSites });
    const saved = first.exportSnapshotSections().initialState;
    expect(saved.fairSpawnSites).toEqual(fairSpawnSites);
    const restarted = buildRuntime({ ...saved, tiles: [...baselineTiles], activeLocks: [] });
    expect(restarted.exportSnapshotSections().initialState.fairSpawnSites).toEqual(fairSpawnSites);
  });

  it("lands a joining player on the saved roster site, not the site a live recompute would pick", () => {
    // 60x60 of land with towns and farms every 20 tiles: several qualified sites.
    const tiles: RecoveredSimulationState["tiles"] = [];
    for (let y = 0; y < 60; y += 1) for (let x = 0; x < 60; x += 1) tiles.push({ x, y, terrain: "LAND" });
    const byKey = new Map(tiles.map((tile) => [simulationTileKey(tile.x, tile.y), tile]));
    for (let y = 10; y < 60; y += 20) for (let x = 10; x < 60; x += 20) {
      byKey.get(simulationTileKey(x, y))!.town = { type: "MARKET", populationTier: "TOWN" } as RecoveredSimulationState["tiles"][number]["town"];
      for (let dx = 1; dx <= 4; dx += 1) byKey.get(simulationTileKey(x + dx, y))!.resource = "FARM";
    }
    const live = new SpawnPlacementIndex().fairSpawnSites(new Map([...byKey].map(([k, t]) => [k, t as DomainTileState])));
    expect(live.length).toBeGreaterThan(1);
    // The live recompute's first pick is live[0] on an empty map; save a different one.
    const saved = live[live.length - 1]!;
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["joiner", buildPlayer("joiner")]]),
      initialState: { tiles, activeLocks: [], fairSpawnSites: [saved] }
    });
    expect(runtime.ensurePlayerHasSpawnTerritory("joiner")).toBe(true);
    const owned = runtime.exportSnapshotSections().initialState.tiles.filter((tile) => tile.ownerId === "joiner");
    expect(owned.some((tile) => tile.x === saved.x && tile.y === saved.y)).toBe(true);
  });

  it("writes no roster for a legacy season", () => {
    const runtime = new SimulationRuntime({ now: () => 1_000, initialPlayers: new Map([["p1", buildPlayer("p1")]]), initialState: { tiles: [...baselineTiles], activeLocks: [] } });
    expect(runtime.exportSnapshotSections().initialState.fairSpawnSites).toBeUndefined();
  });
});
