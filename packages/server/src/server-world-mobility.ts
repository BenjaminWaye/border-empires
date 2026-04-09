import crypto from "node:crypto";

import type { BarbarianAgent, Dock, Player, Tile, TileKey } from "@border-empires/shared";

type WorldMobilityDeps = Record<string, any>;

export const createServerWorldMobility = (deps: WorldMobilityDeps) => {
  const {
    now,
    key,
    parseKey,
    wrapX,
    wrapY,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    BARBARIAN_OWNER_ID,
    BARBARIAN_ACTION_INTERVAL_MS,
    BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS,
    INITIAL_BARBARIAN_COUNT,
    MIN_ACTIVE_BARBARIAN_AGENTS,
    BREACH_SHOCK_MS,
    players,
    townsByTile,
    docksByTile,
    dockById,
    clusterByTile,
    breachShockByTile,
    barbarianAgents,
    barbarianAgentByTileKey,
    terrainAt,
    setWorldSeed,
    generateClusters,
    generateDocks,
    generateTowns,
    seedInitialShardScatter,
    ensureBaselineEconomyCoverage,
    ensureInterestCoverage,
    normalizeTownPlacements,
    assignMissingTownNamesForWorld,
    seeded01,
    playerTile,
    visible,
    updateOwnership,
    hasOnlinePlayers,
    hasQueuedSystemSimulationCommand,
    enqueueSystemSimulationCommand,
    fortDefenseMultAt,
    playerDefensiveness,
    settledDefenseMultiplierForTarget,
    ownershipDefenseMultiplierForTarget,
    isAdjacentTile,
    markSummaryChunkDirtyAtTile
  } = deps;

  const worldLooksBland = (): boolean => {
    const step = 15;
    let checkedBlocks = 0;
    let blandBlocks = 0;
    for (let y = 0; y < WORLD_HEIGHT; y += step) {
      for (let x = 0; x < WORLD_WIDTH; x += step) {
        let land = 0;
        let nearBarrier = 0;
        let nearHook = 0;
        for (let dy = 0; dy < step; dy += 1) {
          for (let dx = 0; dx < step; dx += 1) {
            const wx = wrapX(x + dx, WORLD_WIDTH);
            const wy = wrapY(y + dy, WORLD_HEIGHT);
            if (terrainAt(wx, wy) !== "LAND") continue;
            land += 1;
            const neighbors: Array<[number, number]> = [[wx, wrapY(wy - 1, WORLD_HEIGHT)], [wrapX(wx + 1, WORLD_WIDTH), wy], [wx, wrapY(wy + 1, WORLD_HEIGHT)], [wrapX(wx - 1, WORLD_WIDTH), wy]];
            if (neighbors.some(([nx, ny]) => terrainAt(nx, ny) !== "LAND")) nearBarrier += 1;
            const tk = key(wx, wy);
            if (clusterByTile.has(tk) || townsByTile.has(tk) || docksByTile.has(tk)) nearHook += 1;
          }
        }
        checkedBlocks += 1;
        if (land < step * step * 0.45) continue;
        if (nearBarrier / Math.max(1, land) < 0.08 && nearHook / Math.max(1, land) < 0.02) blandBlocks += 1;
      }
    }
    return blandBlocks > checkedBlocks * 0.22;
  };

  const regenerateStrategicWorld = (initialSeed: number): number => {
    let seed = initialSeed;
    for (let i = 0; i < 8; i += 1) {
      setWorldSeed(seed);
      generateClusters(seed);
      generateDocks(seed);
      generateTowns(seed);
      seedInitialShardScatter(seed);
      ensureBaselineEconomyCoverage(seed);
      ensureInterestCoverage(seed);
      normalizeTownPlacements();
      assignMissingTownNamesForWorld();
      if (!worldLooksBland()) return seed;
      seed = Math.floor(seeded01(seed + i * 101, seed + i * 137, seed + 9001) * 1_000_000_000);
    }
    return seed;
  };

  const dockLinkedDestinations = (fromDock: Dock): Dock[] => {
    const out: Dock[] = [];
    const seen = new Set<string>();
    for (const dockId of fromDock.connectedDockIds ?? []) {
      const linked = dockById.get(dockId);
      if (!linked || seen.has(linked.dockId)) continue;
      out.push(linked);
      seen.add(linked.dockId);
    }
    if (seen.size === 0 && fromDock.pairedDockId) {
      const direct = dockById.get(fromDock.pairedDockId);
      if (direct) {
        out.push(direct);
        seen.add(direct.dockId);
      }
      for (const dock of dockById.values()) {
        if (dock.dockId === fromDock.dockId || dock.pairedDockId !== fromDock.dockId || seen.has(dock.dockId)) continue;
        out.push(dock);
        seen.add(dock.dockId);
      }
    }
    return out;
  };

  const dockLinkedTileKeysByDockTileKey = new Map<TileKey, TileKey[]>();
  const dockLinkedTileKeys = (fromDock: Dock): TileKey[] => {
    const cached = dockLinkedTileKeysByDockTileKey.get(fromDock.tileKey);
    if (cached) return cached;
    const linked = dockLinkedDestinations(fromDock).map((dock) => dock.tileKey);
    dockLinkedTileKeysByDockTileKey.set(fromDock.tileKey, linked);
    return linked;
  };

  const validDockCrossingTarget = (fromDock: Dock, toX: number, toY: number, allowAdjacentToDock = true): boolean =>
    dockLinkedDestinations(fromDock).some((targetDock) => {
      const [px, py] = parseKey(targetDock.tileKey);
      return (toX === px && toY === py) || (allowAdjacentToDock && isAdjacentTile(px, py, toX, toY));
    });

  const findOwnedDockOriginForCrossing = (actor: Player, toX: number, toY: number, allowAdjacentToDock = true): Tile | undefined => {
    for (const tk of actor.territoryTiles) {
      const dock = docksByTile.get(tk);
      if (!dock) continue;
      const tile = playerTile(...parseKey(tk));
      if (tile.ownerId !== actor.id || tile.terrain !== "LAND") continue;
      if (validDockCrossingTarget(dock, toX, toY, allowAdjacentToDock)) return tile;
    }
    return undefined;
  };

  const adjacentNeighbors = (x: number, y: number): Tile[] => [
    playerTile(x, y - 1),
    playerTile(x + 1, y),
    playerTile(x, y + 1),
    playerTile(x - 1, y),
    playerTile(x - 1, y - 1),
    playerTile(x + 1, y - 1),
    playerTile(x + 1, y + 1),
    playerTile(x - 1, y + 1)
  ];

  const isOccupiedPlayerTile = (tile: Tile): boolean => Boolean(tile.ownerId && tile.ownerId !== BARBARIAN_OWNER_ID && (tile.ownershipState ?? "SETTLED") !== undefined && ["FRONTIER", "SETTLED"].includes(tile.ownershipState ?? "SETTLED"));
  const isValuableTile = (tile: Tile): boolean => Boolean(tile.resource || tile.town || tile.fort || tile.siegeOutpost || tile.dockId);
  const isBarbarianPriorityValueTile = (tile: Tile): boolean => Boolean(tile.resource || tile.town || tile.siegeOutpost || tile.dockId);

  const getBarbarianTargetPriority = (tile: Tile): number | null => {
    if (tile.terrain !== "LAND" || tile.fort) return null;
    if (!tile.ownerId) return isBarbarianPriorityValueTile(tile) ? 5 : 6;
    if (!isOccupiedPlayerTile(tile)) return null;
    return tile.ownershipState === "FRONTIER" ? (isBarbarianPriorityValueTile(tile) ? 1 : 2) : isBarbarianPriorityValueTile(tile) ? 3 : 4;
  };

  const removeBarbarianAgent = (agentId: string): void => {
    const agent = barbarianAgents.get(agentId);
    if (!agent) return;
    barbarianAgents.delete(agentId);
    barbarianAgentByTileKey.delete(key(agent.x, agent.y));
  };

  const removeBarbarianAtTile = (tileKey: TileKey): void => {
    const agentId = barbarianAgentByTileKey.get(tileKey);
    if (agentId) removeBarbarianAgent(agentId);
  };

  const upsertBarbarianAgent = (agent: BarbarianAgent): void => {
    const existing = barbarianAgents.get(agent.id);
    if (existing) barbarianAgentByTileKey.delete(key(existing.x, existing.y));
    barbarianAgents.set(agent.id, agent);
    barbarianAgentByTileKey.set(key(agent.x, agent.y), agent.id);
  };

  const spawnBarbarianAgentAt = (x: number, y: number, progress = 0): BarbarianAgent => {
    const agent: BarbarianAgent = { id: `barb-${crypto.randomUUID()}`, x, y, progress, lastActionAt: now(), nextActionAt: now() + BARBARIAN_ACTION_INTERVAL_MS };
    upsertBarbarianAgent(agent);
    return agent;
  };

  const isNearPlayerTerritory = (x: number, y: number, radius: number): boolean => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const tile = playerTile(x + dx, y + dy);
        if (tile.ownerId && tile.ownerId !== BARBARIAN_OWNER_ID) return true;
      }
    }
    return false;
  };

  const spawnInitialBarbarians = (): void => {
    const target = Math.max(20, Math.floor(INITIAL_BARBARIAN_COUNT * ((WORLD_WIDTH * WORLD_HEIGHT) / 1_000_000)));
    for (let spawned = 0, attempts = 0; spawned < target && attempts < target * 200; attempts += 1) {
      const x = Math.floor(Math.random() * WORLD_WIDTH);
      const y = Math.floor(Math.random() * WORLD_HEIGHT);
      const tile = playerTile(x, y);
      if (tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId || tile.fort || tile.siegeOutpost || isNearPlayerTerritory(x, y, 2)) continue;
      updateOwnership(x, y, BARBARIAN_OWNER_ID, "BARBARIAN");
      spawnBarbarianAgentAt(x, y);
      spawned += 1;
    }
  };

  const isOutOfSightOfAllPlayers = (x: number, y: number): boolean => [...players.values()].every((player) => !visible(player, x, y));
  const isValidBarbarianSpawnTile = (x: number, y: number): boolean => {
    const tile = playerTile(x, y);
    return tile.terrain === "LAND" && !tile.ownerId && !tile.town && !tile.dockId && !tile.fort && !tile.siegeOutpost;
  };

  const maintainBarbarianPopulation = (): void => {
    if (!hasOnlinePlayers()) return;
    const wanted = Math.min(Math.max(0, MIN_ACTIVE_BARBARIAN_AGENTS - barbarianAgents.size), BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS);
    for (let spawned = 0, attempts = 0; spawned < wanted && attempts < wanted * 600; attempts += 1) {
      const x = Math.floor(Math.random() * WORLD_WIDTH);
      const y = Math.floor(Math.random() * WORLD_HEIGHT);
      if (!isValidBarbarianSpawnTile(x, y) || !isOutOfSightOfAllPlayers(x, y)) continue;
      updateOwnership(x, y, BARBARIAN_OWNER_ID, "BARBARIAN");
      spawnBarbarianAgentAt(x, y, 0);
      spawned += 1;
      deps.logBarbarianEvent(`spawn maintenance @ ${x},${y}`);
    }
  };

  const enqueueBarbarianMaintenance = (): void => {
    if (!hasQueuedSystemSimulationCommand((job: any) => job.command.type === "BARBARIAN_MAINTENANCE")) enqueueSystemSimulationCommand({ type: "BARBARIAN_MAINTENANCE" });
  };

  const barbarianDefenseScore = (tile: Tile | undefined): number => {
    if (!tile) return 0;
    if (!tile.ownerId || tile.ownerId === BARBARIAN_OWNER_ID) return 0;
    const defender = players.get(tile.ownerId);
    if (!defender) return 10;
    const tk = key(tile.x, tile.y);
    return 10 * defender.mods.defense * playerDefensiveness(defender) * fortDefenseMultAt(defender.id, tk) * (docksByTile.has(tk) ? deps.DOCK_DEFENSE_MULT : 1) * settledDefenseMultiplierForTarget(defender.id, tile) * ownershipDefenseMultiplierForTarget(tile);
  };

  const chooseBarbarianTarget = (agent: BarbarianAgent): Tile | undefined => {
    const candidates = adjacentNeighbors(agent.x, agent.y)
      .filter((tile): tile is Tile => Boolean(tile))
      .map((tile) => ({ tile, priority: getBarbarianTargetPriority(tile), defenseScore: barbarianDefenseScore(tile), random: Math.random() }))
      .filter((entry) => entry.priority !== null) as Array<{ tile: Tile; priority: number; defenseScore: number; random: number }>;
    candidates.sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.defenseScore !== b.defenseScore ? a.defenseScore - b.defenseScore : a.random - b.random));
    return candidates[0]?.tile;
  };

  const exportDockPairs = (): Array<{ ax: number; ay: number; bx: number; by: number }> => {
    const out: Array<{ ax: number; ay: number; bx: number; by: number }> = [];
    const seen = new Set<string>();
    for (const dock of dockById.values()) {
      for (const dockId of dock.connectedDockIds?.length ? dock.connectedDockIds : dock.pairedDockId ? [dock.pairedDockId] : []) {
        const pair = dockById.get(dockId);
        if (!pair) continue;
        const edgeKey = dock.dockId < pair.dockId ? `${dock.dockId}|${pair.dockId}` : `${pair.dockId}|${dock.dockId}`;
        if (seen.has(edgeKey)) continue;
        seen.add(edgeKey);
        const [ax, ay] = parseKey(dock.tileKey);
        const [bx, by] = parseKey(pair.tileKey);
        out.push({ ax, ay, bx, by });
      }
    }
    return out;
  };

  const applyBreachShockAround = (x: number, y: number, defenderId: string): void => {
    for (const [nxRaw, nyRaw] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]] as Array<[number, number]>) {
      const nx = wrapX(nxRaw, WORLD_WIDTH);
      const ny = wrapY(nyRaw, WORLD_HEIGHT);
      const tile = playerTile(nx, ny);
      if (tile.terrain !== "LAND" || tile.ownerId !== defenderId || tile.ownershipState !== "SETTLED") continue;
      breachShockByTile.set(key(nx, ny), { ownerId: defenderId, expiresAt: now() + BREACH_SHOCK_MS });
      markSummaryChunkDirtyAtTile(nx, ny);
    }
  };

  return {
    regenerateStrategicWorld,
    dockLinkedDestinations,
    dockLinkedTileKeysByDockTileKey,
    dockLinkedTileKeys,
    validDockCrossingTarget,
    findOwnedDockOriginForCrossing,
    adjacentNeighbors,
    removeBarbarianAgent,
    removeBarbarianAtTile,
    upsertBarbarianAgent,
    spawnBarbarianAgentAt,
    spawnInitialBarbarians,
    maintainBarbarianPopulation,
    enqueueBarbarianMaintenance,
    chooseBarbarianTarget,
    exportDockPairs,
    applyBreachShockAround
  };
};
