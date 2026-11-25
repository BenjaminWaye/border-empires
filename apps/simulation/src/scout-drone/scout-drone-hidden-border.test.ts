import { describe, expect, it } from "vitest";
import { scoutDroneStepIndexAt } from "@border-empires/shared";
import { harness, homeRow, land, lastPayload } from "./scout-drone-runtime.test-helpers.js";

// A rival border the player has never seen must not shape the flight sent at launch (player report
// 2026-11-24: eight stops queued, Go showed three, the third pulled back to a border still in fog).
// The route is planned on what the player knows; the drone meets the border only when it gets there.

const rivalWall = [6, 7, 8, 9, 10, 11, 12, 13, 14].map((y) => land(8, y, { ownerId: "rival" }));
const rivalTile = (x: number): boolean => x === 8;
/** The player can see everything but the rival's land (until the drone shows it). */
const fogOverRival = (_playerId: string, x: number): boolean => !rivalTile(x);
const stops = [
  { x: 12, y: 10 },
  { x: 12, y: 16 },
  { x: 16, y: 16 }
];

describe("scout drone and a rival border in fog", () => {
  it("sends the whole route at launch, with nothing about the hidden border", () => {
    const h = harness([...homeRow(), ...rivalWall], undefined, fogOverRival);
    h.exploreRoute(stops, "me", "go");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "go" });
    const launched = lastPayload(h);
    expect(launched.flight?.waypoints).toEqual(stops);
    expect(launched.flight?.endReason).toBe("TARGET");
    expect(JSON.stringify(launched)).not.toContain("rival");
    // Every stop is charged at launch, as for any route: a smaller charge would give the border away.
    expect(launched.charges?.usedAt).toHaveLength(3);
    // Same flight, steps and all, as over empty ground: the way home makes no detour round the wall either.
    const blind = harness(homeRow());
    blind.exploreRoute(stops, "me", "go");
    expect(launched.flight).toEqual(lastPayload(blind).flight);
  });

  it("turns back when it reaches the border, alerting the rival and giving back the stops past it", () => {
    const h = harness([...homeRow(), ...rivalWall], undefined, fogOverRival);
    h.exploreRoute(stops);
    const planned = h.runtime.flightFor("me")!;
    h.advanceTo(planned.steps.find((step) => rivalTile(step.x))!.at);
    const turned = h.runtime.flightFor("me")!;
    expect(turned).toMatchObject({ endReason: "BLOCKED", blockedByPlayerId: "rival", blockedAtX: 8 });
    expect(turned.steps[turned.turnIndex]!.x).toBe(7);
    expect(turned.steps.slice(turned.turnIndex).some((step) => rivalTile(step.x))).toBe(false);
    expect(lastPayload(h, "rival")).toMatchObject({ type: "SCOUT_SIGHTED", scoutPlayerId: "me", x: 8 });
    // The leg it flew still costs its charge; the two stops past the border come back.
    expect(lastPayload(h).charges?.usedAt).toHaveLength(1);
    expect(h.runtime.gauge()).toMatchObject({ borderTurnBacks: 1, chargesRefunded: 2 });
    h.advanceTo(turned.landsAt);
    expect(h.runtime.flightFor("me")).toBeUndefined();
    expect(lastPayload(h).report).toMatchObject({ blockedByPlayerId: "rival" });
  });

  it("still cuts the route at launch when the player has seen that border", () => {
    const h = harness([...homeRow(), ...rivalWall]);
    h.exploreRoute(stops);
    const flight = h.runtime.flightFor("me")!;
    expect(flight).toMatchObject({ endReason: "BLOCKED", blockedByPlayerId: "rival", blockedAtX: 8 });
    expect(flight.waypoints).toEqual([{ x: 7, y: 10 }]);
    expect(lastPayload(h).charges?.usedAt).toHaveLength(1);
  });

  it("goes round a hidden border on its way home instead of flying over it", () => {
    // Out past the wall's south end, home straight across it: the line home crosses the wall.
    const h = harness([...homeRow(), ...rivalWall], undefined, fogOverRival);
    h.exploreRoute([{ x: 2, y: 20 }, { x: 14, y: 20 }, { x: 14, y: 10 }]);
    const planned = h.runtime.flightFor("me")!;
    expect(planned.steps.some((step, i) => i > planned.turnIndex && rivalTile(step.x) && step.y >= 6 && step.y <= 14)).toBe(true);
    // It only knows the wall as far as it has seen it, so it may go round more than once: follow the flight
    // tick by tick and check the tiles it actually flies over.
    const flown: Array<{ x: number; y: number }> = [];
    for (let t = h.now(); h.runtime.flightFor("me"); t += 500) {
      h.advanceTo(t);
      const flight = h.runtime.flightFor("me");
      if (flight) flown.push(flight.steps[Math.max(0, scoutDroneStepIndexAt(flight, t))]!);
    }
    expect(flown.some((step) => rivalTile(step.x) && step.y >= 6 && step.y <= 14)).toBe(false);
    expect(h.runtime.gauge().homeReroutes).toBeGreaterThanOrEqual(1);
    expect(lastPayload(h).flight).toBeNull();
  });

  it("keeps its route over a border it cannot go round, searches once, and the rival sees it", () => {
    // Its AFC is taken while it is out: no way home avoids the rival's land, so it flies on over it.
    const h = harness([...homeRow()]);
    h.exploreRoute([{ x: 14, y: 10 }]);
    const planned = h.runtime.flightFor("me")!;
    h.advanceTo(planned.steps[planned.turnIndex + 1]!.at);
    for (let y = 7; y <= 13; y += 1) for (let x = 0; x <= 7; x += 1) h.tiles.set(`${x},${y}`, land(x, y, { ownerId: "rival" }));
    for (let t = h.now(); h.runtime.flightFor("me"); t += 500) h.advanceTo(t);
    // Several homeward steps cross the rival's land; without keeping the route each would search again.
    expect(h.runtime.gauge()).toMatchObject({ homeRerouteFailures: 1, homeReroutes: 0 });
    expect(h.messages.filter((m) => m.playerId === "rival" && m.payload.type === "SCOUT_SIGHTED")).toHaveLength(1);
    expect(lastPayload(h, "rival")).toMatchObject({ scoutPlayerId: "me", x: 7 });
    expect(lastPayload(h).flight).toBeNull();
  });
});
