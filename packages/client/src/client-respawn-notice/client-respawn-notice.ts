import type { ClientState } from "../client-state/client-state.js";
import type { FeedEntry, PlayerRespawnNotice } from "../client-types.js";
import { playerDisplayNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";
import { empireFellMessage, isEmpireFellNotice } from "./client-empire-fell-message.js";

// The simulation keeps a player's latest respawn notice and sends it on every
// subscribe, so the last one seen is remembered across reloads: the notice
// pops up once, on the next view after the respawn, not on every visit.
const SEEN_RESPAWN_NOTICE_STORAGE_KEY = "be.lastSeenRespawnNoticeId";

const readSeenRespawnNoticeId = (): string | undefined => {
  try {
    return globalThis.localStorage?.getItem(SEEN_RESPAWN_NOTICE_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

const rememberSeenRespawnNoticeId = (id: string): void => {
  try {
    globalThis.localStorage?.setItem(SEEN_RESPAWN_NOTICE_STORAGE_KEY, id);
  } catch {
    // Storage blocked: the notice may show again next visit.
  }
};

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
    ...(typeof input.spawnTileKey === "string" ? { spawnTileKey: input.spawnTileKey } : {}),
    ...(typeof input.fellToPlayerId === "string" ? { fellToPlayerId: input.fellToPlayerId } : {}),
    ...(input.withdrawn === true ? { withdrawn: true } : {})
  };
};

export const applyRespawnNoticeToState = (
  state: Pick<ClientState, "respawnNotice" | "respawnOverlayOpen" | "lastSeenRespawnNoticeId" | "me" | "meName" | "playerNames" | "leaderboard">,
  notice: PlayerRespawnNotice | undefined,
  pushFeedEntry?: (entry: FeedEntry) => void
): boolean => {
  if (!notice) return false;
  state.respawnNotice = notice;
  if (state.lastSeenRespawnNoticeId === notice.id || readSeenRespawnNoticeId() === notice.id) {
    state.lastSeenRespawnNoticeId = notice.id;
    return false;
  }
  state.lastSeenRespawnNoticeId = notice.id;
  rememberSeenRespawnNoticeId(notice.id);
  state.respawnOverlayOpen = true;
  if (isEmpireFellNotice(notice)) {
    pushFeedEntry?.({
      title: notice.withdrawn ? "New start" : "Your empire fell",
      text: empireFellMessage(notice, (playerId) => playerDisplayNameForOwnerFromState(state, playerId)),
      type: "error",
      severity: "warn",
      at: notice.at
    });
    return true;
  }
  pushFeedEntry?.({
    title: "House redeployed",
    text: `${notice.summary} Open the recovery notice for details and diagnostics.`,
    type: "error",
    severity: "warn",
    at: notice.at
  });
  return true;
};
