import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Player, Tile, TileKey } from "@border-empires/shared";

import { createServerSettlementFlow } from "./server-settlement-flow.js";

const readServerSource = (relativePath: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, relativePath), "utf8");
};

const makePlayer = (id: string, territoryTiles: TileKey[]): Player => ({
  id,
  name: id,
  points: 0,
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
  territoryTiles: new Set(territoryTiles),
  T: territoryTiles.length,
  E: 0,
  Ts: territoryTiles.length,
  Es: 0,
  stamina: 100,
  staminaUpdatedAt: 0,
  manpower: 0,
  manpowerUpdatedAt: 0,
  manpowerCapSnapshot: 100,
  allies: new Set(),
  spawnShieldUntil: 0,
  isEliminated: false,
  respawnPending: false,
  lastActiveAt: 0,
  activityInbox: []
});

const parseTileKey = (tileKey: TileKey): [number, number] => {
  const [xText, yText] = tileKey.split(",");
  return [Number(xText), Number(yText)];
};

const makeTileReader = (ownership: Map<TileKey, string>, ownershipStateByTile: Map<TileKey, "SETTLED" | "FRONTIER">): ((x: number, y: number) => Tile) =>
  (x: number, y: number): Tile => {
    const tileKey = `${x},${y}` as TileKey;
    const ownerId = ownership.get(tileKey);
    const ownershipState = ownershipStateByTile.get(tileKey);
    return {
      x,
      y,
      terrain: "LAND",
      lastChangedAt: 0,
      ...(ownerId ? { ownerId } : {}),
      ...(ownershipState ? { ownershipState } : {})
    };
  };

describe("settlement relocation regression guard", () => {
  it("tracks settled age so oldest settled tile can be chosen deterministically", () => {
    const mainSource = readServerSource("./main.ts");
    const settlementFlowSource = readServerSource("./server-settlement-flow.ts");
    expect(mainSource).toContain("const settledSinceByTile = new Map<TileKey, number>();");
    expect(settlementFlowSource).toContain("const oldestSettledSettlementCandidateForPlayer = (playerId: string): TileKey | undefined => {");
  });

  it("prevents abandoning a live settlement tile", () => {
    const source = readServerSource("./main.ts");
    expect(source).toContain('code: "UNCAPTURE_SETTLEMENT"');
    expect(source).toContain('message: "cannot abandon your settlement"');
  });

  it("seeds a settlement at spawn and recreates one only through the fallback helper", () => {
    const playerRuntimeSource = readServerSource("./server-player-runtime-support.ts");
    const settlementFlowSource = readServerSource("./server-settlement-flow.ts");
    expect(playerRuntimeSource).toContain("const tileKey = deps.key(x, y);");
    expect(playerRuntimeSource).toContain("if (deps.townsByTile.has(tileKey)) return false;");
    expect(playerRuntimeSource).toContain('if (tile.resource || tile.dockId || tile.fort || tile.observatory || tile.siegeOutpost || tile.economicStructure) return false;');
    expect(playerRuntimeSource).toContain('if (!deps.townsByTile.has(tileKey)) deps.createSettlementAtTile(player.id, tileKey);');
    expect(playerRuntimeSource).toContain("const previousOwnerId = tile.ownerId;");
    expect(playerRuntimeSource).toContain("const previousOwnershipState = tile.ownershipState;");
    expect(playerRuntimeSource).toContain("deps.updateOwnership(x, y, previousOwnerId, previousOwnershipState);");
    expect(settlementFlowSource).toContain("const ensureFallbackSettlementForPlayer = (playerId: string): boolean => {");
    expect(settlementFlowSource).toContain("const playerHasPotentialGoldIncome = (playerId: string): boolean => {");
    expect(settlementFlowSource).toContain("ignoreSuppression: true, ignoreManpowerGate: true");
  });

  it("repairs missing settlements and keeps the active settlement authoritative for the capital marker", () => {
    const settlementFlowSource = readServerSource("./server-settlement-flow.ts");
    const tileViewSource = readServerSource("./server-tile-view-runtime.ts");
    const playerRuntimeSource = readServerSource("./server-player-runtime-support.ts");
    const snapshotHydrateSource = readServerSource("./server-snapshot-hydrate.ts");
    expect(settlementFlowSource).toContain("const activeSettlementTileKeyForPlayer = (playerId: string): TileKey | undefined => {");
    expect(settlementFlowSource).toContain("for (const tileKey of player.territoryTiles) {");
    expect(settlementFlowSource).toContain("if (isRelocatableSettlementTown(townsByTile.get(tileKey))) return tileKey;");
    expect(settlementFlowSource).toContain("const ensureActiveSettlementForPlayer = (playerId: string): boolean => {");
    expect(settlementFlowSource).toContain("for (const candidate of [player.spawnOrigin, player.capitalTileKey, oldestSettledSettlementCandidateForPlayer(playerId)]) {");
    expect(playerRuntimeSource).toContain("deps.ensureActiveSettlementForPlayer(player.id);");
    expect(snapshotHydrateSource).toContain("deps.ensureActiveSettlementForPlayer(playerId);");
    expect(tileViewSource).toContain("if (ownerId !== deps.BARBARIAN_OWNER_ID && deps.activeSettlementTileKeyForPlayer(ownerId) === tileKey) tile.capital = true;");
  });

  it("relocates captured settlement-tier towns instead of leaving them on the captured tile", () => {
    const ownershipSource = readServerSource("./server-ownership-runtime.ts");
    const settlementFlowSource = readServerSource("./server-settlement-flow.ts");
    expect(ownershipSource).toContain('if (oldOwner !== deps.BARBARIAN_OWNER_ID && capturedTown && deps.isRelocatableSettlementTown(capturedTown)) {');
    expect(ownershipSource).toContain("deps.relocateCapturedSettlementForPlayer(displacedSettlement.ownerId, displacedSettlement.town);");
    expect(settlementFlowSource).toContain('Boolean(town && townPopulationTierForTown(town) === "SETTLEMENT");');
    expect(settlementFlowSource).not.toContain("town.isSettlement && townPopulationTierForTown(town) === \"SETTLEMENT\"");
  });

  it("does not spawn a fallback settlement when a grown town only lacks realized income temporarily", () => {
    const playerId = "player-1";
    const townTileKey = "1,1" as TileKey;
    const candidateTileKey = "2,1" as TileKey;
    const ownership = new Map<TileKey, string>([
      [townTileKey, playerId],
      [candidateTileKey, playerId]
    ]);
    const ownershipStateByTile = new Map<TileKey, "SETTLED" | "FRONTIER">([
      [townTileKey, "SETTLED"],
      [candidateTileKey, "SETTLED"]
    ]);
    const townsByTile = new Map<TileKey, {
      townId: string;
      tileKey: TileKey;
      type: "MARKET";
      population: number;
      maxPopulation: number;
      connectedTownCount: number;
      connectedTownBonus: number;
      lastGrowthTickAt: number;
    }>([
      [
        townTileKey,
        {
          townId: "town-1",
          tileKey: townTileKey,
          type: "MARKET" as const,
          population: 20_000,
          maxPopulation: 50_000,
          connectedTownCount: 0,
          connectedTownBonus: 0,
          lastGrowthTickAt: 0
        }
      ]
    ]);
    const runtime = createServerSettlementFlow({
      key: (x, y) => `${x},${y}`,
      now: () => 0,
      parseKey: parseTileKey,
      wrapX: (x) => x,
      wrapY: (y) => y,
      WORLD_WIDTH: 8,
      WORLD_HEIGHT: 8,
      POPULATION_MIN: 1,
      POPULATION_MAX: 100_000,
      POPULATION_START_SPREAD: 0,
      resourceRate: {},
      players: new Map([[playerId, makePlayer(playerId, [townTileKey, candidateTileKey])]]),
      townsByTile,
      docksByTile: new Map(),
      fortsByTile: new Map(),
      observatoriesByTile: new Map(),
      siegeOutpostsByTile: new Map(),
      economicStructuresByTile: new Map(),
      ownership,
      ownershipStateByTile,
      settledSinceByTile: new Map([
        [townTileKey, 0],
        [candidateTileKey, 1]
      ]),
      activeSeason: { worldSeed: 1 },
      seeded01: () => 0,
      terrainAtRuntime: () => "LAND",
      playerTile: makeTileReader(ownership, ownershipStateByTile),
      applyClusterResources: (_x, _y, base) => base,
      resourceAt: () => undefined,
      townTypeAt: () => "MARKET",
      townPopulationTierForTown: () => "TOWN",
      structurePlacementMetadata: () => ({ showOn: ["settled"], placementMode: "same_tile", sortGroup: "general" }),
      assignMissingTownNamesForWorld: () => {},
      markSummaryChunkDirtyAtTile: () => {},
      sendVisibleTileDeltaAt: () => {},
      connectedTownBonusForOwner: () => 0,
      dockIncomeForOwner: () => 0,
      townPotentialIncomeForOwner: (_town, ownerId, options) =>
        ownerId === playerId && options?.ignoreSuppression && options?.ignoreManpowerGate ? 3 : 0
    });

    const createdFallback = runtime.ensureFallbackSettlementForPlayer(playerId);

    expect(createdFallback).toBe(false);
    expect(townsByTile.has(candidateTileKey)).toBe(false);
  });
});
