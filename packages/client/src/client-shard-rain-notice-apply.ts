import { registerShardRainPingsFromAlert } from "./client-shard-rain-pings/client-shard-rain-pings.js";
import type { ClientState } from "./client-state/client-state.js";

export type ShardRainNoticeLike = {
  phase?: string | undefined;
  startsAt?: number | undefined;
  expiresAt?: number | undefined;
  siteCount?: number | undefined;
  sites?: { x: number; y: number }[] | undefined;
};

type ShardAlertKeyForPayload = (phase: "upcoming" | "started", startsAt: number) => string;
type ShowShardAlert = (alert: Record<string, unknown>) => void;

// Extracted from client-network.ts (kept oversized-file-neutral per
// AGENTS.md's file-line-limit rule) alongside the muster-march travel
// animation fix; unrelated to that fix's behavior.
export const createShardRainNoticeHandlers = (
  state: ClientState,
  shardAlertKeyForPayload: ShardAlertKeyForPayload,
  showShardAlert: ShowShardAlert
): {
  applyShardRainNotice: (notice: ShardRainNoticeLike | undefined) => void;
  applyShardRainNoticeQuiet: (notice: ShardRainNoticeLike | undefined) => void;
} => {
  const applyShardRainNotice = (notice: ShardRainNoticeLike | undefined): void => {
    if (notice?.phase === "upcoming" && typeof notice.startsAt === "number") {
      showShardAlert({ key: shardAlertKeyForPayload("upcoming", notice.startsAt), phase: "upcoming", startsAt: notice.startsAt });
      return;
    }
    if (notice?.phase === "started" && typeof notice.startsAt === "number" && typeof notice.expiresAt === "number") {
      const startedAlert = {
        key: shardAlertKeyForPayload("started", notice.startsAt),
        phase: "started" as const,
        startsAt: notice.startsAt,
        expiresAt: notice.expiresAt,
        siteCount: Number(notice.siteCount ?? 0),
        ...(notice.sites ? { sites: notice.sites } : {})
      };
      showShardAlert(startedAlert);
      registerShardRainPingsFromAlert(state, startedAlert);
    }
  };
  // Used for the WELCOME/INIT bootstrap notice, which is always populated
  // (see computeShardRainWelcomeNotice) so the persistent Sharding-panel
  // countdown has something to show on first paint — even when the next
  // rain is many hours away. Unlike applyShardRainNotice (used for live
  // push events), this must never pop the one-time toast alert for an
  // "upcoming" rain on every login; the toast should only fire once a rain
  // is actually live, or via the live near-term warning push.
  const applyShardRainNoticeQuiet = (notice: ShardRainNoticeLike | undefined): void => {
    if (notice?.phase === "started") {
      applyShardRainNotice(notice);
      return;
    }
    if (notice?.phase === "upcoming" && typeof notice.startsAt === "number") {
      state.shardRainStatus = { key: shardAlertKeyForPayload("upcoming", notice.startsAt), phase: "upcoming", startsAt: notice.startsAt };
    }
  };
  return { applyShardRainNotice, applyShardRainNoticeQuiet };
};
