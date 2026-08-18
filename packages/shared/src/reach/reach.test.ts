import { describe, expect, it } from "vitest";

import { DOCK_REACH_RADIUS, OUTPOST_REACH_RADIUS, TOWN_REACH_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import {
  applyAnchorEvents,
  chebyshevWithWrap,
  grantAnchorToBorder,
  isInReach,
  liveReachForOwner,
  reachRadiusForKind,
  reachSetForPlayer,
  tileKey,
  tileKeysInReach,
  type ReachAnchor
} from "./reach.js";

describe("reachRadiusForKind", () => {
  it("TOWN → TOWN_REACH_RADIUS", () => {
    expect(reachRadiusForKind("TOWN")).toBe(TOWN_REACH_RADIUS);
  });
  it("OUTPOST → OUTPOST_REACH_RADIUS", () => {
    expect(reachRadiusForKind("OUTPOST")).toBe(OUTPOST_REACH_RADIUS);
  });
  it("DOCK → DOCK_REACH_RADIUS", () => {
    expect(reachRadiusForKind("DOCK")).toBe(DOCK_REACH_RADIUS);
  });
});

describe("tileKeysInReach", () => {
  it("produces (2r+1)^2 tiles for a radius-r anchor", () => {
    const anchor: ReachAnchor = { x: 100, y: 100, ownerId: "p1", activatedAt: 1, kind: "TOWN" };
    const keys = tileKeysInReach(anchor);
    expect(keys.length).toBe((2 * TOWN_REACH_RADIUS + 1) ** 2);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes the anchor's own tile", () => {
    const anchor: ReachAnchor = { x: 10, y: 20, ownerId: "p1", activatedAt: 1, kind: "DOCK" };
    expect(tileKeysInReach(anchor)).toContain(tileKey(10, 20));
  });

  it("wraps around world edges", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "TOWN" };
    const keys = new Set(tileKeysInReach(anchor));
    expect(keys.has(tileKey(WORLD_WIDTH - 1, WORLD_HEIGHT - 1))).toBe(true);
    expect(keys.has(tileKey(WORLD_WIDTH - 1, 0))).toBe(true);
  });
});

describe("chebyshevWithWrap", () => {
  it("wraps around world edges to give a short distance", () => {
    expect(chebyshevWithWrap(0, 0, WORLD_WIDTH - 1, 0)).toBe(1);
  });
});

describe("liveReachForOwner", () => {
  it("only counts the given owner's anchors", () => {
    const anchors: ReachAnchor[] = [
      { x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "TOWN" },
      { x: 50, y: 50, ownerId: "p2", activatedAt: 1, kind: "TOWN" }
    ];
    const live = liveReachForOwner("p1", anchors);
    expect(live.has(tileKey(10, 10))).toBe(true);
    expect(live.has(tileKey(50, 50))).toBe(false);
  });
});

describe("grantAnchorToBorder", () => {
  it("grants unclaimed tiles outright", () => {
    const anchor: ReachAnchor = { x: 100, y: 100, ownerId: "p1", activatedAt: 1, kind: "TOWN" };
    const { border, overtaken } = grantAnchorToBorder(new Map(), anchor, () => new Set());
    expect(border.get(tileKey(100, 100))).toBe("p1");
    expect(overtaken).toEqual([]);
  });

  it("no-op when the tile is already claimed by the same owner", () => {
    const existing = new Map([[tileKey(5, 5), "p1"]]);
    const anchor: ReachAnchor = { x: 5, y: 5, ownerId: "p1", activatedAt: 2, kind: "DOCK" };
    const { border, overtaken } = grantAnchorToBorder(existing, anchor, () => new Set());
    expect(border.get(tileKey(5, 5))).toBe("p1");
    expect(overtaken).toEqual([]);
  });

  it("contested tile stays with the defender when they have live coverage there", () => {
    const existing = new Map([[tileKey(5, 5), "defender"]]);
    const anchor: ReachAnchor = { x: 5, y: 5, ownerId: "attacker", activatedAt: 2, kind: "DOCK" };
    const { border, overtaken } = grantAnchorToBorder(existing, anchor, (ownerId) =>
      ownerId === "defender" ? new Set([tileKey(5, 5)]) : new Set()
    );
    expect(border.get(tileKey(5, 5))).toBe("defender");
    expect(overtaken).toEqual([]);
  });

  it("contested tile flips to the attacker when the defender has no live coverage there", () => {
    const existing = new Map([[tileKey(5, 5), "defender"]]);
    const anchor: ReachAnchor = { x: 5, y: 5, ownerId: "attacker", activatedAt: 2, kind: "DOCK" };
    const { border, overtaken } = grantAnchorToBorder(existing, anchor, () => new Set());
    expect(border.get(tileKey(5, 5))).toBe("attacker");
    expect(overtaken).toEqual([{ tileKey: tileKey(5, 5), fromOwnerId: "defender", toOwnerId: "attacker" }]);
  });
});

describe("applyAnchorEvents — sticky border scenarios", () => {
  it("border persists after the granting anchor deactivates (sticky territory)", () => {
    const beacon: ReachAnchor = { x: 200, y: 200, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const { border } = applyAnchorEvents([
      { type: "ACTIVATE", anchor: beacon },
      { type: "DEACTIVATE", anchor: beacon }
    ]);
    // No enemy ever contested it, so the grant stands even with the beacon gone.
    expect(border.get(tileKey(200, 200))).toBe("p1");
    expect(border.get(tileKey(200 + OUTPOST_REACH_RADIUS, 200))).toBe("p1");
  });

  it("undefended border withdraws only once an enemy anchor actually contests it", () => {
    const beacon: ReachAnchor = { x: 200, y: 200, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const enemyBeacon: ReachAnchor = { x: 200, y: 200, ownerId: "p2", activatedAt: 5, kind: "OUTPOST" };
    const { border: afterDeactivate } = applyAnchorEvents([
      { type: "ACTIVATE", anchor: beacon },
      { type: "DEACTIVATE", anchor: beacon }
    ]);
    // Beacon gone, nobody has contested yet: still p1's.
    expect(afterDeactivate.get(tileKey(200, 200))).toBe("p1");

    const { border: afterContest, overtaken } = applyAnchorEvents([
      { type: "ACTIVATE", anchor: beacon },
      { type: "DEACTIVATE", anchor: beacon },
      { type: "ACTIVATE", anchor: enemyBeacon }
    ]);
    // p1's beacon is gone (deactivated) when p2 contests — p1 can't defend, border withdraws to p2.
    expect(afterContest.get(tileKey(200, 200))).toBe("p2");
    expect(overtaken.some((t) => t.fromOwnerId === "p1" && t.toOwnerId === "p2")).toBe(true);
  });

  it("a live defending beacon holds the tile against a contest", () => {
    const beacon: ReachAnchor = { x: 200, y: 200, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const enemyBeacon: ReachAnchor = { x: 200, y: 200, ownerId: "p2", activatedAt: 5, kind: "OUTPOST" };
    const { border, overtaken } = applyAnchorEvents([
      { type: "ACTIVATE", anchor: beacon }, // still active, never deactivated
      { type: "ACTIVATE", anchor: enemyBeacon }
    ]);
    expect(border.get(tileKey(200, 200))).toBe("p1");
    expect(overtaken).toEqual([]);
  });

  it("applies between allies too — border clipping is unconditional", () => {
    const a: ReachAnchor = { x: 300, y: 300, ownerId: "ally-1", activatedAt: 1, kind: "TOWN" };
    const bClose: ReachAnchor = { x: 300, y: 300, ownerId: "ally-2", activatedAt: 2, kind: "TOWN" };
    const { border, overtaken } = applyAnchorEvents([
      { type: "ACTIVATE", anchor: a },
      { type: "DEACTIVATE", anchor: a }, // ally-1's town gone, no live defense
      { type: "ACTIVATE", anchor: bClose }
    ]);
    expect(border.get(tileKey(300, 300))).toBe("ally-2");
    expect(overtaken.some((t) => t.toOwnerId === "ally-2")).toBe(true);
  });
});

describe("reachSetForPlayer / isInReach", () => {
  it("reflect the persistent border map", () => {
    const anchor: ReachAnchor = { x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "DOCK" };
    const { border } = applyAnchorEvents([{ type: "ACTIVATE", anchor }]);
    expect(reachSetForPlayer("p1", border).has(tileKey(10, 10))).toBe(true);
    expect(isInReach("p1", 10, 10, border)).toBe(true);
    expect(isInReach("p2", 10, 10, border)).toBe(false);
    expect(isInReach("p1", 10 + DOCK_REACH_RADIUS + 1, 10, border)).toBe(false);
  });
});
