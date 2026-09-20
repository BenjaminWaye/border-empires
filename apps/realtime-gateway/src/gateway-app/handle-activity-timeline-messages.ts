import type { PersonalActivityTimeline } from "@border-empires/game-domain";

const ACTIVITY_TIMELINE_WINDOW_MS = 24 * 60 * 60_000;

// REQUEST_PERSONAL_ACTIVITY / ACKNOWLEDGE_ACTIVITY_SEEN handlers, extracted
// from gateway-app.ts's dispatcher (already oversized and may not grow --
// see AGENTS.md's file-and-type-discipline rule), mirroring
// handle-set-tile-color-message.ts. Deliberately only called on an explicit
// client request (dashboard open/refresh) -- NEVER wired into the INIT/
// login path, which this project has repeatedly regressed by adding
// synchronous sim RPC round-trips there (see the sim-worker-bottleneck /
// login-queue-fairness incidents in docs/agents/).
export type RequestPersonalActivityMessageDeps = {
  playerId: string;
  now: () => number;
  getPersonalActivityTimeline: (playerId: string, from: number, to: number) => Promise<PersonalActivityTimeline>;
  // Payload-byte gauge for the response, recorded at this WS boundary (see
  // docs/activity-dashboard-plan.md 4.1) -- optional so tests can omit it.
  recordPayloadBytes?: (bytes: number) => void;
  sendJson: (payload: unknown) => void;
};

export const handleRequestPersonalActivityMessage = async (deps: RequestPersonalActivityMessageDeps): Promise<void> => {
  const { playerId, now, getPersonalActivityTimeline, recordPayloadBytes, sendJson } = deps;
  const to = now();
  const from = to - ACTIVITY_TIMELINE_WINDOW_MS;
  try {
    const timeline = await getPersonalActivityTimeline(playerId, from, to);
    const response = { type: "PERSONAL_ACTIVITY_TIMELINE", timeline };
    recordPayloadBytes?.(Buffer.byteLength(JSON.stringify(response), "utf8"));
    sendJson(response);
  } catch (error) {
    sendJson({
      type: "ERROR",
      code: "ACTIVITY_TIMELINE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "failed to load activity timeline"
    });
  }
};

export type AcknowledgeActivitySeenMessageDeps = {
  playerId: string;
  seenAt: number;
  seasonId: string;
  now: () => number;
  // Mirrors handle-set-profile-message.ts's getCurrentSeasonId dependency
  // shape exactly, so the same inline closure can be reused at the call
  // site in gateway-app.ts.
  getCurrentSeasonId: () => Promise<string | undefined>;
  profileStore: {
    setActivitySeen: (playerId: string, seenAtMs: number, seasonId: string) => Promise<{ lastActivitySeenAt?: number; lastActivitySeenSeasonId?: string }>;
  };
  invalidateProfileCache: (playerId: string) => void;
  sendJson: (payload: unknown) => void;
};

export const handleAcknowledgeActivitySeenMessage = async (deps: AcknowledgeActivitySeenMessageDeps): Promise<void> => {
  const { playerId, seenAt, seasonId, now, getCurrentSeasonId, profileStore, invalidateProfileCache, sendJson } = deps;
  if (seenAt > now()) {
    sendJson({ type: "ERROR", code: "ACTIVITY_SEEN_FUTURE", message: "seenAt cannot be in the future" });
    return;
  }
  const currentSeasonId = await getCurrentSeasonId();
  if (currentSeasonId && seasonId !== currentSeasonId) {
    sendJson({ type: "ERROR", code: "ACTIVITY_SEEN_SEASON_MISMATCH", message: "seasonId does not match the current season" });
    return;
  }
  const updated = await profileStore.setActivitySeen(playerId, seenAt, seasonId);
  invalidateProfileCache(playerId);
  sendJson({
    type: "ACTIVITY_SEEN_ACKNOWLEDGED",
    lastActivitySeenAt: updated.lastActivitySeenAt,
    lastActivitySeenSeasonId: updated.lastActivitySeenSeasonId
  });
};
