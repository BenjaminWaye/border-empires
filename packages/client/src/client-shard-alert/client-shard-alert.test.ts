import { describe, expect, it } from "vitest";

import { formatShardRainRemaining, shardRainAlertDetail } from "./client-shard-alert.js";

describe("client shard rain alert copy", () => {
  it("formats remaining time in words", () => {
    expect(formatShardRainRemaining(30 * 60_000)).toBe("30 minutes");
    expect(formatShardRainRemaining(60 * 60_000)).toBe("1 hour");
    expect(formatShardRainRemaining(95 * 60_000)).toBe("1 hour 35 minutes");
  });

  it("builds upcoming and active shard rain alert copy", () => {
    const now = Date.UTC(2026, 3, 3, 11, 0, 0);
    expect(shardRainAlertDetail({ key: "u", phase: "upcoming", startsAt: now + 60 * 60_000 }, now)).toBe(
      "Shard rain will begin in 1 hour."
    );
    expect(
      shardRainAlertDetail({ key: "s", phase: "started", startsAt: now, expiresAt: now + 30 * 60_000, siteCount: 4 }, now)
    ).toBe("Shard rain has begun. 4 impact sites will remain for 30 minutes.");
  });
});
