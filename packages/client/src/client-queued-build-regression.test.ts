import { describe, expect, it } from "vitest";
import { queuedBuildOrderForTile, hasQueuedBuildForTile } from "./client-development-queue.js";
import { queuedBuildProgressForTile, tileMenuViewForTile } from "./client-tile-menu-view.js";

describe("queued build regression", () => {
  it("detects queued builds for a tile", () => {
    const queue = [
      { kind: "SETTLE" as const, tileKey: "1,1" },
      { kind: "BUILD" as const, tileKey: "2,2", label: "Observatory at (2, 2)" }
    ];
    expect(queuedBuildOrderForTile(queue, "2,2")).toBe(1);
    expect(hasQueuedBuildForTile(queue, "2,2")).toBe(true);
    expect(hasQueuedBuildForTile(queue, "9,9")).toBe(false);
  });

  it("shows queued build progress and prioritizes progress over buildings", () => {
    const tile = { x: 2, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", regionType: "ANCIENT_HEARTLAND" } as const;
    const progress = queuedBuildProgressForTile(tile, {
      keyFor: (x, y) => `${x},${y}`,
      queuedDevelopmentEntryForTile: () => ({ kind: "BUILD", tileKey: "2,2", label: "Observatory at (2, 2)" })
    });
    expect(progress?.title).toBe("Observatory queued");
    expect(progress?.cancelActionId).toBe("cancel_queued_build");

    const view = tileMenuViewForTile(tile, {
      menuActionsForSingleTile: () => [],
      splitTileActionsIntoTabs: () => ({
        actions: [],
        buildings: [{ id: "build_observatory", label: "Build Observatory" }],
        crystal: []
      }),
      settlementProgressForTile: () => undefined,
      queuedSettlementProgressForTile: () => undefined,
      queuedBuildProgressForTile: () => progress,
      constructionProgressForTile: () => undefined,
      menuOverviewForTile: () => [],
      prettyToken: (value) => value,
      playerNameForOwner: () => undefined,
      terrainLabel: () => "Grass",
      isTileOwnedByAlly: () => false,
      state: { me: "me" }
    });

    expect(view.tabs[0]).toBe("progress");
    expect(view.buildings).toHaveLength(0);
    expect(view.progress?.title).toBe("Observatory queued");
  });
});
