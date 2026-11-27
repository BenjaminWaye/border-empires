import { describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { CurrentSeasonSummary } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { handleGetCurrentSeasonSummary } from "../season-summary-rpc-handlers.js";
import { LANDING_SITE_PROBE_TTL_MS, landingSiteAvailable } from "./landing-site-probe.js";

const world = (crowded: boolean): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  const [from, to] = crowded ? [7, 13] : [0, 39];
  for (let y = from; y <= to; y += 1) {
    for (let x = crowded ? 8 : 0; x <= (crowded ? 16 : 39); x += 1) {
      const isTown = crowded && y === 10 && (x === 10 || x === 14);
      tiles.push(isTown
        ? { x, y, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", town: { name: `Rival ${x}`, type: "FARMING", populationTier: "TOWN" } }
        : { x, y, terrain: "LAND" });
    }
  }
  return tiles;
};
const runtimeFor = (crowded: boolean) => new SimulationRuntime({
  now: () => 1_000,
  initialPlayers: new Map([["rival", buildPlayer("rival")]]),
  seedTiles: new Map(),
  initialState: { tiles: world(crowded), activeLocks: [] }
});

describe("landingSiteAvailable", () => {
  it("reads false on a map with no viable site and true on open land, and changes nothing", () => {
    const crowded = runtimeFor(true);
    const before = JSON.stringify(crowded.exportState().tiles);
    expect(landingSiteAvailable(crowded, 0)).toBe(false);
    expect(JSON.stringify(crowded.exportState().tiles)).toBe(before);
    expect(crowded.hasPlayer("__landing-site-probe__")).toBe(false);
    expect(landingSiteAvailable(runtimeFor(false), 0)).toBe(true);
  });

  it("caches the answer per runtime for the TTL", () => {
    const probe = vi.fn(() => true);
    const runtime = { ensurePlayerHasSpawnTerritory: probe };
    landingSiteAvailable(runtime, 0);
    landingSiteAvailable(runtime, LANDING_SITE_PROBE_TTL_MS - 1);
    expect(probe).toHaveBeenCalledTimes(1);
    landingSiteAvailable(runtime, LANDING_SITE_PROBE_TTL_MS);
    expect(probe).toHaveBeenCalledTimes(2);
  });
});

describe("handleGetCurrentSeasonSummary", () => {
  const read = (status: string) => async () => ({ seasonId: "season-1", status } as unknown as CurrentSeasonSummary);
  const parsed = async (status: string, probe?: () => boolean) => {
    const callback = vi.fn();
    handleGetCurrentSeasonSummary(read(status), { request: {} as never }, callback, probe);
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());
    return JSON.parse(callback.mock.calls[0]![1].summary_json) as Record<string, unknown>;
  };

  it("adds landingSiteAvailable only while the season is active", async () => {
    expect((await parsed("active", () => false)).landingSiteAvailable).toBe(false);
    const probe = vi.fn(() => false);
    expect((await parsed("ended", probe)).landingSiteAvailable).toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
  });
});
