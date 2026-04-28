import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

type TileDelta = NonNullable<PlayerSubscriptionSnapshot["tiles"][number]>;
type WorldStatusSnapshot = NonNullable<PlayerSubscriptionSnapshot["worldStatus"]>;
type PlayerStateSnapshot = NonNullable<PlayerSubscriptionSnapshot["player"]>;

const tileKeyFor = (x: number, y: number): string => `${x},${y}`;

export const applyTileDeltasToSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  tileDeltas: TileDelta[]
): PlayerSubscriptionSnapshot => {
  const tiles = new Map<string, PlayerSubscriptionSnapshot["tiles"][number]>(
    snapshot.tiles.map((tile) => [tileKeyFor(tile.x, tile.y), tile] as const)
  );
  for (const tileDelta of tileDeltas) {
    const tileKey = tileKeyFor(tileDelta.x, tileDelta.y);
    const existing: PlayerSubscriptionSnapshot["tiles"][number] = tiles.get(tileKey) ?? { x: tileDelta.x, y: tileDelta.y };
    tiles.set(tileKey, {
      ...existing,
      ...tileDelta
    });
  }
  return {
    ...snapshot,
    tiles: [...tiles.values()].sort((left, right) => (left.x - right.x) || (left.y - right.y))
  };
};

export const applyPlayerMessageToSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  payload: Record<string, unknown>
): PlayerSubscriptionSnapshot => {
  if (payload.type === "GLOBAL_STATUS_UPDATE") {
    const previousWorldStatus = snapshot.worldStatus;
    return {
      ...snapshot,
      worldStatus: {
        leaderboard:
          (payload.leaderboard as WorldStatusSnapshot["leaderboard"]) ??
          previousWorldStatus?.leaderboard ?? {
            overall: [],
            byTiles: [],
            byIncome: [],
            byTechs: []
          },
        seasonVictory:
          (payload.seasonVictory as WorldStatusSnapshot["seasonVictory"]) ??
          previousWorldStatus?.seasonVictory ??
          []
      }
    };
  }

  if (payload.type === "PLAYER_UPDATE" && snapshot.player) {
    const currentPlayer = snapshot.player as PlayerStateSnapshot;
    return {
      ...snapshot,
      player: {
        ...currentPlayer,
        ...(typeof payload.gold === "number" ? { gold: payload.gold } : {}),
        ...(typeof payload.manpower === "number" ? { manpower: payload.manpower } : {}),
        ...(typeof payload.manpowerCap === "number" ? { manpowerCap: payload.manpowerCap } : {}),
        ...(typeof payload.incomePerMinute === "number" ? { incomePerMinute: payload.incomePerMinute } : {}),
        ...(payload.strategicResources && typeof payload.strategicResources === "object"
          ? { strategicResources: payload.strategicResources as PlayerStateSnapshot["strategicResources"] }
          : {}),
        ...(payload.strategicProductionPerMinute && typeof payload.strategicProductionPerMinute === "object"
          ? { strategicProductionPerMinute: payload.strategicProductionPerMinute as PlayerStateSnapshot["strategicProductionPerMinute"] }
          : {}),
        ...(typeof payload.economyBreakdown === "object" && payload.economyBreakdown !== null
          ? { economyBreakdown: payload.economyBreakdown as Record<string, unknown> }
          : {}),
        ...(typeof payload.upkeepPerMinute === "object" && payload.upkeepPerMinute !== null
          ? { upkeepPerMinute: payload.upkeepPerMinute as NonNullable<PlayerStateSnapshot["upkeepPerMinute"]> }
          : {}),
        ...(typeof payload.upkeepLastTick === "object" && payload.upkeepLastTick !== null
          ? { upkeepLastTick: payload.upkeepLastTick as Record<string, unknown> }
          : {}),
        ...(typeof payload.developmentProcessLimit === "number" ? { developmentProcessLimit: payload.developmentProcessLimit } : {}),
        ...(typeof payload.activeDevelopmentProcessCount === "number"
          ? { activeDevelopmentProcessCount: payload.activeDevelopmentProcessCount }
          : {}),
        ...(Array.isArray(payload.pendingSettlements)
          ? { pendingSettlements: payload.pendingSettlements as PlayerStateSnapshot["pendingSettlements"] }
          : {}),
        ...(Array.isArray(payload.techIds) ? { techIds: payload.techIds as string[] } : {}),
        ...(Array.isArray(payload.domainIds) ? { domainIds: payload.domainIds as string[] } : {})
      }
    };
  }

  return snapshot;
};
