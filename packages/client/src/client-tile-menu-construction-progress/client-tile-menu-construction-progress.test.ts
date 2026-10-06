import { describe, expect, it } from "vitest";

import { constructionProgressForTile } from "./client-tile-menu-construction-progress.js";
import type { Tile } from "../client-types.js";

const quickforge = { hasQuickforge: false, wonderLastFreeRushBuyAt: 0, nowMs: Date.now() };

const beaconUnderConstruction = (ownerId: string): Tile => ({
  x: 419,
  y: 87,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED",
  economicStructure: { ownerId, type: "RELAY_BEACON", status: "under_construction", completesAt: Date.now() + 60_000 }
});

describe("constructionProgressForTile ownership", () => {
  it("offers cancel and rush-buy on the viewer's own construction", () => {
    const progress = constructionProgressForTile(beaconUnderConstruction("me"), () => "1:00", quickforge, "me");
    expect(progress?.cancelLabel).toBe("Cancel construction");
    expect(progress?.rushBuyLabel).toBeDefined();
  });

  it("shows only the timer, with no cancel or rush-buy, on an enemy tile", () => {
    const progress = constructionProgressForTile(beaconUnderConstruction("freja"), () => "1:00", quickforge, "me");
    expect(progress?.title).toBe("Relay Beacon under construction");
    expect(progress?.remainingLabel).toBe("1:00");
    expect(progress?.cancelLabel).toBeUndefined();
    expect(progress?.cancelActionId).toBeUndefined();
    expect(progress?.rushBuyLabel).toBeUndefined();
    expect(progress?.rushBuyActionId).toBeUndefined();
  });

  it("also hides cancel-removal on an enemy tile", () => {
    const tile: Tile = { ...beaconUnderConstruction("freja"), economicStructure: { ownerId: "freja", type: "RELAY_BEACON", status: "removing", completesAt: Date.now() + 60_000 } };
    expect(constructionProgressForTile(tile, () => "1:00", quickforge, "me")?.cancelLabel).toBeUndefined();
  });
});

describe("constructionProgressForTile uses the server-stamped window", () => {
  const HOUR = 3_600_000;
  const fortAt = (extra: Record<string, unknown>): Tile => ({
    x: 1,
    y: 1,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    fort: { ownerId: "me", status: "under_construction", variant: "FORT", completesAt: Date.now() + 3 * HOUR, ...extra }
  });

  it("measures a multi-hour fort against startedAt..completesAt, not the flat 10-minute constant", () => {
    // 1h elapsed of a 4h window => 25%. The flat FORT_BUILD_MS estimate would already read 100%.
    const tile = fortAt({ startedAt: Date.now() - HOUR });
    const progress = constructionProgressForTile(tile, () => "3:00:00", quickforge, "me")?.progress;
    expect(progress).toBeGreaterThan(0.24);
    expect(progress).toBeLessThan(0.26);
  });

  it("keeps the per-type estimate for records that predate startedAt", () => {
    const progress = constructionProgressForTile(fortAt({}), () => "3:00:00", quickforge, "me")?.progress;
    expect(progress).toBe(0); // remaining (3h) exceeds the flat estimate, so the old formula clamps to 0
  });
});
