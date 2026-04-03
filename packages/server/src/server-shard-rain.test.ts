import { describe, expect, it } from "vitest";

import { SHARD_RAIN_SCHEDULE_HOURS, currentShardRainNotice, nextShardRainStartAt } from "./server-shard-rain.js";

const localTime = (year: number, month: number, day: number, hour: number, minute: number): number =>
  new Date(year, month, day, hour, minute, 0, 0).getTime();

describe("server shard rain schedule helpers", () => {
  it("finds the next scheduled shard rain on the same day", () => {
    const now = localTime(2026, 3, 3, 11, 15);
    const start = nextShardRainStartAt(now, SHARD_RAIN_SCHEDULE_HOURS);
    expect(new Date(start).getHours()).toBe(12);
  });

  it("returns an upcoming warning inside the one-hour lead window", () => {
    const now = localTime(2026, 3, 3, 11, 10);
    const notice = currentShardRainNotice(now, undefined, 0, 30 * 60 * 1000, SHARD_RAIN_SCHEDULE_HOURS);
    expect(notice).toEqual({ phase: "upcoming", startsAt: localTime(2026, 3, 3, 12, 0) });
  });

  it("returns active shard rain info for reconnecting players", () => {
    const now = localTime(2026, 3, 3, 12, 10);
    const expiresAt = localTime(2026, 3, 3, 12, 30);
    const notice = currentShardRainNotice(now, expiresAt, 4, 30 * 60 * 1000, SHARD_RAIN_SCHEDULE_HOURS);
    expect(notice).toEqual({
      phase: "started",
      startsAt: localTime(2026, 3, 3, 12, 0),
      expiresAt,
      siteCount: 4
    });
  });
});
