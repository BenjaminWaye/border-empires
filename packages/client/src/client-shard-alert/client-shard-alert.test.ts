import { describe, expect, it } from "vitest";

import {
  compassDirectionFor,
  formatShardRainRemaining,
  formatShardSiteBearing,
  nearestShardSiteBearing,
  shardRainAlertDetail
} from "./client-shard-alert.js";

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

describe("shard rain site bearing", () => {
  it("computes 8-way compass direction from a delta (north = -y)", () => {
    expect(compassDirectionFor(10, 0)).toBe("E");
    expect(compassDirectionFor(-10, 0)).toBe("W");
    expect(compassDirectionFor(0, -10)).toBe("N");
    expect(compassDirectionFor(0, 10)).toBe("S");
    expect(compassDirectionFor(10, -10)).toBe("NE");
    expect(compassDirectionFor(-10, 10)).toBe("SW");
  });

  it("finds the nearest of several sites, wrapping around the toroidal world", () => {
    const origin = { x: 5, y: 5 };
    // Direct distance is 395 tiles east; the short way around the world edge is only 55.
    const wrappedSite = { x: 400, y: 5 };
    const nearerDirectSite = { x: 5, y: 50 };
    expect(nearestShardSiteBearing([nearerDirectSite, wrappedSite], origin)).toEqual({ distanceTiles: 45, compass: "S" });
  });

  it("returns undefined when there's no origin or no site coordinates", () => {
    expect(nearestShardSiteBearing(undefined, { x: 1, y: 1 })).toBeUndefined();
    expect(nearestShardSiteBearing([], { x: 1, y: 1 })).toBeUndefined();
    expect(nearestShardSiteBearing([{ x: 1, y: 1 }], undefined)).toBeUndefined();
  });

  it("formats a bearing into a sentence, and handles the no-bearing case", () => {
    expect(formatShardSiteBearing({ distanceTiles: 210, compass: "NW" })).toBe("Nearest site is ~210 tiles NW.");
    expect(formatShardSiteBearing({ distanceTiles: 0, compass: "N" })).toBe("Nearest site is right on your capital.");
    expect(formatShardSiteBearing(undefined)).toBe("");
  });
});
