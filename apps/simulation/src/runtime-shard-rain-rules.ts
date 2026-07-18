import type { DomainTileState } from "@border-empires/game-domain";

export const SHARD_RAIN_SCHEDULE_HOURS = [12] as const;
export const SHARD_RAIN_TTL_MS = 30 * 60_000;
export const SHARD_RAIN_WARNING_LEAD_MS = 60 * 60 * 1000;
export const SHARD_RAIN_SITE_MIN = 3;
export const SHARD_RAIN_SITE_MAX = 6;
export const SHARD_RAIN_COMMAND_ID_PREFIX = "system-shard-rain";
export const SHARD_RAIN_SYSTEM_PLAYER_ID = "system-shard-rain";

export const shardRainSlotKey = (at: Date): string =>
  `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}-${at.getHours()}`;

export const nextShardRainStartAt = (nowMs: number): number => {
  const now = new Date(nowMs);
  const todayBase = new Date(now.getTime());
  todayBase.setMinutes(0, 0, 0);
  for (const hour of SHARD_RAIN_SCHEDULE_HOURS) {
    const candidate = new Date(todayBase.getTime());
    candidate.setHours(hour, 0, 0, 0);
    if (candidate.getTime() > nowMs) return candidate.getTime();
  }
  const tomorrow = new Date(todayBase.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(SHARD_RAIN_SCHEDULE_HOURS[0], 0, 0, 0);
  return tomorrow.getTime();
};

export const computeShardRainNotice = (input: {
  nowMs: number;
  currentSiteCount: number;
  currentExpiresAt: number | undefined;
}): Record<string, unknown> | undefined => {
  if (
    input.currentSiteCount > 0 &&
    typeof input.currentExpiresAt === "number" &&
    input.currentExpiresAt > input.nowMs
  ) {
    return {
      type: "SHARD_RAIN_EVENT",
      phase: "started",
      startsAt: input.currentExpiresAt - SHARD_RAIN_TTL_MS,
      expiresAt: input.currentExpiresAt,
      siteCount: input.currentSiteCount
    };
  }
  const nextStart = nextShardRainStartAt(input.nowMs);
  if (nextStart - input.nowMs <= SHARD_RAIN_WARNING_LEAD_MS) {
    return { type: "SHARD_RAIN_EVENT", phase: "upcoming", startsAt: nextStart };
  }
  return undefined;
};

// Unlike computeShardRainNotice (which only surfaces an "upcoming" notice
// within SHARD_RAIN_WARNING_LEAD_MS of the next rain, since it backs a
// one-time push alert), this always returns a notice so a persistent panel
// can show a countdown to the next scheduled rain regardless of how far away
// it is.
export const computeShardRainWelcomeNotice = (input: {
  nowMs: number;
  currentSiteCount: number;
  currentExpiresAt: number | undefined;
}): Record<string, unknown> => {
  if (
    input.currentSiteCount > 0 &&
    typeof input.currentExpiresAt === "number" &&
    input.currentExpiresAt > input.nowMs
  ) {
    return {
      type: "SHARD_RAIN_EVENT",
      phase: "started",
      startsAt: input.currentExpiresAt - SHARD_RAIN_TTL_MS,
      expiresAt: input.currentExpiresAt,
      siteCount: input.currentSiteCount
    };
  }
  return { type: "SHARD_RAIN_EVENT", phase: "upcoming", startsAt: nextShardRainStartAt(input.nowMs) };
};

export const shouldBroadcastShardRainWarningAt = (nowMs: number): { nextStart: number; slotKey: string } | undefined => {
  const current = new Date(nowMs);
  if (current.getMinutes() !== 0) return undefined;
  const nextStart = nextShardRainStartAt(nowMs);
  const remaining = nextStart - nowMs;
  if (remaining > SHARD_RAIN_WARNING_LEAD_MS || remaining <= SHARD_RAIN_WARNING_LEAD_MS - 60_000) return undefined;
  return { nextStart, slotKey: shardRainSlotKey(new Date(nextStart)) };
};

export const isScheduledShardRainMinute = (nowMs: number): { slotKey: string } | undefined => {
  const current = new Date(nowMs);
  if (current.getMinutes() !== 0) return undefined;
  if (!SHARD_RAIN_SCHEDULE_HOURS.includes(current.getHours() as (typeof SHARD_RAIN_SCHEDULE_HOURS)[number])) return undefined;
  return { slotKey: shardRainSlotKey(current) };
};

export const canHostShardFallSiteAt = (
  tile: DomainTileState | undefined,
  tileKey?: string,
  recentShardRainTileKeys?: ReadonlySet<string>
): boolean => {
  if (!tile) return false;
  if (tile.terrain !== "LAND") return false;
  if (tile.dockId) return false;
  if (tile.resource) return false;
  if (tile.town) return false;
  if (tile.shardSite) return false;
  if (tileKey && recentShardRainTileKeys?.has(tileKey)) return false;
  return true;
};
