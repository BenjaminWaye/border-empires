export const createAiIndexStore = <
  TTerritoryStructureCache,
  TPlanningStaticCache,
  TSettlementSelectorCache,
  TStrategicState
>() => {
  const territoryVersionByPlayer = new Map<string, number>();
  const territoryStructureByPlayer = new Map<string, TTerritoryStructureCache>();
  const planningStaticByPlayer = new Map<string, TPlanningStaticCache>();
  const settlementSelectorByPlayer = new Map<string, TSettlementSelectorCache>();
  const strategicStateByPlayer = new Map<string, TStrategicState>();

  const territoryVersionForPlayer = (playerId: string): number => territoryVersionByPlayer.get(playerId) ?? 0;

  const markTerritoryDirtyForPlayers = (playerIds: Iterable<string>): void => {
    for (const playerId of playerIds) {
      territoryVersionByPlayer.set(playerId, territoryVersionForPlayer(playerId) + 1);
      territoryStructureByPlayer.delete(playerId);
      planningStaticByPlayer.delete(playerId);
      settlementSelectorByPlayer.delete(playerId);
      strategicStateByPlayer.delete(playerId);
    }
  };

  const clearPlayer = (playerId: string): void => {
    territoryVersionByPlayer.delete(playerId);
    territoryStructureByPlayer.delete(playerId);
    planningStaticByPlayer.delete(playerId);
    settlementSelectorByPlayer.delete(playerId);
    strategicStateByPlayer.delete(playerId);
  };

  const clearAll = (): void => {
    territoryVersionByPlayer.clear();
    territoryStructureByPlayer.clear();
    planningStaticByPlayer.clear();
    settlementSelectorByPlayer.clear();
    strategicStateByPlayer.clear();
  };

  return {
    territoryStructureByPlayer,
    planningStaticByPlayer,
    settlementSelectorByPlayer,
    strategicStateByPlayer,
    territoryVersionForPlayer,
    markTerritoryDirtyForPlayers,
    clearPlayer,
    clearAll
  };
};
