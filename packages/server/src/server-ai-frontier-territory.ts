import type { Player, Tile, TileKey } from "@border-empires/shared";
import type { RuntimeTileCore } from "./server-shared-types.js";
import type {
  AiFrontierCandidatePair,
  AiTerritoryStructureCache,
  AiTerritorySummary
} from "./server-ai-frontier-types.js";

export interface CreateServerAiFrontierTerritoryDeps {
  BARBARIAN_OWNER_ID: string;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  townsByTile: Map<TileKey, unknown>;
  docksByTile: Map<TileKey, unknown>;
  ownershipStateByTile: Map<TileKey, string>;
  cachedAiTerritoryStructureByPlayer: Map<string, AiTerritoryStructureCache>;
  visibilitySnapshotForPlayer: (player: Player) => AiTerritorySummary["visibility"];
  aiFoodPressureSignal: (actor: Player) => number;
  aiFrontierActionCandidates: (actor: Player, from: Tile, actionType: "EXPAND" | "ATTACK") => Tile[];
  aiTileLiteAt: (x: number, y: number) => Tile;
  aiTerritoryVersionForPlayer: (playerId: string) => number;
  playerWorldFlags: (actor: Player) => Set<string>;
  countControlledTowns: (playerId: string) => number;
  adjacentNeighborCores: (x: number, y: number) => RuntimeTileCore[];
  parseKey: (tileKey: TileKey) => [number, number];
  key: (x: number, y: number) => TileKey;
}

export interface ServerAiFrontierTerritoryRuntime {
  preferAiFrontierCandidate: (
    current: AiFrontierCandidatePair | undefined,
    next: AiFrontierCandidatePair
  ) => AiFrontierCandidatePair;
  buildAiTerritoryStructureCache: (actor: Player) => AiTerritoryStructureCache;
  cachedAiTerritoryStructureForPlayer: (actor: Player) => AiTerritoryStructureCache;
  collectAiTerritorySummary: (actor: Player) => AiTerritorySummary;
}

export const createServerAiFrontierTerritoryRuntime = (
  deps: CreateServerAiFrontierTerritoryDeps
): ServerAiFrontierTerritoryRuntime => {
  const preferAiFrontierCandidate = (
    current: AiFrontierCandidatePair | undefined,
    next: AiFrontierCandidatePair
  ): AiFrontierCandidatePair => {
    if (!current) return next;
    const currentSettled = current.from.ownershipState === "SETTLED";
    const nextSettled = next.from.ownershipState === "SETTLED";
    if (currentSettled !== nextSettled) return nextSettled ? next : current;
    if (next.from.y !== current.from.y) return next.from.y < current.from.y ? next : current;
    if (next.from.x !== current.from.x) return next.from.x < current.from.x ? next : current;
    return current;
  };

  const buildAiTerritoryStructureCache = (actor: Player): AiTerritoryStructureCache => {
    const settledTiles: Tile[] = [];
    const frontierTiles: Tile[] = [];
    const expandCandidateByTarget = new Map<TileKey, AiFrontierCandidatePair>();
    const attackCandidateByTarget = new Map<TileKey, AiFrontierCandidatePair>();
    const borderSettledTileKeys = new Set<TileKey>();
    let underThreat = false;
    let neutralTownExpandCount = 0;
    let neutralEconomicExpandCount = 0;
    let neutralLandExpandCount = 0;
    let hostileTownAttackCount = 0;
    let hostileEconomicAttackCount = 0;
    let barbarianAttackAvailable = false;
    let enemyAttackAvailable = false;

    for (const tileKey of actor.territoryTiles) {
      const [x, y] = deps.parseKey(tileKey);
      const from = deps.aiTileLiteAt(x, y);
      const ownershipState = deps.ownershipStateByTile.get(tileKey);
      if (ownershipState === "SETTLED") settledTiles.push(from);
      else if (ownershipState === "FRONTIER") frontierTiles.push(from);
      if (!underThreat && (ownershipState === "SETTLED" || ownershipState === "FRONTIER")) {
        underThreat = deps.adjacentNeighborCores(x, y).some((neighbor) => {
          if (neighbor.terrain !== "LAND") return false;
          if (!neighbor.ownerId || neighbor.ownerId === actor.id || actor.allies.has(neighbor.ownerId)) return false;
          return true;
        });
      }
      for (const to of deps.aiFrontierActionCandidates(actor, from, "EXPAND")) {
        const targetKey = deps.key(to.x, to.y);
        const pair = { from, to };
        const firstSeenTarget = !expandCandidateByTarget.has(targetKey);
        expandCandidateByTarget.set(targetKey, preferAiFrontierCandidate(expandCandidateByTarget.get(targetKey), pair));
        if (firstSeenTarget && to.terrain === "LAND" && !to.ownerId) {
          neutralLandExpandCount += 1;
          if (deps.townsByTile.has(targetKey)) neutralTownExpandCount += 1;
          if (deps.townsByTile.has(targetKey) || deps.docksByTile.has(targetKey) || Boolean(to.resource)) neutralEconomicExpandCount += 1;
        }
        if (from.ownerId === actor.id && from.ownershipState === "SETTLED") borderSettledTileKeys.add(tileKey);
      }
      for (const to of deps.aiFrontierActionCandidates(actor, from, "ATTACK")) {
        const targetKey = deps.key(to.x, to.y);
        const pair = { from, to };
        const firstSeenTarget = !attackCandidateByTarget.has(targetKey);
        attackCandidateByTarget.set(targetKey, preferAiFrontierCandidate(attackCandidateByTarget.get(targetKey), pair));
        if (firstSeenTarget && to.terrain === "LAND" && to.ownerId && to.ownerId !== actor.id && !actor.allies.has(to.ownerId)) {
          if (to.ownerId === deps.BARBARIAN_OWNER_ID) {
            barbarianAttackAvailable = true;
          } else {
            enemyAttackAvailable = true;
            if (deps.townsByTile.has(targetKey)) hostileTownAttackCount += 1;
            else if (Boolean(to.resource) || deps.docksByTile.has(targetKey)) hostileEconomicAttackCount += 1;
          }
        }
        if (from.ownerId === actor.id && from.ownershipState === "SETTLED") borderSettledTileKeys.add(tileKey);
      }
    }

    const structureCandidateTiles = settledTiles.filter((tile) => {
      const tileKey = deps.key(tile.x, tile.y);
      return borderSettledTileKeys.has(tileKey) || deps.docksByTile.has(tileKey) || deps.townsByTile.has(tileKey) || Boolean(tile.resource);
    });

    return {
      version: deps.aiTerritoryVersionForPlayer(actor.id),
      settledTileCount: settledTiles.length,
      frontierTileCount: frontierTiles.length,
      settledTiles,
      frontierTiles,
      expandCandidates: [...expandCandidateByTarget.values()],
      attackCandidates: [...attackCandidateByTarget.values()],
      borderSettledTileKeys,
      structureCandidateTiles,
      underThreat,
      worldFlags: deps.playerWorldFlags(actor),
      controlledTowns: deps.countControlledTowns(actor.id),
      neutralTownExpandCount,
      neutralEconomicExpandCount,
      neutralLandExpandCount,
      hostileTownAttackCount,
      hostileEconomicAttackCount,
      barbarianAttackAvailable,
      enemyAttackAvailable,
      scoutRevealCountByTileKey: new Map<TileKey, number>(),
      scoutRevealValueByProfileKey: new Map<string, number>(),
      scoutAdjacencyByTileKey: new Map<TileKey, AiTerritorySummary["scoutAdjacencyByTileKey"] extends Map<TileKey, infer T> ? T : never>()
    };
  };

  const cachedAiTerritoryStructureForPlayer = (actor: Player): AiTerritoryStructureCache => {
    const version = deps.aiTerritoryVersionForPlayer(actor.id);
    const cached = deps.cachedAiTerritoryStructureByPlayer.get(actor.id);
    if (cached && cached.version === version) return cached;
    const rebuilt = buildAiTerritoryStructureCache(actor);
    deps.cachedAiTerritoryStructureByPlayer.set(actor.id, rebuilt);
    return rebuilt;
  };

  const collectAiTerritorySummary = (actor: Player): AiTerritorySummary => {
    const cached = cachedAiTerritoryStructureForPlayer(actor);
    return {
      visibility: deps.visibilitySnapshotForPlayer(actor),
      settledTileCount: cached.settledTileCount,
      frontierTileCount: cached.frontierTileCount,
      settledTiles: cached.settledTiles,
      frontierTiles: cached.frontierTiles,
      expandCandidates: cached.expandCandidates,
      attackCandidates: cached.attackCandidates,
      borderSettledTileKeys: cached.borderSettledTileKeys,
      structureCandidateTiles: cached.structureCandidateTiles,
      underThreat: cached.underThreat,
      worldFlags: cached.worldFlags,
      controlledTowns: cached.controlledTowns,
      neutralTownExpandCount: cached.neutralTownExpandCount,
      neutralEconomicExpandCount: cached.neutralEconomicExpandCount,
      neutralLandExpandCount: cached.neutralLandExpandCount,
      hostileTownAttackCount: cached.hostileTownAttackCount,
      hostileEconomicAttackCount: cached.hostileEconomicAttackCount,
      barbarianAttackAvailable: cached.barbarianAttackAvailable,
      enemyAttackAvailable: cached.enemyAttackAvailable,
      foodPressure: deps.aiFoodPressureSignal(actor),
      settlementEvaluationByKey: new Map<string, AiTerritorySummary["settlementEvaluationByKey"] extends Map<string, infer T> ? T : never>(),
      scoutRevealCountByTileKey: cached.scoutRevealCountByTileKey,
      scoutRevealValueByProfileKey: cached.scoutRevealValueByProfileKey,
      scoutAdjacencyByTileKey: cached.scoutAdjacencyByTileKey,
      supportedTownKeysByTileKey: new Map<TileKey, TileKey[]>(),
      dockSignalByTileKey: new Map<TileKey, number>(),
      economicSignalByTileKey: new Map<TileKey, number>(),
      pressureSignalByTileKey: new Map<TileKey, number>(),
      islandFootprintSignalByTileKey: new Map<TileKey, number>(),
      islandFocusTargetId: undefined,
      scoutRevealMarks: new Uint32Array(deps.WORLD_WIDTH * deps.WORLD_HEIGHT),
      scoutRevealStamp: 1
    };
  };

  return {
    preferAiFrontierCandidate,
    buildAiTerritoryStructureCache,
    cachedAiTerritoryStructureForPlayer,
    collectAiTerritorySummary
  };
};
