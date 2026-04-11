// @ts-nocheck

export const createServerStatusMetrics = (deps) => {
  const {
    cachedAiTerritoryStructureForPlayer,
    currentIncomePerMinute,
    frontierSettlementsByPlayer,
    VICTORY_PRESSURE_FRONTIER_REACH_WINDOW_MS,
    now,
    townsByTile,
    ownership,
    ownershipStateByTile,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainAtRuntime,
    applyClusterResources,
    resourceAt,
    players,
    parseKey,
    activeSeason,
    key,
    wrapX,
    wrapY
  } = deps;

  const computeLeaderboardSnapshot = (limitTop = 5): LeaderboardSnapshotView => {
    const rows = collectPlayerCompetitionMetrics().map((metric) => ({
      id: metric.playerId,
      name: metric.name,
      tiles: metric.settledTiles,
      incomePerMinute: metric.incomePerMinute,
      techs: metric.techs
    }));
    const overallRanked = [...rows]
      .map((r) => ({ ...r, score: r.tiles * 1 + r.incomePerMinute * 3 + r.techs * 8 }))
      .sort((a, b) => b.score - a.score || b.tiles - a.tiles || b.incomePerMinute - a.incomePerMinute || b.techs - a.techs || a.id.localeCompare(b.id))
      .map((r, index) => ({ ...r, rank: index + 1 }));
    const overall = overallRanked.slice(0, limitTop);
    const rankMetricEntries = (
      valueFor: (row: (typeof rows)[number]) => number,
      tieBreak: (a: (typeof rows)[number], b: (typeof rows)[number]) => number = () => 0
    ): LeaderboardMetricEntry[] =>
      [...rows]
        .sort((a, b) => valueFor(b) - valueFor(a) || tieBreak(a, b) || a.id.localeCompare(b.id))
        .map((r, index) => ({ id: r.id, name: r.name, value: valueFor(r), rank: index + 1 }));
    const byTiles = rankMetricEntries((row) => row.tiles, (a, b) => b.incomePerMinute - a.incomePerMinute || b.techs - a.techs).slice(0, limitTop);
    const byIncome = rankMetricEntries((row) => row.incomePerMinute, (a, b) => b.tiles - a.tiles || b.techs - a.techs).slice(0, limitTop);
    const byTechs = rankMetricEntries((row) => row.techs, (a, b) => b.tiles - a.tiles || b.incomePerMinute - a.incomePerMinute).slice(0, limitTop);
  
    return {
      overall,
      selfOverall: undefined,
      selfByTiles: undefined,
      selfByIncome: undefined,
      selfByTechs: undefined,
      byTiles,
      byIncome,
      byTechs
    };
  };
  
  const trimFrontierSettlementsWindow = (playerId: string, nowMs = now()): number[] => {
    const timestamps = frontierSettlementsByPlayer.get(playerId);
    if (!timestamps || timestamps.length === 0) return [];
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < timestamps.length; readIndex += 1) {
      const timestamp = timestamps[readIndex]!;
      if (nowMs - timestamp > VICTORY_PRESSURE_FRONTIER_REACH_WINDOW_MS) continue;
      timestamps[writeIndex] = timestamp;
      writeIndex += 1;
    }
    if (writeIndex !== timestamps.length) timestamps.length = writeIndex;
    if (writeIndex === 0) {
      frontierSettlementsByPlayer.delete(playerId);
      return [];
    }
    return timestamps;
  };
  
  const recordFrontierSettlementForPressure = (playerId: string): void => {
    const next = trimFrontierSettlementsWindow(playerId);
    next.push(now());
    frontierSettlementsByPlayer.set(playerId, next);
  };
  
  const uniqueLeader = (entries: Array<{ playerId: string; value: number }>): { playerId?: string; value: number } => {
    if (entries.length === 0) return { value: 0 };
    let top = entries[0]!;
    let runnerUp: { playerId: string; value: number } | undefined;
    for (let i = 1; i < entries.length; i += 1) {
      const entry = entries[i]!;
      if (entry.value > top.value) {
        runnerUp = top;
        top = entry;
        continue;
      }
      if (!runnerUp || entry.value > runnerUp.value) runnerUp = entry;
    }
    if (top.value <= 0) return { value: top.value };
    if (runnerUp && runnerUp.value === top.value) return { value: top.value };
    return { playerId: top.playerId, value: top.value };
  };
  
  const leadingPair = (entries: Array<{ playerId: string; value: number }>): {
    leaderPlayerId?: string;
    leaderValue: number;
    runnerUpValue: number;
    tied: boolean;
  } => {
    if (entries.length === 0) return { leaderValue: 0, runnerUpValue: 0, tied: false };
    const sorted = [...entries].sort((a, b) => b.value - a.value);
    const leader = sorted[0]!;
    const runnerUp = sorted[1];
    return {
      leaderPlayerId: leader.playerId,
      leaderValue: leader.value,
      runnerUpValue: runnerUp?.value ?? 0,
      tied: Boolean(runnerUp && runnerUp.value === leader.value)
    };
  };
  
  const countControlledTowns = (playerId: string): number => {
    let count = 0;
    for (const tk of townsByTile.keys()) {
      if (ownership.get(tk) !== playerId) continue;
      if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
      count += 1;
    }
    return count;
  };
  
  const worldResourceTileCounts = (): Record<ResourceType, number> => {
    const counts: Record<ResourceType, number> = { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0, OIL: 0 };
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        if (terrainAtRuntime(x, y) !== "LAND") continue;
        const resource = applyClusterResources(x, y, resourceAt(x, y));
        if (!resource) continue;
        counts[resource] = (counts[resource] ?? 0) + 1;
      }
    }
    return counts;
  };
  
  const controlledResourceTileCounts = (playerId: string): Record<ResourceType, number> => {
    const counts: Record<ResourceType, number> = { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0, OIL: 0 };
    for (const tk of players.get(playerId)?.territoryTiles ?? []) {
      const [x, y] = parseKey(tk);
      if (terrainAtRuntime(x, y) !== "LAND") continue;
      const resource = applyClusterResources(x, y, resourceAt(x, y));
      if (!resource) continue;
      counts[resource] = (counts[resource] ?? 0) + 1;
    }
    return counts;
  };
  
  let cachedIslandMap:
    | {
        seed: number;
        islandIdByTile: Map<TileKey, number>;
        landCounts: Map<number, number>;
      }
    | undefined;
  
  const buildIslandMap = (): { islandIdByTile: Map<TileKey, number>; landCounts: Map<number, number> } => {
    const islandIdByTile = new Map<TileKey, number>();
    const landCounts = new Map<number, number>();
    let nextIslandId = 0;
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        if (terrainAtRuntime(x, y) !== "LAND") continue;
        const startKey = key(x, y);
        if (islandIdByTile.has(startKey)) continue;
        const islandId = nextIslandId;
        nextIslandId += 1;
        const queue: Array<{ x: number; y: number }> = [{ x, y }];
        islandIdByTile.set(startKey, islandId);
        let islandLand = 0;
        while (queue.length > 0) {
          const current = queue.shift()!;
          islandLand += 1;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) continue;
              const nx = wrapX(current.x + dx, WORLD_WIDTH);
              const ny = wrapY(current.y + dy, WORLD_HEIGHT);
              if (terrainAtRuntime(nx, ny) !== "LAND") continue;
              const neighborKey = key(nx, ny);
              if (islandIdByTile.has(neighborKey)) continue;
              islandIdByTile.set(neighborKey, islandId);
              queue.push({ x: nx, y: ny });
            }
          }
        }
        landCounts.set(islandId, islandLand);
      }
    }
    return { islandIdByTile, landCounts };
  };
  
  const islandMap = (): { islandIdByTile: Map<TileKey, number>; landCounts: Map<number, number> } => {
    const cached = cachedIslandMap;
    if (cached && cached.seed === activeSeason.worldSeed) {
      return { islandIdByTile: cached.islandIdByTile, landCounts: cached.landCounts };
    }
    const next = buildIslandMap();
    cachedIslandMap = { seed: activeSeason.worldSeed, ...next };
    return next;
  };
  
  const islandLandCounts = (): Map<number, number> => islandMap().landCounts;
  
  const islandSettledCounts = (playerId: string): Map<number, number> => {
    const counts = new Map<number, number>();
    const ids = islandMap().islandIdByTile;
    for (const tk of players.get(playerId)?.territoryTiles ?? []) {
      const [x, y] = parseKey(tk);
      if (terrainAtRuntime(x, y) !== "LAND") continue;
      if (ownership.get(tk) !== playerId || ownershipStateByTile.get(tk) !== "SETTLED") continue;
      const islandId = ids.get(tk);
      if (islandId === undefined) continue;
      counts.set(islandId, (counts.get(islandId) ?? 0) + 1);
    }
    return counts;
  };
  
  let cachedClaimableLandTileCount: { seed: number; count: number } | undefined;
  const claimableLandTileCount = (): number => {
    if (cachedClaimableLandTileCount?.seed === activeSeason.worldSeed) return cachedClaimableLandTileCount?.count ?? 0;
    let count = 0;
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        if (terrainAtRuntime(x, y) === "LAND") count += 1;
      }
    }
    cachedClaimableLandTileCount = { seed: activeSeason.worldSeed, count };
    return count;
  };
  
  const collectPlayerCompetitionMetrics = (nowMs = now()): PlayerCompetitionMetrics[] => {
    const metrics: PlayerCompetitionMetrics[] = [];
    for (const player of players.values()) {
      const territoryStructure = cachedAiTerritoryStructureForPlayer(player);
      metrics.push({
        playerId: player.id,
        name: player.name,
        tiles: player.T,
        settledTiles: territoryStructure.settledTileCount,
        incomePerMinute: currentIncomePerMinute(player),
        techs: player.techIds.size,
        controlledTowns: territoryStructure.controlledTowns
      });
    }
    return metrics;
  };
  
  return {
    computeLeaderboardSnapshot,
    uniqueLeader,
    leadingPair,
    countControlledTowns,
    worldResourceTileCounts,
    controlledResourceTileCounts,
    islandMap,
    islandLandCounts,
    islandSettledCounts,
    claimableLandTileCount,
    collectPlayerCompetitionMetrics,
    trimFrontierSettlementsWindow,
    recordFrontierSettlementForPressure
  };
};
