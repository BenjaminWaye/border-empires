import type { Player, PlayerRespawnNotice, PlayerRespawnReasonCode, TileKey } from "@border-empires/shared";

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
  player: Player,
  context: PendingRespawnNoticeContext
): Pick<PlayerRespawnNotice, "title" | "summary" | "detail"> => {
  if (context.reasonCode === "eliminated") {
    return {
      title: "Your empire was respawned after elimination",
      summary: "The server detected that your empire no longer had a surviving foothold and moved you to a fresh starting settlement.",
      detail: `${player.name}'s previous empire state had ${context.previousTerritoryTiles} territory tiles and T/E ${context.previousTerritoryStrength}/${context.previousExposure} when elimination recovery triggered.`
    };
  }
  if (context.reasonCode === "auth_recovery") {
    return {
      title: "Your empire was recovered during sign-in",
      summary: "Your account loaded into a non-playable empire state, so the server created a fresh starting settlement instead of leaving you stuck without a playable foothold.",
      detail: `${player.name}'s saved empire record did not contain a playable foothold at login time, so account recovery forced a respawn.`
    };
  }
  return {
    title: "Your empire was recovered during server bootstrap",
    summary: "The server found your empire in a non-playable state while rebuilding the world and forced a respawn to keep the empire usable.",
    detail: `${player.name}'s saved empire record was repaired during startup because the world loaded without a playable foothold for this player.`
  };
};

export const buildPlayerRespawnNotice = (args: {
  player: Player;
  context: PendingRespawnNoticeContext;
  spawnTileKey: TileKey;
}): PlayerRespawnNotice => {
  const copy = reasonCopy(args.player, args.context);
  return {
    id: `${args.context.triggerEvent}:${args.player.id}:${args.context.at}`,
    at: args.context.at,
    reasonCode: args.context.reasonCode,
    triggerEvent: args.context.triggerEvent,
    playerId: args.player.id,
    playerName: args.player.name,
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
