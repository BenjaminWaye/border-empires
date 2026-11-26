import { describe, expect, it } from "vitest";
import { SCOUT_DRONE_VISION_RADIUS } from "@border-empires/shared";

import { harness, homeRow, lastPayload } from "./scout-drone-runtime.test-helpers.js";

// Playtest 2026-11-26: a scout report said "+160 Tiles" while the Cartographer counter only went from 901 to
// 929. The report counted every tile in the drone's vision, known ground included, and the counter waited for
// an unrelated PLAYER_UPDATE. The report now counts the tiles the flight explored first, and landing refreshes it.
describe("scout drone explored count", () => {
  it("reports only the tiles the flight explored first, which is what the explored memory gained", () => {
    const h = harness(homeRow(), undefined, undefined, { trackExplored: true });
    // The player already knows the ground around home and the first steps out.
    for (let y = 0; y < 30; y += 1) for (const x of [99, 0, 1, 2, 3, 4, 5, 6, 7, 8]) h.explored.add(`me@${x},${y}`);
    const before = h.explored.size;
    h.explore(9, 10, "me", "c1");
    const flight = h.runtime.flightFor("me")!;
    for (const step of flight.steps) h.advanceTo(step.at);
    h.advanceTo(flight.landsAt);
    const report = lastPayload(h).report!;
    const gained = h.explored.size - before;
    expect(gained).toBeGreaterThan(0);
    expect(report.tilesExplored).toBe(gained);
    expect(report.tilesSeen).toBeGreaterThan(gained);
  });

  it("does not count ground a slow tick skipped, which the drone never revealed", () => {
    const h = harness(homeRow(), undefined, undefined, { trackExplored: true });
    const before = h.explored.size;
    h.explore(9, 10, "me", "c1");
    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    const report = lastPayload(h).report!;
    expect(report.tilesExplored).toBe(h.explored.size - before);
    expect(report.tilesSeen).toBeGreaterThanOrEqual((2 * SCOUT_DRONE_VISION_RADIUS + 1) ** 2);
  });

  it("refreshes the player's state on landing so the Cartographer counter moves with the report", () => {
    const h = harness(homeRow(), undefined, undefined, { trackExplored: true });
    h.explore(9, 10, "me", "c1");
    expect(h.playerUpdates).toEqual([]);
    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    expect(h.playerUpdates).toEqual(["me"]);
  });
});
