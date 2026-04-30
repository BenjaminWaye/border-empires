import { describe, expect, it } from "vitest";
import type { Player, Tile, TileKey } from "@border-empires/shared";

import { createServerAiFrontierSettlementRuntime } from "./server-ai-frontier-settlement.js";
import type { AiSettlementCandidateEvaluation, AiTerritorySummary } from "./server-ai-frontier-types.js";
import type { RuntimeTileCore, TownDefinition } from "./server-shared-types.js";

const WORLD_WIDTH = 8;
const WORLD_HEIGHT = 8;

const key = (x: number, y: number): TileKey => `${x},${y}`;
const parseKey = (tileKey: TileKey): [number, number] => {
  const [xPart, yPart] = tileKey.split(",");
  return [Number(xPart), Number(yPart)];
};
const wrapX = (value: number, mod: number): number => ((value % mod) + mod) % mod;
const wrapY = (value: number, mod: number): number => ((value % mod) + mod) % mod;

const makeActor = (): Player => ({
  id: "ai-green",
  name: "Green AI",
  isAi: true,
  points: 200,
  level: 1,
  techIds: new Set(),
  domainIds: new Set(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  powerups: {},
  missions: [],
  missionStats: {
    neutralCaptures: 0,
    enemyCaptures: 0,
    combatWins: 0,
    maxTilesHeld: 0,
    maxSettledTilesHeld: 0,
    maxFarmsHeld: 0,
    maxContinentsHeld: 0,
    maxTechPicks: 0
  },
  territoryTiles: new Set(),
  T: 0,
  E: 0,
  Ts: 0,
  Es: 0,
  stamina: 100,
  staminaUpdatedAt: 0,
  manpower: 100,
  manpowerUpdatedAt: 0,
  allies: new Set(),
  spawnShieldUntil: 0,
  isEliminated: false,
  respawnPending: false,
  lastActiveAt: 0,
  activityInbox: []
});

const makeTile = (
  x: number,
  y: number,
  overrides: Partial<Tile> = {}
): Tile => Object.assign({ x, y, terrain: "LAND", lastChangedAt: 0 }, overrides);

const emptyTerritorySummary = (controlledTowns: number): Pick<
  AiTerritorySummary,
  "visibility" | "foodPressure" | "settlementEvaluationByKey" | "islandFootprintSignalByTileKey" | "islandProgress" | "controlledTowns"
> => ({
  visibility: {} as AiTerritorySummary["visibility"],
  foodPressure: 0,
  settlementEvaluationByKey: new Map<string, AiSettlementCandidateEvaluation>(),
  islandFootprintSignalByTileKey: new Map<TileKey, number>(),
  controlledTowns
});

const makeTown = (tileKey: TileKey, settlement = false): TownDefinition => ({
  townId: `town-${tileKey}`,
  tileKey,
  type: "MARKET",
  population: settlement ? 500 : 20_000,
  maxPopulation: 100_000,
  connectedTownCount: 0,
  connectedTownBonus: 0,
  lastGrowthTickAt: 0,
  ...(settlement ? { isSettlement: true } : {})
});

const buildRuntime = (options: {
  actor: Player;
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, NonNullable<Tile["ownershipState"]>>;
  resourceByTile: Map<TileKey, Tile["resource"]>;
  townsByTile: Map<TileKey, TownDefinition>;
}): ReturnType<typeof createServerAiFrontierSettlementRuntime> => {
  const adjacentNeighborCores = (x: number, y: number): RuntimeTileCore[] =>
    ([
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y]
    ] as [number, number][]).map(([nxRaw, nyRaw]) => {
      const nx = wrapX(nxRaw, WORLD_WIDTH);
      const ny = wrapY(nyRaw, WORLD_HEIGHT);
      const tk = key(nx, ny);
      return {
        x: nx,
        y: ny,
        tileKey: tk,
        terrain: "LAND",
        ownerId: options.ownership.get(tk),
        ownershipState: options.ownershipStateByTile.get(tk),
        resource: options.resourceByTile.get(tk)
      };
    });

  return createServerAiFrontierSettlementRuntime({
    WORLD_WIDTH,
    WORLD_HEIGHT,
    ownership: options.ownership,
    ownershipStateByTile: options.ownershipStateByTile,
    townsByTile: options.townsByTile,
    docksByTile: new Map(),
    countAiScoutRevealTiles: () => 0,
    scoreAiScoutExpandCandidate: () => 0,
    aiEconomicFrontierSignal: () => 0,
    aiFoodPressureSignal: () => 0,
    aiDockStrategicSignal: () => 0,
    aiIslandFootprintSignal: () => 0,
    bestAiIslandFocusTargetId: () => undefined,
    aiEconomyPriorityState: (_actor, territorySummary) => ({
      controlledTowns: territorySummary?.controlledTowns ?? 0,
      foodCoverageLow: false,
      economyWeak: false
    }),
    cachedSupportedTownKeysForTile: () => [],
    collectAiTerritorySummary: () => {
      throw new Error("not used in this test");
    },
    townSupport: (tileKey) => {
      const town = options.townsByTile.get(tileKey);
      return town && !town.isSettlement ? { supportCurrent: 0, supportMax: 8 } : { supportCurrent: 0, supportMax: 0 };
    },
    adjacentNeighborCores,
    terrainAt: () => "LAND",
    wrapX,
    wrapY,
    islandMap: () => ({ islandIdByTile: new Map() }),
    key,
    baseTileValue: (resource) => {
      if (resource === "FARM" || resource === "FISH") return 60;
      if (resource === "FUR" || resource === "WOOD") return 70;
      return 80;
    }
  });
};

describe("createServerAiFrontierSettlementRuntime", () => {
  it("does not treat settlement-only rings as valuable compact cores", () => {
    const actor = makeActor();
    const ownership = new Map<TileKey, string>([
      [key(1, 1), actor.id],
      [key(2, 0), actor.id],
      [key(2, 1), actor.id],
      [key(2, 2), actor.id]
    ]);
    const ownershipStateByTile = new Map<TileKey, NonNullable<Tile["ownershipState"]>>([
      [key(1, 1), "SETTLED"],
      [key(2, 0), "SETTLED"],
      [key(2, 1), "FRONTIER"],
      [key(2, 2), "SETTLED"]
    ]);
    const townsByTile = new Map<TileKey, TownDefinition>([[key(1, 1), makeTown(key(1, 1), true)]]);
    const runtime = buildRuntime({
      actor,
      ownership,
      ownershipStateByTile,
      resourceByTile: new Map(),
      townsByTile
    });

    const evaluation = runtime.evaluateAiSettlementCandidate(actor, makeTile(2, 1, { ownerId: actor.id, ownershipState: "FRONTIER" }), undefined, undefined, emptyTerritorySummary(0));

    expect(evaluation.isStrategicallyInteresting).toBe(false);
    expect(evaluation.supportsImmediatePlan).toBe(false);
    expect(evaluation.score).toBeLessThan(0);
  });

  it("does not treat food as immediate settlement value before the first real town", () => {
    const actor = makeActor();
    const ownership = new Map<TileKey, string>([
      [key(2, 1), actor.id],
      [key(3, 1), actor.id]
    ]);
    const ownershipStateByTile = new Map<TileKey, NonNullable<Tile["ownershipState"]>>([
      [key(2, 1), "FRONTIER"],
      [key(3, 1), "FRONTIER"]
    ]);
    const runtime = buildRuntime({
      actor,
      ownership,
      ownershipStateByTile,
      resourceByTile: new Map<TileKey, Tile["resource"]>([
        [key(2, 1), "FARM"],
        [key(3, 1), "FUR"]
      ]),
      townsByTile: new Map()
    });

    const territorySummary = emptyTerritorySummary(0);
    const foodEvaluation = runtime.evaluateAiSettlementCandidate(
      actor,
      makeTile(2, 1, { ownerId: actor.id, ownershipState: "FRONTIER", resource: "FARM" }),
      undefined,
      undefined,
      territorySummary
    );
    const furEvaluation = runtime.evaluateAiSettlementCandidate(
      actor,
      makeTile(3, 1, { ownerId: actor.id, ownershipState: "FRONTIER", resource: "FUR" }),
      undefined,
      undefined,
      territorySummary
    );

    expect(foodEvaluation.isEconomicallyInteresting).toBe(false);
    expect(furEvaluation.isEconomicallyInteresting).toBe(true);
    expect(foodEvaluation.score).toBeLessThan(furEvaluation.score);
  });
});
