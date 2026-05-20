import { isChosenTrickleResource } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

type TileDelta = NonNullable<PlayerSubscriptionSnapshot["tiles"][number]>;
type WorldStatusSnapshot = NonNullable<PlayerSubscriptionSnapshot["worldStatus"]>;
type PlayerStateSnapshot = NonNullable<PlayerSubscriptionSnapshot["player"]>;

const tileKeyFor = (x: number, y: number): string => `${x},${y}`;

const playerProgressionFieldsFromPayload = (
  payload: Record<string, unknown>
): Partial<Pick<PlayerStateSnapshot, "techIds" | "domainIds" | "mods" | "modBreakdown" | "chosenTrickleResource">> => {
  const trickle = payload.chosenTrickleResource;
  return {
    ...(Array.isArray(payload.techIds) ? { techIds: payload.techIds as string[] } : {}),
    ...(Array.isArray(payload.domainIds) ? { domainIds: payload.domainIds as string[] } : {}),
    ...(payload.mods && typeof payload.mods === "object" ? { mods: payload.mods as NonNullable<PlayerStateSnapshot["mods"]> } : {}),
    ...(payload.modBreakdown && typeof payload.modBreakdown === "object"
      ? { modBreakdown: payload.modBreakdown as NonNullable<PlayerStateSnapshot["modBreakdown"]> }
      : {}),
    ...(isChosenTrickleResource(trickle) ? { chosenTrickleResource: trickle } : {})
  };
};

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
        ...(typeof payload.manpowerRegenPerMinute === "number" ? { manpowerRegenPerMinute: payload.manpowerRegenPerMinute } : {}),
        ...(payload.manpowerBreakdown && typeof payload.manpowerBreakdown === "object"
          ? { manpowerBreakdown: payload.manpowerBreakdown as NonNullable<PlayerStateSnapshot["manpowerBreakdown"]> }
          : {}),
        ...(typeof payload.incomePerMinute === "number" ? { incomePerMinute: payload.incomePerMinute } : {}),
        ...(payload.strategicResources && typeof payload.strategicResources === "object"
          ? { strategicResources: payload.strategicResources as PlayerStateSnapshot["strategicResources"] }
          : {}),
        ...(payload.strategicProductionPerMinute && typeof payload.strategicProductionPerMinute === "object"
          ? { strategicProductionPerMinute: payload.strategicProductionPerMinute as PlayerStateSnapshot["strategicProductionPerMinute"] }
          : {}),
        ...(typeof payload.developmentProcessLimit === "number" ? { developmentProcessLimit: payload.developmentProcessLimit } : {}),
        ...(typeof payload.activeDevelopmentProcessCount === "number"
          ? { activeDevelopmentProcessCount: payload.activeDevelopmentProcessCount }
          : {}),
        ...(Array.isArray(payload.pendingSettlements)
          ? {
              pendingSettlements: payload.pendingSettlements as PlayerStateSnapshot["pendingSettlements"]
            }
          : {}),
        ...(Array.isArray(payload.autoSettlementQueue)
          ? { autoSettlementQueue: payload.autoSettlementQueue as NonNullable<PlayerStateSnapshot["autoSettlementQueue"]> }
          : {}),
        ...playerProgressionFieldsFromPayload(payload)
      }
    };
  }

  if ((payload.type === "TECH_UPDATE" || payload.type === "DOMAIN_UPDATE") && snapshot.player) {
    return {
      ...snapshot,
      player: {
        ...snapshot.player,
        ...(typeof payload.gold === "number" ? { gold: payload.gold } : {}),
        ...(payload.strategicResources && typeof payload.strategicResources === "object"
          ? { strategicResources: payload.strategicResources as PlayerStateSnapshot["strategicResources"] }
          : {}),
        ...(typeof payload.incomePerMinute === "number" ? { incomePerMinute: payload.incomePerMinute } : {}),
        ...playerProgressionFieldsFromPayload(payload)
      }
    };
  }

  return snapshot;
};
