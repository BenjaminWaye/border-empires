import { describe, expect, it } from "vitest";

import { deriveDevelopmentPanelData, renderDevelopmentPanelHtml } from "./client-development-html.js";
import type { Tile, TileTimedProgress } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("deriveDevelopmentPanelData", () => {
  it("includes an in-progress settlement as an active slot", () => {
    const settleProgressByTile = new Map<string, TileTimedProgress>([
      [keyFor(5, 5), { startAt: 1_000, resolvesAt: 5_000, target: { x: 5, y: 5 }, awaitingServerConfirm: false }]
    ]);

    const data = deriveDevelopmentPanelData(new Map<string, Tile>(), "me", settleProgressByTile, [], 1, 3);

    expect(data.busy).toBe(1);
    expect(data.limit).toBe(3);
    expect(data.activeSlots).toHaveLength(1);
    expect(data.activeSlots[0]).toMatchObject({ label: "Settlement", x: 5, y: 5, totalMs: 4_000 });
  });

  it("includes owned tiles with structures that are under construction or being removed", () => {
    const tiles = new Map<string, Tile>();
    tiles.set(keyFor(1, 1), {
      x: 1,
      y: 1,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      fort: { ownerId: "me", status: "under_construction", completesAt: 10_000 }
    });
    tiles.set(keyFor(2, 2), {
      x: 2,
      y: 2,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "removing" }
    });

    const data = deriveDevelopmentPanelData(tiles, "me", new Map(), [], 2, 3);

    expect(data.activeSlots).toHaveLength(2);
    expect(data.activeSlots.some((slot) => slot.label === "Fort")).toBe(true);
    expect(data.activeSlots.some((slot) => slot.label === "Observatory")).toBe(true);
  });

  it("excludes structures that belong to another player or are already active", () => {
    const tiles = new Map<string, Tile>();
    tiles.set(keyFor(1, 1), {
      x: 1,
      y: 1,
      terrain: "LAND",
      ownerId: "someone-else",
      ownershipState: "SETTLED",
      fort: { ownerId: "someone-else", status: "under_construction" }
    });
    tiles.set(keyFor(2, 2), {
      x: 2,
      y: 2,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      fort: { ownerId: "me", status: "active" }
    });

    const data = deriveDevelopmentPanelData(tiles, "me", new Map(), [], 0, 3);

    expect(data.activeSlots).toHaveLength(0);
  });

  it("maps queued development actions with a 1-based position", () => {
    const data = deriveDevelopmentPanelData(new Map(), "me", new Map(), [
      { kind: "SETTLE", tileKey: keyFor(9, 9), label: "Settlement at (9, 9)", x: 9, y: 9 },
      { kind: "BUILD", tileKey: keyFor(3, 3), label: "Fort at (3, 3)", x: 3, y: 3 }
    ], 3, 3);

    expect(data.queue).toEqual([
      { label: "Settlement at (9, 9)", tileKey: "9,9", position: 1 },
      { label: "Fort at (3, 3)", tileKey: "3,3", position: 2 }
    ]);
  });
});

describe("renderDevelopmentPanelHtml", () => {
  it("shows the busy/limit summary and empty states when nothing is active or queued", () => {
    const html = renderDevelopmentPanelHtml({ busy: 0, limit: 3, activeSlots: [], queue: [] });

    expect(html).toContain("0/3 slots used");
    expect(html).toContain("No active development slots");
    expect(html).toContain("No queued actions");
  });

  it("renders a row with location and remaining time for each active slot", () => {
    const html = renderDevelopmentPanelHtml({
      busy: 1,
      limit: 3,
      activeSlots: [{ tileKey: "5,5", x: 5, y: 5, label: "Settlement", remainingMs: 30_000, totalMs: 60_000 }],
      queue: []
    });

    expect(html).toContain("1/3 slots used");
    expect(html).toContain("Settlement at (5, 5)");
    expect(html).toContain("30s");
  });

  it("renders queued items with their position", () => {
    const html = renderDevelopmentPanelHtml({
      busy: 3,
      limit: 3,
      activeSlots: [],
      queue: [{ label: "Fort at (3, 3)", tileKey: "3,3", position: 1 }]
    });

    expect(html).toContain("#1 Fort at (3, 3)");
    expect(html).toContain("Waiting");
  });
});
