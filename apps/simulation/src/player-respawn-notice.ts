import type { PlayerRespawnNotice, PlayerRespawnReasonCode, TileKey } from "@border-empires/shared";

export type PendingRespawnNoticeContext = {
  at: number;
  reasonCode: PlayerRespawnReasonCode;
  triggerEvent: string;
  previousTerritoryTiles: number;
  previousTerritoryStrength: number;
  previousExposure: number;
  wasEliminated: boolean;
  respawnPending: boolean;
  wasOnline?: boolean;
  previousHomeTileKey?: TileKey;
};

const reasonCopy = (
  playerName: string,
  context: PendingRespawnNoticeContext
): Pick<PlayerRespawnNotice, "title" | "summary" | "detail"> => {
  if (context.reasonCode === "eliminated") {
    return {
      title: "Your empire was respawned after elimination",
      summary: "The simulation detected that your empire no longer had a surviving foothold and moved you to a fresh starting settlement.",
      detail: `${playerName}'s previous empire state had ${context.previousTerritoryTiles} territory tiles when elimination recovery triggered.`
    };
  }
  if (context.reasonCode === "auth_recovery") {
    return {
      title: "Your empire was recovered during sign-in",
      summary: "Your account loaded into a non-playable empire state, so the simulation created a fresh starting settlement instead of leaving you stuck without a foothold.",
      detail: `${playerName}'s saved empire record did not contain a playable foothold at login time, so account recovery forced a respawn.`
    };
  }
  return {
    title: "Your empire was recovered during simulation startup",
    summary: "The simulation found your empire in a non-playable state while rebuilding the world and forced a respawn to keep the empire usable.",
    detail: `${playerName}'s saved empire record was repaired during startup because the world loaded without a playable foothold for this player.`
  };
};

export const buildRewritePlayerRespawnNotice = (args: {
  playerId: string;
  playerName: string;
  context: PendingRespawnNoticeContext;
  spawnTileKey: TileKey;
}): PlayerRespawnNotice => {
  const copy = reasonCopy(args.playerName, args.context);
  return {
    id: `${args.context.triggerEvent}:${args.playerId}:${args.context.at}`,
    at: args.context.at,
    reasonCode: args.context.reasonCode,
    triggerEvent: args.context.triggerEvent,
    playerId: args.playerId,
    playerName: args.playerName,
    previousTerritoryTiles: args.context.previousTerritoryTiles,
    previousTerritoryStrength: args.context.previousTerritoryStrength,
    previousExposure: args.context.previousExposure,
    wasEliminated: args.context.wasEliminated,
    respawnPending: args.context.respawnPending,
    ...(typeof args.context.wasOnline === "boolean" ? { wasOnline: args.context.wasOnline } : {}),
    ...(args.context.previousHomeTileKey ? { previousHomeTileKey: args.context.previousHomeTileKey } : {}),
    spawnTileKey: args.spawnTileKey,
    ...copy
  };
};
