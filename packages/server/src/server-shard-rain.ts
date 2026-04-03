export const SHARD_RAIN_SCHEDULE_HOURS = [12, 20] as const;
export const SHARD_RAIN_WARNING_LEAD_MS = 60 * 60 * 1000;

export type ShardRainNotice =
  | { phase: "upcoming"; startsAt: number }
  | { phase: "started"; startsAt: number; expiresAt: number; siteCount: number };

const startOfHour = (at: Date): Date => {
  const out = new Date(at.getTime());
  out.setMinutes(0, 0, 0);
  return out;
};

export const nextShardRainStartAt = (nowMs: number, hours: readonly number[] = SHARD_RAIN_SCHEDULE_HOURS): number => {
  const now = new Date(nowMs);
  const todayBase = startOfHour(now);
  for (const hour of hours) {
    const candidate = new Date(todayBase.getTime());
    candidate.setHours(hour, 0, 0, 0);
    if (candidate.getTime() > nowMs) return candidate.getTime();
  }
  const tomorrow = new Date(todayBase.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(hours[0] ?? 0, 0, 0, 0);
  return tomorrow.getTime();
};

export const shardRainStartForExpiry = (expiresAt: number, ttlMs: number): number => expiresAt - ttlMs;

export const currentShardRainNotice = (
  nowMs: number,
  activeExpiresAt: number | undefined,
  activeSiteCount: number,
  ttlMs: number,
  hours: readonly number[] = SHARD_RAIN_SCHEDULE_HOURS
): ShardRainNotice | undefined => {
  if (typeof activeExpiresAt === "number" && activeExpiresAt > nowMs) {
    return {
      phase: "started",
      startsAt: shardRainStartForExpiry(activeExpiresAt, ttlMs),
      expiresAt: activeExpiresAt,
      siteCount: activeSiteCount
    };
  }
  const nextStart = nextShardRainStartAt(nowMs, hours);
  if (nextStart - nowMs <= SHARD_RAIN_WARNING_LEAD_MS) {
    return { phase: "upcoming", startsAt: nextStart };
  }
  return undefined;
};
