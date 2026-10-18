/**
 * Regression: the boot manpower settle ran before the recovered town order
 * was re-applied. Manpower regen weights each town by its place in that
 * order, so the downtime regen credited at boot was computed from tile
 * iteration order instead: a restart paid a big town's regen at a later
 * town's reduced weight (or the reverse).
 */
import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

const PLAYER_ID = "town-order-restart-player";
const BOOT_AT = 600 * 60_000;

type BootTile = { x: number; y: number; terrain: "LAND"; ownerId: string; ownershipState: "SETTLED"; town: { name: string; type: "MARKET"; populationTier: "TOWN" | "METROPOLIS"; goldPerMinute: number } };

const townTile = (x: number, populationTier: "TOWN" | "METROPOLIS"): BootTile => ({
  x,
  y: 10,
  terrain: "LAND",
  ownerId: PLAYER_ID,
  ownershipState: "SETTLED",
  town: { name: `Town ${x}`, type: "MARKET", populationTier, goldPerMinute: 1 }
});

// Five TOWNs then a METROPOLIS: the sixth town in the order earns reduced regen weight.
const smallTowns = [10, 20, 30, 40, 50].map((x) => townTile(x, "TOWN"));
const metropolis = townTile(60, "METROPOLIS");
const recoveredTownOrder = ["60,10", "10,10", "20,10", "30,10", "40,10", "50,10"];

const bootManpower = (tiles: BootTile[]): number => {
  const runtime = new SimulationRuntime({
    now: () => BOOT_AT,
    seedTiles: new Map(),
    initialState: {
      tiles,
      activeLocks: [],
      players: [
        {
          id: PLAYER_ID,
          points: 100_000,
          manpower: 0,
          manpowerUpdatedAt: 0,
          techIds: [],
          domainIds: [],
          strategicResources: { FOOD: 1_000 },
          allies: [],
          ownedTownTileKeys: recoveredTownOrder
        }
      ]
    }
  });
  return runtime.exportState().players.find((player) => player.id === PLAYER_ID)!.manpower;
};

describe("town order across a restart", () => {
  it("credits downtime regen using the recovered town order, whatever order the tiles load in", () => {
    const metropolisLoadedFirst = bootManpower([metropolis, ...smallTowns]);
    const metropolisLoadedLast = bootManpower([...smallTowns, metropolis]);
    expect(metropolisLoadedFirst).toBeGreaterThan(0);
    expect(metropolisLoadedLast).toBe(metropolisLoadedFirst);
  });
});
