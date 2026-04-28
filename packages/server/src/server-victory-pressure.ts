// @ts-nocheck
export const createServerVictoryPressure = (deps) => {
  const {
    now,
    townsByTile,
    SEASON_VICTORY_TOWN_CONTROL_SHARE,
    SEASON_VICTORY_SETTLED_TERRITORY_SHARE,
    VICTORY_PRESSURE_DEFS,
    players,
    HOLD_START_BROADCAST_DELAY_MS,
    HOLD_REMAINING_BROADCAST_HOURS,
    FINAL_PUSH_MS,
    crypto,
    strategicReplayEvents,
    STRATEGIC_REPLAY_LIMIT,
    broadcast,
    sendToPlayer,
    GLOBAL_STATUS_CACHE_TTL_MS,
    getSeasonWinner,
    setSeasonWinner,
    getActiveSeason,
    victoryPressureById,
    uniqueLeader,
    leadingPair,
    computeLeaderboardSnapshot,
    collectPlayerCompetitionMetrics,
    worldResourceTileCounts,
    controlledResourceTileCounts,
    islandLandCounts,
    claimableLandTileCount,
    continentalFootprintProgressForPlayer,
    SEASON_VICTORY_ECONOMY_MIN_INCOME,
    SEASON_VICTORY_ECONOMY_LEAD_MULT
  } = deps;

  const uniqueLeaderFromMetrics = (metrics: PlayerCompetitionMetrics[], selectValue: (metric: PlayerCompetitionMetrics) => number): { playerId?: string; value: number } => {
    return uniqueLeader(metrics.map((metric) => ({ playerId: metric.playerId, value: selectValue(metric) })));
  };
  const getVictoryPressureTracker = (id: SeasonVictoryPathId): VictoryPressureTracker => {
    let tracker = victoryPressureById.get(id);
    if (!tracker) {
      tracker = {};
      victoryPressureById.set(id, tracker);
    }
    return tracker;
  };
  const currentSeasonWinner = (): SeasonWinnerView | undefined => getSeasonWinner();
  const isFinalPushActive = (nowMs = now()): boolean => getActiveSeason().endAt - nowMs <= FINAL_PUSH_MS;
  const pushStrategicReplayEvent = (event: Omit<StrategicReplayEvent, "id">): StrategicReplayEvent => {
    const fullEvent: StrategicReplayEvent = { ...event, id: crypto.randomUUID() };
    strategicReplayEvents.push(fullEvent);
    while (strategicReplayEvents.length > STRATEGIC_REPLAY_LIMIT) strategicReplayEvents.shift();
    broadcast({ type: "STRATEGIC_REPLAY_EVENT", event: fullEvent });
    return fullEvent;
  };
  const computeVictoryPressureObjectives = (): SeasonVictoryObjectiveView[] => {
    const nowMs = now();
    const totalTownCount = Math.max(1, townsByTile.size);
    const townTarget = Math.max(1, Math.ceil(totalTownCount * SEASON_VICTORY_TOWN_CONTROL_SHARE));
    const settledTarget = Math.max(1, Math.ceil(claimableLandTileCount() * SEASON_VICTORY_SETTLED_TERRITORY_SHARE));
    const metrics = collectPlayerCompetitionMetrics(nowMs);
    const totalResourceCounts = worldResourceTileCounts();
    const allIslands = islandLandCounts();
    return VICTORY_PRESSURE_DEFS.map((def) => {
      const tracker = getVictoryPressureTracker(def.id);
      let leaderPlayerId: string | undefined;
      let leaderValue = 0;
      let conditionMet = false, progressLabel = "", thresholdLabel = "";
  
      if (def.id === "TOWN_CONTROL") {
        const leader = uniqueLeaderFromMetrics(metrics, (metric) => metric.controlledTowns);
        leaderPlayerId = leader.playerId;
        leaderValue = leader.value;
        conditionMet = Boolean(leaderPlayerId && leaderValue >= townTarget);
        progressLabel = `${leaderValue}/${townTarget} towns`;
        thresholdLabel = `Need ${townTarget} towns`;
      } else if (def.id === "SETTLED_TERRITORY") {
        const leader = uniqueLeaderFromMetrics(metrics, (metric) => metric.settledTiles);
        leaderPlayerId = leader.playerId;
        leaderValue = leader.value;
        conditionMet = Boolean(leaderPlayerId && leaderValue >= settledTarget);
        progressLabel = `${leaderValue}/${settledTarget} settled land`;
        thresholdLabel = `Need ${settledTarget} settled land tiles`;
      } else if (def.id === "ECONOMIC_HEGEMONY") {
        const pair = leadingPair(metrics.map((metric) => ({ playerId: metric.playerId, value: metric.incomePerMinute })));
        leaderPlayerId = pair.tied ? undefined : pair.leaderPlayerId;
        leaderValue = pair.leaderValue;
        const incomeThreshold = pair.runnerUpValue <= 0 ? Number.POSITIVE_INFINITY : pair.runnerUpValue * SEASON_VICTORY_ECONOMY_LEAD_MULT;
        conditionMet = Boolean(
          leaderPlayerId &&
            !pair.tied &&
            leaderValue >= SEASON_VICTORY_ECONOMY_MIN_INCOME &&
            pair.runnerUpValue > 0 &&
            leaderValue >= incomeThreshold
        );
        progressLabel = `${leaderValue.toFixed(1)} gold/m vs ${pair.runnerUpValue.toFixed(1)}`;
        thresholdLabel = `Need at least ${SEASON_VICTORY_ECONOMY_MIN_INCOME} gold/m and 33% lead`;
      } else if (def.id === "RESOURCE_MONOPOLY") {
        let bestLeaderId: string | undefined;
        let bestOwned = 0;
        let bestTotal = 0;
        let bestResource: ResourceType | undefined;
        for (const metric of metrics) {
          const controlled = controlledResourceTileCounts(metric.playerId);
          for (const resource of Object.keys(totalResourceCounts) as ResourceType[]) {
            const total = totalResourceCounts[resource];
            if ((total ?? 0) <= 0) continue;
            const owned = controlled[resource] ?? 0;
            if (owned > bestOwned) {
              bestLeaderId = metric.playerId;
              bestOwned = owned;
              bestTotal = total ?? 0;
              bestResource = resource;
            }
          }
        }
        leaderPlayerId = bestLeaderId;
        leaderValue = bestOwned;
        conditionMet = Boolean(leaderPlayerId && bestResource && bestTotal > 0 && bestOwned >= bestTotal);
        progressLabel = bestResource ? `${bestOwned}/${bestTotal} ${bestResource}` : "No resource leader";
        thresholdLabel = "Need 100% control of one resource type";
      } else {
        let bestLeaderId: string | undefined;
        let bestQualifiedCount = 0;
        let bestWeakestQualifiedRatio = -1;
        let bestWeakestQualifiedOwned = 0;
        let bestWeakestQualifiedTotal = 0;
        for (const metric of metrics) {
          const progress = continentalFootprintProgressForPlayer(metric.playerId, allIslands);
          if (progress.totalIslands === 0) continue;
          if (
            progress.qualifiedCount > bestQualifiedCount ||
            (progress.qualifiedCount === bestQualifiedCount &&
              (progress.weakestQualifiedRatio > bestWeakestQualifiedRatio ||
                (progress.weakestQualifiedRatio === bestWeakestQualifiedRatio && metric.playerId < (bestLeaderId ?? "~"))))
          ) {
            bestQualifiedCount = progress.qualifiedCount;
            bestWeakestQualifiedRatio = progress.weakestQualifiedRatio;
            bestWeakestQualifiedOwned = progress.weakestQualifiedOwned;
            bestWeakestQualifiedTotal = progress.weakestQualifiedTotal;
            bestLeaderId = metric.playerId;
          }
        }
        const totalIslands = Math.max(1, [...allIslands.values()].filter((count) => count > 0).length);
        leaderPlayerId = bestLeaderId;
        leaderValue = bestQualifiedCount;
        conditionMet = Boolean(leaderPlayerId && bestQualifiedCount >= totalIslands && totalIslands > 0);
        const bestPct = Math.round(bestWeakestQualifiedRatio * 100);
        progressLabel =
          bestQualifiedCount > 0 && bestWeakestQualifiedTotal > 0
            ? `${bestQualifiedCount}/${totalIslands} islands at 10%+ settled · weakest island ${bestPct}% (${bestWeakestQualifiedOwned}/${bestWeakestQualifiedTotal})`
            : `${bestQualifiedCount}/${totalIslands} islands at 10%+ settled`;
        thresholdLabel = "Need 10% settled land on every island";
      }
  
      const winner = currentSeasonWinner();
      const holdRemainingSeconds =
        !winner &&
        conditionMet &&
        tracker.leaderPlayerId === leaderPlayerId &&
        tracker.holdStartedAt
          ? Math.max(0, Math.ceil((tracker.holdStartedAt + def.holdDurationSeconds * 1000 - nowMs) / 1000))
          : undefined;
      const statusLabel = winner
        ? winner.objectiveId === def.id
          ? `Winner crowned: ${winner.playerName}`
          : "Season already decided"
        : conditionMet
          ? holdRemainingSeconds !== undefined
            ? `Holding · ${Math.max(0, Math.ceil(holdRemainingSeconds / 3600))}h left`
            : "Threshold met"
          : leaderValue > 0
            ? "Pressure building"
            : "No contender";
      const view: SeasonVictoryObjectiveView = {
        id: def.id,
        name: def.name,
        description: def.description,
        leaderName: leaderPlayerId ? players.get(leaderPlayerId)?.name ?? leaderPlayerId.slice(0, 8) : leaderValue > 0 ? "Contested" : "No leader",
        progressLabel,
        thresholdLabel,
        holdDurationSeconds: def.holdDurationSeconds,
        statusLabel,
        conditionMet
      };
      if (leaderPlayerId !== undefined) view.leaderPlayerId = leaderPlayerId;
      if (holdRemainingSeconds !== undefined) view.holdRemainingSeconds = holdRemainingSeconds;
      return view;
    });
  };
  
  let cachedLeaderboardSnapshot: LeaderboardSnapshotView = {
    overall: [],
    selfOverall: undefined,
    selfByTiles: undefined,
    selfByIncome: undefined,
    selfByTechs: undefined,
    byTiles: [],
    byIncome: [],
    byTechs: []
  };
  let cachedVictoryPressureObjectives: SeasonVictoryObjectiveView[] = [], globalStatusCacheExpiresAt = 0, lastGlobalStatusBroadcastSig = "";
  
  const refreshGlobalStatusCache = (force = false): void => {
    const nowMs = now();
    if (!force && nowMs < globalStatusCacheExpiresAt) return;
    cachedLeaderboardSnapshot = computeLeaderboardSnapshot();
    cachedVictoryPressureObjectives = computeVictoryPressureObjectives();
    globalStatusCacheExpiresAt = nowMs + GLOBAL_STATUS_CACHE_TTL_MS;
  };
  
  const currentLeaderboardSnapshot = (): LeaderboardSnapshotView => {
    refreshGlobalStatusCache(false);
    return cachedLeaderboardSnapshot;
  };
  
  const currentVictoryPressureObjectives = (): SeasonVictoryObjectiveView[] => {
    refreshGlobalStatusCache(false);
    return cachedVictoryPressureObjectives;
  };
  const leaderboardSnapshotForPlayer = (playerId: string | undefined): LeaderboardSnapshotView => {
    const base = cachedLeaderboardSnapshot;
    if (!playerId) return { ...base, selfOverall: undefined, selfByTiles: undefined, selfByIncome: undefined, selfByTechs: undefined };
    const rows = collectPlayerCompetitionMetrics().map((metric) => ({
      id: metric.playerId,
      name: metric.name,
      tiles: metric.settledTiles,
      incomePerMinute: metric.incomePerMinute,
      techs: metric.techs,
      score: metric.settledTiles * 1 + metric.incomePerMinute * 3 + metric.techs * 8
    }));
    const ranked = rows
      .sort((a, b) => b.score - a.score || b.tiles - a.tiles || b.incomePerMinute - a.incomePerMinute || b.techs - a.techs || a.id.localeCompare(b.id))
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    const rankMetricEntries = (
      valueFor,
      tieBreak = () => 0
    ) =>
      [...rows]
        .sort((a, b) => valueFor(b) - valueFor(a) || tieBreak(a, b) || a.id.localeCompare(b.id))
        .map((entry, index) => ({ id: entry.id, name: entry.name, value: valueFor(entry), rank: index + 1 }));
    const selfOverall = base.overall.some((entry) => entry.id === playerId) ? undefined : ranked.find((entry) => entry.id === playerId);
    const selfByTiles = base.byTiles.some((entry) => entry.id === playerId)
      ? undefined
      : rankMetricEntries((row) => row.tiles, (a, b) => b.incomePerMinute - a.incomePerMinute || b.techs - a.techs).find((entry) => entry.id === playerId);
    const selfByIncome = base.byIncome.some((entry) => entry.id === playerId)
      ? undefined
      : rankMetricEntries((row) => row.incomePerMinute, (a, b) => b.tiles - a.tiles || b.techs - a.techs).find((entry) => entry.id === playerId);
    const selfByTechs = base.byTechs.some((entry) => entry.id === playerId)
      ? undefined
      : rankMetricEntries((row) => row.techs, (a, b) => b.tiles - a.tiles || b.incomePerMinute - a.incomePerMinute).find((entry) => entry.id === playerId);
    return { ...base, selfOverall, selfByTiles, selfByIncome, selfByTechs };
  };
  
  const seasonVictorySelfProgressLabel = (
    playerId: string,
    objectiveId: SeasonVictoryPathId,
    deps?: { metrics?: PlayerCompetitionMetrics[]; totalResourceCounts?: Record<ResourceType, number>; allIslands?: Map<number, number> }
  ): string | undefined => {
    const metrics = deps?.metrics ?? collectPlayerCompetitionMetrics();
    const metric = metrics.find((entry) => entry.playerId === playerId);
    if (!metric) return undefined;
    const totalTownCount = Math.max(1, townsByTile.size);
    const townTarget = Math.max(1, Math.ceil(totalTownCount * SEASON_VICTORY_TOWN_CONTROL_SHARE));
    const settledTarget = Math.max(1, Math.ceil(claimableLandTileCount() * SEASON_VICTORY_SETTLED_TERRITORY_SHARE));
    const totalResourceCounts = deps?.totalResourceCounts ?? worldResourceTileCounts();
    const allIslands = deps?.allIslands ?? islandLandCounts();
  
    if (objectiveId === "TOWN_CONTROL") return `${metric.controlledTowns}/${townTarget} towns`;
    if (objectiveId === "SETTLED_TERRITORY") return `${metric.settledTiles}/${settledTarget} settled land`;
    if (objectiveId === "ECONOMIC_HEGEMONY") return `${metric.incomePerMinute.toFixed(1)} gold/m`;
    if (objectiveId === "RESOURCE_MONOPOLY") {
      const controlled = controlledResourceTileCounts(playerId);
      let bestResource: ResourceType | undefined;
      let bestOwned = 0;
      let bestTotal = 0;
      for (const resource of Object.keys(totalResourceCounts) as ResourceType[]) {
        const total = totalResourceCounts[resource] ?? 0;
        if (total <= 0) continue;
        const owned = controlled[resource] ?? 0;
        if (owned > bestOwned) {
          bestOwned = owned;
          bestTotal = total;
          bestResource = resource;
        }
      }
      return bestResource ? `${bestOwned}/${bestTotal} ${bestResource}` : "No resource control";
    }
  
    const progress = continentalFootprintProgressForPlayer(playerId, allIslands);
    return progress.qualifiedCount > 0 && progress.weakestQualifiedTotal > 0
      ? `${progress.qualifiedCount}/${progress.totalIslands} islands at 10%+ settled · weakest island ${Math.round(progress.weakestQualifiedRatio * 100)}% (${progress.weakestQualifiedOwned}/${progress.weakestQualifiedTotal})`
      : `${progress.qualifiedCount}/${progress.totalIslands} islands at 10%+ settled`;
  };
  
  const seasonVictoryObjectivesForPlayer = (playerId: string | undefined): SeasonVictoryObjectiveView[] => {
    const objectives = currentVictoryPressureObjectives();
    if (!playerId) return objectives;
    const metrics = collectPlayerCompetitionMetrics();
    const totalResourceCounts = worldResourceTileCounts();
    const allIslands = islandLandCounts();
    return objectives.map((objective) => {
      if (objective.leaderPlayerId === playerId) return objective;
      const selfProgressLabel = seasonVictorySelfProgressLabel(playerId, objective.id, { metrics, totalResourceCounts, allIslands });
      return selfProgressLabel ? { ...objective, selfProgressLabel } : objective;
    });
  };
  
  const globalStatusBroadcastSignature = (): string =>
    JSON.stringify({
      leaderboard: cachedLeaderboardSnapshot,
      seasonVictory: cachedVictoryPressureObjectives,
      seasonWinner: currentSeasonWinner()
    });
  
  const broadcastGlobalStatusUpdate = (force = false): void => {
    refreshGlobalStatusCache(force);
    const nextSig = globalStatusBroadcastSignature();
    if (!force && nextSig === lastGlobalStatusBroadcastSig) return;
    lastGlobalStatusBroadcastSig = nextSig;
    for (const player of players.values()) {
      sendToPlayer(player.id, {
        type: "GLOBAL_STATUS_UPDATE",
        leaderboard: leaderboardSnapshotForPlayer(player.id),
        seasonVictory: seasonVictoryObjectivesForPlayer(player.id),
        seasonWinner: currentSeasonWinner()
      });
    }
  };
  
  const broadcastVictoryPressureUpdate = (announcement?: string): void => {
    refreshGlobalStatusCache(true);
    lastGlobalStatusBroadcastSig = globalStatusBroadcastSignature();
    for (const player of players.values()) {
      sendToPlayer(player.id, {
        type: "SEASON_VICTORY_UPDATE",
        objectives: seasonVictoryObjectivesForPlayer(player.id),
        announcement,
        seasonWinner: currentSeasonWinner()
      });
    }
  };
  
  const crownSeasonWinner = (playerId: string, def: VictoryPressureDefinition): void => {
    const existingWinner = currentSeasonWinner();
    if (existingWinner) return;
    const player = players.get(playerId);
    if (!player) return;
    const nextWinner: SeasonWinnerView = {
      playerId,
      playerName: player.name,
      crownedAt: now(),
      objectiveId: def.id,
      objectiveName: def.name
    };
    setSeasonWinner(nextWinner);
    pushStrategicReplayEvent({
      at: nextWinner.crownedAt,
      type: "WINNER",
      label: `${player.name} won the season via ${def.name}`,
      playerId,
      playerName: player.name,
      objectiveId: def.id,
      objectiveName: def.name,
      isBookmark: true
    });
    refreshGlobalStatusCache(true);
    lastGlobalStatusBroadcastSig = globalStatusBroadcastSignature();
    broadcast({
      type: "SEASON_WINNER_CROWNED",
      winner: nextWinner,
      leaderboard: cachedLeaderboardSnapshot,
      objectives: cachedVictoryPressureObjectives
    });
  };
  
  const evaluateVictoryPressure = (): void => {
    if (currentSeasonWinner()) {
      refreshGlobalStatusCache(false);
      return;
    }
    const nowMs = now();
    const finalPushActive = isFinalPushActive(nowMs);
    const totalTownCount = Math.max(1, townsByTile.size);
    const townTarget = Math.max(1, Math.ceil(totalTownCount * SEASON_VICTORY_TOWN_CONTROL_SHARE));
    const settledTarget = Math.max(1, Math.ceil(claimableLandTileCount() * SEASON_VICTORY_SETTLED_TERRITORY_SHARE));
    const metrics = collectPlayerCompetitionMetrics(nowMs);
    let crowned: SeasonWinnerView | undefined;
    let announcement: string | undefined;
  
    for (const def of VICTORY_PRESSURE_DEFS) {
      const tracker = getVictoryPressureTracker(def.id);
      const previousLeaderPlayerId = tracker.leaderPlayerId;
      let leaderPlayerId: string | undefined;
      let conditionMet = false;
  
      if (def.id === "TOWN_CONTROL") {
        const leader = uniqueLeaderFromMetrics(metrics, (metric) => metric.controlledTowns);
        leaderPlayerId = leader.playerId;
        conditionMet = Boolean(leaderPlayerId && leader.value >= townTarget);
      } else if (def.id === "SETTLED_TERRITORY") {
        const leader = uniqueLeaderFromMetrics(metrics, (metric) => metric.settledTiles);
        leaderPlayerId = leader.playerId;
        conditionMet = Boolean(leaderPlayerId && leader.value >= settledTarget);
      } else {
        const pair = leadingPair(metrics.map((metric) => ({ playerId: metric.playerId, value: metric.incomePerMinute })));
        leaderPlayerId = pair.tied ? undefined : pair.leaderPlayerId;
        conditionMet = Boolean(
          leaderPlayerId &&
            !pair.tied &&
            pair.leaderValue >= SEASON_VICTORY_ECONOMY_MIN_INCOME &&
            pair.runnerUpValue > 0 &&
            pair.leaderValue >= pair.runnerUpValue * SEASON_VICTORY_ECONOMY_LEAD_MULT
        );
      }
  
      if (!conditionMet || !leaderPlayerId) {
        if (tracker.holdAnnouncedAt && previousLeaderPlayerId) {
          const previousLeaderName = players.get(previousLeaderPlayerId)?.name ?? previousLeaderPlayerId.slice(0, 8);
          announcement = `${previousLeaderName} lost the ${def.name} victory hold.`;
          pushStrategicReplayEvent({
            at: nowMs,
            type: "HOLD_BREAK",
            label: `${previousLeaderName} lost the ${def.name} hold`,
            playerId: previousLeaderPlayerId,
            playerName: previousLeaderName,
            objectiveId: def.id,
            objectiveName: def.name,
            isBookmark: true
          });
        }
        delete tracker.leaderPlayerId;
        delete tracker.holdStartedAt;
        delete tracker.holdAnnouncedAt;
        delete tracker.lastRemainingMilestoneHours;
        continue;
      }
      if (tracker.leaderPlayerId !== leaderPlayerId) {
        tracker.leaderPlayerId = leaderPlayerId;
        tracker.holdStartedAt = nowMs;
        delete tracker.holdAnnouncedAt;
        delete tracker.lastRemainingMilestoneHours;
        if (finalPushActive) {
          const leaderName = players.get(leaderPlayerId)?.name ?? leaderPlayerId.slice(0, 8);
          announcement = `${leaderName} took the ${def.name} lead.`;
        }
        continue;
      }
      if (!tracker.holdStartedAt) {
        tracker.holdStartedAt = nowMs;
        delete tracker.holdAnnouncedAt;
        delete tracker.lastRemainingMilestoneHours;
        continue;
      }
      const holdElapsedMs = nowMs - tracker.holdStartedAt;
      const holdRemainingMs = Math.max(0, def.holdDurationSeconds * 1000 - holdElapsedMs);
      if (!tracker.holdAnnouncedAt && holdElapsedMs >= HOLD_START_BROADCAST_DELAY_MS) {
        const leaderName = players.get(leaderPlayerId)?.name ?? leaderPlayerId.slice(0, 8);
        announcement = `${leaderName} has started a ${def.name} victory hold.`;
        tracker.holdAnnouncedAt = nowMs;
        pushStrategicReplayEvent({
          at: nowMs,
          type: "HOLD_START",
          label: `${leaderName} started a ${def.name} hold`,
          playerId: leaderPlayerId,
          playerName: leaderName,
          objectiveId: def.id,
          objectiveName: def.name,
          isBookmark: true
        });
      } else if (tracker.holdAnnouncedAt) {
        for (const milestoneHours of HOLD_REMAINING_BROADCAST_HOURS) {
          if (holdRemainingMs > milestoneHours * 60 * 60_000) continue;
          if (tracker.lastRemainingMilestoneHours !== undefined && tracker.lastRemainingMilestoneHours <= milestoneHours) continue;
          const leaderName = players.get(leaderPlayerId)?.name ?? leaderPlayerId.slice(0, 8);
          announcement = `${leaderName} has ${milestoneHours}h left on ${def.name}.`;
          tracker.lastRemainingMilestoneHours = milestoneHours;
          break;
        }
      }
      if (nowMs - tracker.holdStartedAt < def.holdDurationSeconds * 1000) continue;
      crownSeasonWinner(leaderPlayerId, def);
      crowned = currentSeasonWinner();
      break;
    }
    broadcastVictoryPressureUpdate(crowned ? `${crowned.playerName} was crowned season winner via ${crowned.objectiveName}.` : announcement);
  };
  

  return { currentSeasonWinner, isFinalPushActive, pushStrategicReplayEvent, refreshGlobalStatusCache, currentLeaderboardSnapshot, currentVictoryPressureObjectives, leaderboardSnapshotForPlayer, seasonVictoryObjectivesForPlayer, broadcastGlobalStatusUpdate, broadcastVictoryPressureUpdate, evaluateVictoryPressure };
};
