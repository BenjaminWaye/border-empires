import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { handleTileDeltaBatchMessage, type TileDeltaBatchHandlerDeps } from "./client-tile-delta-batch-handler.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const makeDeps = (state: ReturnType<typeof createInitialState>): TileDeltaBatchHandlerDeps => ({
  state,
  keyFor,
  mergeIncomingTileDetail: (existing, incoming) => ({ ...existing, ...incoming }),
  mergeServerTileWithOptimisticState: (tile) => tile,
  clearRenderCaches: vi.fn(),
  buildMiniMapBase: vi.fn(),
  frontierQueueDebug: vi.fn(),
  clearLateFrontierAck: vi.fn(),
  currentActionCanResolveFromFrontierOwnership: () => false,
  currentActionCanResolveFromPostCombatTileSync: () => false,
  resolveFrontierCapture: vi.fn(),
  openSingleTileActionMenu: vi.fn(),
  renderHud: vi.fn(),
  requestViewRefresh: vi.fn(),
  pushFeed: vi.fn()
});

type Tier = NonNullable<Tile["townPopulationTier"]>;
const townSummary = (populationTier: Tier) => ({ name: "Ravenford", type: "FARMING", populationTier, population: 120_000, maxPopulation: 1_000_000 });
const ownedTown = (ownerId: string, populationTier: Tier): Tile =>
  ({ x: 4, y: 5, terrain: "LAND", ownerId, ownershipState: "SETTLED", townPopulationTier: populationTier, townType: "FARMING", townName: "Ravenford", town: townSummary(populationTier) }) as unknown as Tile;
// The server ships a tier change as a full town payload (townJson).
const tierDelta = (populationTier: Tier) => ({ x: 4, y: 5, ownerId: "p1", ownershipState: "SETTLED", townJson: JSON.stringify(townSummary(populationTier)) });

describe("handleTileDeltaBatchMessage town tier upgrade", () => {
  it("starts the growth transition for both renderers and announces it when the viewer's town reaches a new tier", () => {
    const state = createInitialState();
    state.me = "p1";
    state.tiles.set("4,5", ownedTown("p1", "TOWN"));
    const deps = makeDeps(state);
    handleTileDeltaBatchMessage({ tiles: [tierDelta("CITY")] }, deps);
    expect(state.townTierUpgradeFxQueue.map((entry) => entry.tier)).toEqual(["CITY"]);
    expect(state.townTierUpgradeFxByKey.get("4,5")).toMatchObject({ fromTier: "TOWN", tier: "CITY" });
    expect(deps.pushFeed).toHaveBeenCalledWith("Ravenford has grown into a City!", "info", "success");
  });

  it("does not celebrate a town whose tier did not change, or a first sighting", () => {
    const state = createInitialState();
    state.me = "p1";
    state.tiles.set("4,5", ownedTown("p1", "CITY"));
    handleTileDeltaBatchMessage({ tiles: [tierDelta("CITY")] }, makeDeps(state));
    handleTileDeltaBatchMessage({ tiles: [{ ...tierDelta("GREAT_CITY"), x: 9, y: 9 }] }, makeDeps(state));
    expect(state.townTierUpgradeFxQueue).toEqual([]);
    expect(state.townTierUpgradeFxByKey.size).toBe(0);
  });
});
