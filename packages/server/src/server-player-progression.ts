// @ts-nocheck

export const createServerPlayerProgression = (deps) => {
  const {
    now,
    docksByTile,
    parseKey,
    playerTile,
    vendettaCaptureCountsByPlayer,
    getOrInitResourceCounts,
    temporaryAttackBuffUntilByPlayer,
    VENDETTA_ATTACK_BUFF_MS,
    getOrInitForcedReveal,
    dockById,
    visible,
    key,
    wrapX,
    wrapY,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    temporaryIncomeBuffUntilByPlayer,
    RESOURCE_CHAIN_BUFF_MS,
    getOrInitStrategicStocks,
    dynamicMissionsByPlayer,
    techById,
    domainById,
    playerManpowerCap,
    applyManpowerRegen,
    continentIdAt
  } = deps;

  const hasActiveResearch = (player: Player): boolean => Boolean(player.currentResearch && player.currentResearch.completesAt > now());
  
  const availableTechPicks = (player: Player): number => {
    return hasActiveResearch(player) ? 0 : 1;
  };
  
  const defaultMissionStats = (): MissionStats => ({
    neutralCaptures: 0,
    enemyCaptures: 0,
    combatWins: 0,
    maxTilesHeld: 0,
    maxSettledTilesHeld: 0,
    maxFarmsHeld: 0,
    maxContinentsHeld: 0,
    maxTechPicks: 0
  });
  
  const ensureMissionDefaults = (player: Player): void => {
    if (!player.missionStats) player.missionStats = defaultMissionStats();
    if (player.missionStats.maxSettledTilesHeld === undefined) player.missionStats.maxSettledTilesHeld = 0;
    if (player.missionStats.maxContinentsHeld === undefined) player.missionStats.maxContinentsHeld = 0;
    if (player.missionStats.maxTechPicks === undefined) player.missionStats.maxTechPicks = 0;
    if (!player.missions) player.missions = [];
  };
  
  const missionProgressValue = (player: Player, kind: MissionKind): number => {
    ensureMissionDefaults(player);
    if (kind === "NEUTRAL_CAPTURES") return player.missionStats.neutralCaptures;
    if (kind === "ENEMY_CAPTURES") return player.missionStats.enemyCaptures;
    if (kind === "COMBAT_WINS") return player.missionStats.combatWins;
    if (kind === "TILES_HELD") return player.missionStats.maxTilesHeld;
    if (kind === "SETTLED_TILES_HELD") return player.missionStats.maxSettledTilesHeld;
    if (kind === "FARMS_HELD") return player.missionStats.maxFarmsHeld;
    if (kind === "CONTINENTS_HELD") return player.missionStats.maxContinentsHeld;
    return player.missionStats.maxTechPicks;
  };
  
  const ownedDockCount = (playerId: string): number => {
    let n = 0;
    for (const d of docksByTile.values()) {
      const [x, y] = parseKey(d.tileKey);
      const t = playerTile(x, y);
      if (t.ownerId === playerId) n += 1;
    }
    return n;
  };
  
  const dynamicMissionProgress = (player: Player, mission: DynamicMissionDef): { progress: number; target: number } => {
    if (mission.type === "VENDETTA") {
      const target = 8;
      const map = vendettaCaptureCountsByPlayer.get(player.id);
      const progress = mission.targetPlayerId ? (map?.get(mission.targetPlayerId) ?? 0) : 0;
      return { progress: Math.min(target, progress), target };
    }
    if (mission.type === "DOCK_HUNT") {
      return { progress: ownedDockCount(player.id) >= 1 ? 1 : 0, target: mission.targetDockCount ?? 1 };
    }
    const pair = mission.focusResources;
    if (!pair) return { progress: 0, target: 16 };
    const counts = getOrInitResourceCounts(player.id);
    const a = Math.min(8, counts[pair[0]] ?? 0);
    const b = Math.min(8, counts[pair[1]] ?? 0);
    return { progress: a + b, target: 16 };
  };
  
  const applyDynamicMissionReward = (player: Player, mission: DynamicMissionDef): void => {
    if (mission.rewarded) return;
    if (mission.type === "VENDETTA") {
      temporaryAttackBuffUntilByPlayer.set(player.id, Math.max(temporaryAttackBuffUntilByPlayer.get(player.id) ?? 0, now() + VENDETTA_ATTACK_BUFF_MS));
    } else if (mission.type === "DOCK_HUNT") {
      const reveal = getOrInitForcedReveal(player.id);
      const candidates = [...dockById.values()].filter((d) => {
        const [x, y] = parseKey(d.tileKey);
        return !visible(player, x, y);
      });
      for (let i = 0; i < Math.min(3, candidates.length); i += 1) {
        const d = candidates[i]!;
        const [x, y] = parseKey(d.tileKey);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            reveal.add(key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)));
          }
        }
      }
    } else if (mission.focusResources) {
      temporaryIncomeBuffUntilByPlayer.set(player.id, { until: now() + RESOURCE_CHAIN_BUFF_MS, resources: mission.focusResources });
    }
    mission.rewarded = true;
  };
  
  const maybeIssueVendettaMission = (_player: Player, _targetPlayerId: string): void => {};
  
  const maybeIssueDockMission = (_player: Player): void => {};
  
  const maybeIssueResourceMission = (_player: Player, _captured?: ResourceType): void => {};
  
  const dynamicMissionPayload = (_player: Player): MissionState[] => [];
  
  const applyStaticMissionReward = (player: Player, mission: MissionState): void => {
    const stock = getOrInitStrategicStocks(player.id);
    if (mission.id === "frontier-scout") {
      stock.FOOD += 1;
      stock.SUPPLY += 1;
      return;
    }
    if (mission.id === "frontier-commander") {
      stock.IRON += 1;
      stock.CRYSTAL += 1;
      return;
    }
    if (mission.id === "regional-footprint") {
      stock.SHARD += 1;
    }
  };
  
  const syncMissionProgress = (_player: Player): boolean => false;
  
  const unlockMissions = (_player: Player): boolean => false;
  
  const continentsHeldCount = (player: Player): number => {
    const set = new Set<number>();
    for (const tk of player.territoryTiles) {
      const [x, y] = parseKey(tk);
      const cid = continentIdAt(x, y);
      if (cid !== undefined) set.add(cid);
    }
    return set.size;
  };
  
  const updateMissionState = (player: Player): boolean => {
    ensureMissionDefaults(player);
    player.missions = [];
    dynamicMissionsByPlayer.delete(player.id);
    return false;
  };
  
  const missionPayload = (_player: Player): MissionState[] => [];
  
  const normalizePlayerProgressionState = (player: Player): void => {
    player.techIds = new Set([...player.techIds].filter((id) => techById.has(id)));
    player.domainIds = new Set([...player.domainIds].filter((id) => domainById.has(id)));
    if (!Number.isFinite(player.manpower)) player.manpower = playerManpowerCap(player);
    if (!Number.isFinite(player.manpowerUpdatedAt)) player.manpowerUpdatedAt = now();
    applyManpowerRegen(player);
    if (player.currentResearch) {
      const researchingTech = techById.get(player.currentResearch.techId);
      if (!researchingTech || player.techIds.has(player.currentResearch.techId)) {
        delete player.currentResearch;
      }
    }
  };
  

  return {
    hasActiveResearch,
    availableTechPicks,
    defaultMissionStats,
    ensureMissionDefaults,
    missionProgressValue,
    dynamicMissionProgress,
    applyDynamicMissionReward,
    maybeIssueVendettaMission,
    maybeIssueDockMission,
    maybeIssueResourceMission,
    dynamicMissionPayload,
    applyStaticMissionReward,
    syncMissionProgress,
    unlockMissions,
    continentsHeldCount,
    updateMissionState,
    missionPayload,
    normalizePlayerProgressionState
  };
};
