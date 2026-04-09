import { describe, expect, it, vi } from "vitest";

import { tileOverviewModifiersForTile } from "./client-tile-overview-modifiers.js";
import type { Tile } from "./client-types.js";

describe("tileOverviewModifiersForTile", () => {
  it("hides fort defense while a captured fort is in recovery", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));

    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER",
      fort: {
        ownerId: "me",
        status: "active",
        disabledUntil: Date.now() + 60_000
      }
    } satisfies Tile);

    expect(modifiers.some((modifier) => modifier.reason === "Fort")).toBe(false);
    vi.useRealTimers();
  });
});
