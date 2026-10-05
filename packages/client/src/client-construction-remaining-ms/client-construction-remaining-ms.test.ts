import { afterEach, describe, expect, it, vi } from "vitest";
import { constructionCountdownLineForTile } from "../client-construction-countdown/client-construction-countdown.js";
import { constructionProgressForTile } from "../client-tile-menu-construction-progress/client-tile-menu-construction-progress.js";
import { constructionRemainingMsForTile } from "./client-construction-remaining-ms.js";
import type { Tile } from "../client-types.js";

const NOW = 1_000_000;
const quickforge = { hasQuickforge: false, wonderLastFreeRushBuyAt: 0, nowMs: NOW };

const pausedTile = (pausedAt: number | undefined): Tile => ({
  x: 3,
  y: 4,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "under_construction", completesAt: NOW + 60_000, ...(pausedAt !== undefined ? { pausedAt } : {}) }
});

afterEach(() => vi.useRealTimers());

describe("construction paused by an attack on the tile", () => {
  it("freezes the remaining time at the pause instead of counting down", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW + 25_000);
    expect(constructionRemainingMsForTile(pausedTile(NOW))).toBe(60_000);
    expect(constructionRemainingMsForTile(pausedTile(undefined))).toBe(35_000);
  });

  it("never reports 0 for a paused build, so the stalled-construction refresh does not fire", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW + 120_000);
    expect(constructionRemainingMsForTile(pausedTile(NOW + 60_000))).toBe(1);
    expect(constructionRemainingMsForTile(pausedTile(undefined))).toBe(0);
  });

  it("labels the countdown line and tile-menu card as paused due to the ongoing attack, without rush-buy", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW + 25_000);
    const clock = (ms: number) => `${Math.round(ms / 1000)}s`;
    expect(constructionCountdownLineForTile(pausedTile(NOW), clock, () => "Relay Beacon")).toBe("Building Relay Beacon... 60s (paused: ongoing attack)");
    expect(constructionCountdownLineForTile(pausedTile(undefined), clock, () => "Relay Beacon")).toBe("Building Relay Beacon... 35s");

    const paused = constructionProgressForTile(pausedTile(NOW), clock, quickforge, "me");
    expect(paused?.remainingLabel).toBe("60s · Paused: ongoing attack");
    expect(paused?.note).toContain("Paused due to an ongoing attack");
    expect(paused?.rushBuyLabel).toBeUndefined();
    expect(paused?.cancelLabel).toBe("Cancel construction");

    const running = constructionProgressForTile(pausedTile(undefined), clock, quickforge, "me");
    expect(running?.remainingLabel).toBe("35s");
    expect(running?.rushBuyLabel).toBeDefined();
  });
});
