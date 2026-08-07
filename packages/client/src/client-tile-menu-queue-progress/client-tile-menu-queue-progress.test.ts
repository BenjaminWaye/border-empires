import { describe, expect, it } from "vitest";
import { queuedBuildProgressForTile, queuedSettlementProgressForTile } from "./client-tile-menu-queue-progress.js";
import type { Tile } from "../client-types.js";

const tile = { x: 2, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "UNCLAIMED" } as unknown as Tile;

describe("queuedSettlementProgressForTile: queue state", () => {
  it("defaults to queued (server-confirmed) styling when devQueueStateForTile is not provided", () => {
    const progress = queuedSettlementProgressForTile(tile, {
      keyFor: (x, y) => `${x},${y}`,
      queuedDevelopmentEntryForTile: () => ({ kind: "SETTLE", tileKey: "2,2" }),
      queuedSettlementIndexForTile: () => 1,
      queuedEntryIndexForTile: () => 1
    });
    expect(progress?.title).toBe("Settlement queued");
    expect(progress?.queueState).toBe("queued");
    expect(progress?.remainingLabel).toBe("Queue #2");
  });

  it("renders planned copy/labels when the tile is in the client-local wishlist, not the server queue", () => {
    const progress = queuedSettlementProgressForTile(tile, {
      keyFor: (x, y) => `${x},${y}`,
      queuedDevelopmentEntryForTile: () => ({ kind: "SETTLE", tileKey: "2,2" }),
      queuedSettlementIndexForTile: () => 0,
      queuedEntryIndexForTile: () => 5,
      devQueueStateForTile: () => "planned"
    });
    expect(progress?.title).toBe("Settlement planned");
    expect(progress?.queueState).toBe("planned");
    expect(progress?.remainingLabel).toBe("Planned #1");
    expect(progress?.cancelLabel).toBe("Remove from plan");
  });

  it("labels the secondary action 'Jump to front of queue' for both queued and planned entries -- for planned tiles this actually forces the entry into the server queue, displacing the current last-in-line entry", () => {
    const queued = queuedSettlementProgressForTile(tile, {
      keyFor: (x, y) => `${x},${y}`,
      queuedDevelopmentEntryForTile: () => ({ kind: "SETTLE", tileKey: "2,2" }),
      queuedSettlementIndexForTile: () => 3,
      queuedEntryIndexForTile: () => 3
    });
    expect(queued?.secondaryLabel).toBe("Jump to front of queue");

    const planned = queuedSettlementProgressForTile(tile, {
      keyFor: (x, y) => `${x},${y}`,
      queuedDevelopmentEntryForTile: () => ({ kind: "SETTLE", tileKey: "2,2" }),
      queuedSettlementIndexForTile: () => 0,
      queuedEntryIndexForTile: () => 2,
      devQueueStateForTile: () => "planned"
    });
    expect(planned?.secondaryLabel).toBe("Jump to front of queue");
    expect(planned?.note).toContain("bump whichever tile is currently last in line back to Planned");
  });

  it("returns undefined for a non-SETTLE entry", () => {
    const progress = queuedSettlementProgressForTile(tile, {
      keyFor: (x, y) => `${x},${y}`,
      queuedDevelopmentEntryForTile: () => ({ kind: "BUILD", tileKey: "2,2" }),
      queuedSettlementIndexForTile: () => 0,
      queuedEntryIndexForTile: () => 0
    });
    expect(progress).toBeUndefined();
  });
});

describe("queuedBuildProgressForTile: queue state", () => {
  it("renders planned vs queued titles/labels for builds", () => {
    const planned = queuedBuildProgressForTile(tile, {
      keyFor: (x, y) => `${x},${y}`,
      queuedDevelopmentEntryForTile: () => ({ kind: "BUILD", tileKey: "2,2", label: "Observatory at (2, 2)" }),
      queuedEntryIndexForTile: () => 4,
      devQueueStateForTile: () => "planned"
    });
    expect(planned?.title).toBe("Observatory planned");
    expect(planned?.queueState).toBe("planned");
    expect(planned?.cancelLabel).toBe("Remove from plan");

    const queued = queuedBuildProgressForTile(tile, {
      keyFor: (x, y) => `${x},${y}`,
      queuedDevelopmentEntryForTile: () => ({ kind: "BUILD", tileKey: "2,2", label: "Observatory at (2, 2)" }),
      queuedEntryIndexForTile: () => 0
    });
    expect(queued?.title).toBe("Observatory queued");
    expect(queued?.queueState).toBe("queued");
  });
});
