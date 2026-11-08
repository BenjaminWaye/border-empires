import { describe, expect, it, vi } from "vitest";
import { createFullVisibilitySource } from "./full-visibility-source.js";
import { buildMapOverviewTiles } from "./map-overview-tiles.js";
import { buildPlayerSubscriptionSnapshot } from "../player-snapshot/player-snapshot.js";
import { buildWorldStatusSnapshot } from "../world-status-snapshot/world-status-snapshot.js";
import type { SimulationRuntime } from "../runtime/runtime.js";

type State = ReturnType<SimulationRuntime["exportState"]>;
const player = (id: string): State["players"][number] => ({
  id, points: 12, manpower: 10, techIds: [], domainIds: [], strategicResources: {},
  allies: [], vision: 1, visionRadiusBonus: 0, territoryTileKeys: []
});
const world = (): State => ({
  tiles: [
    { x: 1, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", resource: "FISH" },
    { x: 2, y: 1, terrain: "LAND", ownerId: "p2", ownershipState: "SETTLED", resource: "TITANIUM" },
    { x: 3, y: 1, terrain: "SEA" }
  ],
  players: [player("p1"), player("p2")], activeLocks: [], pendingSettlements: []
});
const setup = () => {
  const exportState = vi.fn(async () => world());
  const source = createFullVisibilitySource({ exportState, yieldToEventLoop: async () => {} });
  return { source, exportState };
};

describe("shared revealed-map overview", () => {
  it("exports one ended world across concurrent and sequential player logins", async () => {
    const { source, exportState } = setup();
    const [first, second] = await Promise.all([source.get(true), source.get(true)]);
    expect(first).toBe(second);
    expect(await source.get(true)).toBe(first);
    expect(exportState).toHaveBeenCalledTimes(1);
    for (const id of ["p1", "p2", "new-spectator"]) {
      expect(first.worldStatusForPlayer(id)).toEqual(buildWorldStatusSnapshot(id, first.runtimeState));
    }
  });

  it("refreshes live worlds, retries failed preparation, and discards a prior season", async () => {
    const { source, exportState } = setup();
    const first = await source.get(false);
    expect(await source.get(false)).not.toBe(first);
    source.invalidate();
    exportState.mockRejectedValueOnce(new Error("export failed"));
    await expect(source.get(true)).rejects.toThrow("export failed");
    const recovered = await source.get(true);
    source.invalidate();
    expect(await source.get(true)).not.toBe(recovered);
  });

  it("does not let an invalidated in-flight export replace a new season", async () => {
    const { source, exportState } = setup();
    let complete!: (state: State) => void;
    exportState.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const old = source.get(true);
    source.invalidate();
    const next = await source.get(true);
    complete(world());
    await old;
    expect(await source.get(true)).toBe(next);
  });

  it("keeps the whole world visible while deriving personal economy from the player's visible export", async () => {
    const { source } = setup();
    const full = await source.get(true);
    const visible: State = { ...world(), tiles: world().tiles.slice(0, 1) };
    const ordinary = buildPlayerSubscriptionSnapshot("p1", visible, { tilesAlreadyVisible: true, includeWorldStatus: false });
    const revealed = buildPlayerSubscriptionSnapshot("p1", visible, {
      fullVisibility: true, sharedFullVisibilityTiles: full.tiles,
      worldStatusSnapshot: full.worldStatusForPlayer("p1")
    });
    expect(revealed.player).toEqual(ordinary.player);
    expect(revealed.tiles).toBe(full.tiles);
    expect(revealed.tiles).toHaveLength(3);
    expect(revealed.worldStatus).toEqual(buildWorldStatusSnapshot("p1", full.runtimeState));
  });

  it("keeps live admin reveals fully detailed for combat-preview consumers", async () => {
    const state = world();
    const fortJson = '{"ownerId":"p1","variant":"PALISADE","status":"active"}';
    state.tiles[0]!.fortJson = fortJson;
    const source = createFullVisibilitySource({ exportState: async () => state, yieldToEventLoop: async () => {} });
    expect((await source.get(false)).tiles[0]?.fortJson).toBe(fortJson);
    expect((await source.get(true)).tiles[0]).not.toHaveProperty("fortJson");
  });

  it("preserves minimap landmarks, town identity and territory without town economy detail", () => {
    const tile: State["tiles"][number] = {
      x: 2, y: 3, terrain: "LAND", ownerId: "p1", reachOwnerId: "p2", ownershipState: "SETTLED",
      townType: "MARKET", townName: "Harbour", townPopulationTier: "CITY", dockId: "dock-1",
      watchtowerJson: '{"activated":true}', waystationJson: '{"activated":false}',
      naturalWonderJson: '{"relicVersion":1}', townJson: '{"goldPerMinute":999}'
    };
    const overview = buildMapOverviewTiles([tile])[0];
    const landmarks = { ...tile };
    delete landmarks.townJson;
    expect(overview).toEqual(landmarks);
    expect(overview).not.toHaveProperty("townJson");
  });

  it("does not read or enrich offscreen town, structure, or yield detail in a 640x320 overview", () => {
    let detailReads = 0;
    const tiles: State["tiles"] = Array.from({ length: 640 * 320 }, (_, i) => ({
      x: i % 640, y: Math.floor(i / 640), terrain: "LAND",
      get townJson() { detailReads += 1; throw new Error("offscreen town economy read"); },
      get economicStructureJson() { detailReads += 1; throw new Error("offscreen structure read"); },
      get yieldRate() { detailReads += 1; throw new Error("offscreen yield read"); }
    }));
    const overview = buildMapOverviewTiles(tiles);
    expect(overview).toHaveLength(204800);
    expect(detailReads).toBe(0);
    expect(overview[0]).toEqual({ x: 0, y: 0, terrain: "LAND" });
    // The snapshot cache uses binary search ordered by x, then y.
    expect(overview[1]).toEqual({ x: 0, y: 1, terrain: "LAND" });
    expect(overview[320]).toEqual({ x: 1, y: 0, terrain: "LAND" });
    expect(overview.at(-1)).toEqual({ x: 639, y: 319, terrain: "LAND" });
  });
});
