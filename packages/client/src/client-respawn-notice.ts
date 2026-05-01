import type { ClientState } from "./client-state.js";
import type { FeedEntry, PlayerRespawnNotice } from "./client-types.js";

const isRespawnReasonCode = (value: unknown): value is PlayerRespawnNotice["reasonCode"] =>
  value === "eliminated" || value === "auth_recovery" || value === "startup_recovery";

export const normalizeRespawnNotice = (value: unknown): PlayerRespawnNotice | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || typeof input.title !== "string" || typeof input.summary !== "string") return undefined;
  if (typeof input.detail !== "string" || typeof input.playerId !== "string" || typeof input.playerName !== "string") return undefined;
  if (typeof input.at !== "number" || !isRespawnReasonCode(input.reasonCode) || typeof input.triggerEvent !== "string") return undefined;
  if (
    typeof input.previousTerritoryTiles !== "number" ||
    typeof input.previousTerritoryStrength !== "number" ||
    typeof input.previousExposure !== "number" ||
    typeof input.wasEliminated !== "boolean" ||
    typeof input.respawnPending !== "boolean"
  ) {
    return undefined;
  }
  return {
    id: input.id,
    at: input.at,
    reasonCode: input.reasonCode,
    title: input.title,
    summary: input.summary,
    detail: input.detail,
    triggerEvent: input.triggerEvent,
    playerId: input.playerId,
    playerName: input.playerName,
    previousTerritoryTiles: input.previousTerritoryTiles,
    previousTerritoryStrength: input.previousTerritoryStrength,
    previousExposure: input.previousExposure,
    wasEliminated: input.wasEliminated,
    respawnPending: input.respawnPending,
    ...(typeof input.wasOnline === "boolean" ? { wasOnline: input.wasOnline } : {}),
    ...(typeof input.previousHomeTileKey === "string" ? { previousHomeTileKey: input.previousHomeTileKey } : {}),
    ...(typeof input.spawnTileKey === "string" ? { spawnTileKey: input.spawnTileKey } : {})
  };
};

export const applyRespawnNoticeToState = (
  state: Pick<ClientState, "respawnNotice" | "respawnOverlayOpen" | "lastSeenRespawnNoticeId">,
  notice: PlayerRespawnNotice | undefined,
  pushFeedEntry?: (entry: FeedEntry) => void
): boolean => {
  if (!notice) return false;
  state.respawnNotice = notice;
  if (state.lastSeenRespawnNoticeId === notice.id) return false;
  state.lastSeenRespawnNoticeId = notice.id;
  state.respawnOverlayOpen = true;
  pushFeedEntry?.({
    title: "Empire Respawned",
    text: `${notice.summary} Open the respawn notice for details and diagnostics.`,
    type: "error",
    severity: "warn",
    at: notice.at
  });
  return true;
};
