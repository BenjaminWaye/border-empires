import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimulationRuntime } from "./runtime.js";
import { applyResourceTileSteal } from "../runtime-resource-steal.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";

const here = dirname(fileURLToPath(import.meta.url));

const testRuntimePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 100,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  strategicResources: { FOOD: 100, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
});

describe("simulation food diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not write debug logs during food upkeep accrual", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([["player-1", testRuntimePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "TOWN", goldPerMinute: 1 }
          },
          {
            x: 6,
            y: 5,
            terrain: "LAND",
            resource: "FARM",
            ownerId: "player-1",
            ownershipState: "SETTLED"
          }
        ],
        activeLocks: []
      }
    });

    currentNow += 60 * 60_000;
    runtime.exportPlannerPlayerViews(["player-1"]);

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("does not write debug logs during passive food income", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([["player-1", testRuntimePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            resource: "FARM",
            ownerId: "player-1",
            ownershipState: "SETTLED"
          }
        ],
        activeLocks: []
      }
    });

    runtime.updatePlayerLastActive("player-1", currentNow);
    runtime.applyPassiveIncome(currentNow, 12 * 60 * 60 * 1000);
    currentNow += 60_000;
    runtime.applyPassiveIncome(currentNow, 12 * 60 * 60 * 1000);

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("does not write debug logs when food is stolen on capture", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const attacker = testRuntimePlayer("attacker");
    const defender = testRuntimePlayer("defender");
    const summary = {
      strategicProductionPerMinute: { FOOD: 0.1 },
      synthesizerCapBonus: {}
    } as PlayerRuntimeSummary;

    applyResourceTileSteal(
      { summaryForPlayer: () => summary },
      attacker,
      defender,
      "FARM"
    );

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("keeps food debug markers out of simulation hot-path files", () => {
    const hotPathFiles = [
      join(here, "runtime.ts"),
      join(here, "../runtime-economy-accrual.ts"),
      join(here, "../runtime-resource-steal.ts")
    ];

    for (const file of hotPathFiles) {
      expect(readFileSync(file, "utf8")).not.toContain("FOOD_DEBUG");
    }
  });
});
