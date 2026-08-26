import { describe, expect, it } from "vitest";

import { DOCK_REACH_RADIUS, OUTPOST_REACH_RADIUS, TOWN_REACH_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import {
  applyAnchorEvents,
  chebyshevWithWrap,
  grantAnchorToBorder,
  isInReach,
  liveReachForOwner,
  reachOwnerCountAt,
  reachRadiusForAnchor,
  reachRadiusForKind,
  reachSetForPlayer,
  reassessBorderOnAnchorDeactivation,
  reconcileBorderAgainstLiveReach,
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

describe("reachRadiusForAnchor", () => {
  it("falls back to reachRadiusForKind when no override is set", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    expect(reachRadiusForAnchor(anchor)).toBe(OUTPOST_REACH_RADIUS);
  });

  it("uses radiusOverride when set, regardless of kind", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "OUTPOST", radiusOverride: 3 };
    expect(reachRadiusForAnchor(anchor)).toBe(3);
    expect(tileKeysInReach(anchor).length).toBe((2 * 3 + 1) ** 2);
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

describe("tileKeysInReach with land-gating", () => {
  // A radius-5 OUTPOST anchor at (0,0) with a strip of SEA at x=2 splitting
  // land at x=0..1 from land at x=3..10 on the same row.
  const isLandExceptStrip = (x: number, _y: number): boolean => x !== 2;

  it("does not cross a water strip to reach land on the far side within radius", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const keys = new Set(tileKeysInReach(anchor, isLandExceptStrip));
    // (3,0) is LAND, within the radius-5 disk, but only reachable by
    // stepping across the water strip at x=2 -- must NOT be included.
    expect(keys.has(tileKey(3, 0))).toBe(false);
    expect(keys.has(tileKey(4, 0))).toBe(false);
  });

  it("still includes a water tile directly adjacent to reached land (coastal edge)", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const keys = new Set(tileKeysInReach(anchor, isLandExceptStrip));
    // (1,0) is LAND and land-connected to the anchor; (2,0) is the water
    // strip directly adjacent to it -- included as a coastal edge tile, even
    // though it can't itself propagate reach any further.
    expect(keys.has(tileKey(1, 0))).toBe(true);
    expect(keys.has(tileKey(2, 0))).toBe(true);
  });

  it("crossesWater anchors ignore land-gating entirely", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "OUTPOST", crossesWater: true };
    const keys = new Set(tileKeysInReach(anchor, isLandExceptStrip));
    expect(keys.has(tileKey(3, 0))).toBe(true);
    expect(keys.has(tileKey(2, 0))).toBe(true);
  });

  it("without a landConnectivity query stays purely geometric (back-compat)", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const keys = new Set(tileKeysInReach(anchor));
    expect(keys.has(tileKey(3, 0))).toBe(true);
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

describe("reachOwnerCountAt", () => {
  it("returns 0 when no owner's live reach covers the tile", () => {
    const anchors: ReachAnchor[] = [{ x: 50, y: 50, ownerId: "p1", activatedAt: 1, kind: "TOWN" }];
    expect(reachOwnerCountAt(10, 10, anchors)).toBe(0);
  });

  it("returns 1 when exactly one owner's live reach covers the tile", () => {
    const anchors: ReachAnchor[] = [{ x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "TOWN" }];
    expect(reachOwnerCountAt(10, 10, anchors)).toBe(1);
  });

  it("counts an owner once even with several overlapping anchors", () => {
    const anchors: ReachAnchor[] = [
      { x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "TOWN" },
      { x: 11, y: 10, ownerId: "p1", activatedAt: 1, kind: "TOWN" }
    ];
    expect(reachOwnerCountAt(10, 10, anchors)).toBe(1);
  });

  it("returns 2+ when multiple owners' live reach overlaps the tile", () => {
    const anchors: ReachAnchor[] = [
      { x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "TOWN" },
      { x: 11, y: 10, ownerId: "p2", activatedAt: 1, kind: "TOWN" }
    ];
    expect(reachOwnerCountAt(10, 10, anchors)).toBe(2);
  });

  it("respects each anchor's own radius, including radiusOverride", () => {
    const anchors: ReachAnchor[] = [
      { x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "OUTPOST", radiusOverride: 1 }
    ];
    expect(reachOwnerCountAt(11, 10, anchors)).toBe(1);
    expect(reachOwnerCountAt(12, 10, anchors)).toBe(0);
  });

  it("wraps around world edges", () => {
    const anchors: ReachAnchor[] = [{ x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "DOCK" }];
    expect(reachOwnerCountAt(WORLD_WIDTH - 1, 0, anchors)).toBe(1);
  });

  it("without landConnectivity, counts a tile within geometric radius even across water", () => {
    const anchors: ReachAnchor[] = [{ x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "TOWN" }];
    expect(reachOwnerCountAt(13, 10, anchors)).toBe(1); // within TOWN_REACH_RADIUS=3, no terrain check
  });

  it("with landConnectivity, does not count a tile only reachable by crossing water", () => {
    // A full water column at x=11 severs every path (including diagonals) from the anchor to (12,10).
    const isLand = (x: number) => x !== 11;
    const anchors: ReachAnchor[] = [{ x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "TOWN" }];
    expect(reachOwnerCountAt(12, 10, anchors, isLand)).toBe(0);
  });

  it("with landConnectivity, still counts a tile reachable by an unbroken land path", () => {
    const isLand = () => true;
    const anchors: ReachAnchor[] = [{ x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "TOWN" }];
    expect(reachOwnerCountAt(12, 10, anchors, isLand)).toBe(1);
  });

  it("with landConnectivity, a crossesWater anchor is exempt from land-gating", () => {
    const isLand = (x: number, y: number) => x !== 11 || y !== 10;
    const anchors: ReachAnchor[] = [{ x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "OUTPOST", crossesWater: true }];
    expect(reachOwnerCountAt(12, 10, anchors, isLand)).toBe(1);
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
    // Contested at a tile OTHER than the incoming anchor's own tile (5,5) —
    // that exact case now always wins for the anchor's owner regardless of
    // rival defense (see the "anchor's own tile is always granted" tests
    // below); this test covers the ordinary defended-neighbour case.
    const existing = new Map([[tileKey(6, 6), "defender"]]);
    const anchor: ReachAnchor = { x: 5, y: 5, ownerId: "attacker", activatedAt: 2, kind: "DOCK" };
    const { border, overtaken } = grantAnchorToBorder(existing, anchor, (ownerId) =>
      ownerId === "defender" ? new Set([tileKey(6, 6)]) : new Set()
    );
    expect(border.get(tileKey(6, 6))).toBe("defender");
    expect(overtaken).toEqual([]);
  });

  it("contested tile flips to the attacker when the defender has no live coverage there", () => {
    const existing = new Map([[tileKey(5, 5), "defender"]]);
    const anchor: ReachAnchor = { x: 5, y: 5, ownerId: "attacker", activatedAt: 2, kind: "DOCK" };
    const { border, overtaken } = grantAnchorToBorder(existing, anchor, () => new Set());
    expect(border.get(tileKey(5, 5))).toBe("attacker");
    expect(overtaken).toEqual([{ tileKey: tileKey(5, 5), fromOwnerId: "defender", toOwnerId: "attacker" }]);
  });

  // Regression: a tile can be SETTLED by a player who never held reach over it
  // (the pre-fix AI auto-settle path settled its own FRONTIER tiles with no
  // reach check), so no border entry was ever written for that key. When a
  // rival's reach later covered it, the empty-slot branch granted the ground
  // silently with no overtaken entry — leaving the settled tile sitting inside
  // the new owner's border forever, since only overtaken tiles get downgraded.
  it("empty border slot over a rival's SETTLED tile is a contest, not free ground", () => {
    const anchor: ReachAnchor = { x: 5, y: 5, ownerId: "attacker", activatedAt: 2, kind: "DOCK" };
    const { border, overtaken } = grantAnchorToBorder(
      new Map(), // no border entry at all for (5,5)
      anchor,
      () => new Set(), // the settled owner has no live coverage there
      (key) => (key === tileKey(5, 5) ? "defender" : undefined)
    );
    expect(border.get(tileKey(5, 5))).toBe("attacker");
    expect(overtaken).toEqual([{ tileKey: tileKey(5, 5), fromOwnerId: "defender", toOwnerId: "attacker" }]);
  });

  // The defended case must not hand the slot over either: granting the border
  // while skipping the downgrade would leave the defender's SETTLED tile inside
  // the attacker's border with nothing left to dislodge it — the very state
  // this whole guard exists to prevent.
  it("empty border slot over a rival's SETTLED tile still respects live defense", () => {
    // Contested at a neighbouring tile (5,6), not the incoming anchor's own
    // tile (5,5) — that exact case now always wins for the anchor's owner,
    // see the "anchor's own tile is always granted" tests below.
    const anchor: ReachAnchor = { x: 5, y: 5, ownerId: "attacker", activatedAt: 2, kind: "DOCK" };
    const { border, overtaken } = grantAnchorToBorder(
      new Map(),
      anchor,
      (ownerId) => (ownerId === "defender" ? new Set([tileKey(5, 6)]) : new Set()),
      (key) => (key === tileKey(5, 6) ? "defender" : undefined)
    );
    expect(overtaken).toEqual([]);
    expect(border.get(tileKey(5, 6))).toBeUndefined();
    // The anchor's own tile is unaffected and still granted.
    expect(border.get(tileKey(5, 5))).toBe("attacker");
  });

  it("empty border slot over the anchor owner's own SETTLED tile is not a contest", () => {
    const anchor: ReachAnchor = { x: 5, y: 5, ownerId: "p1", activatedAt: 2, kind: "DOCK" };
    const { border, overtaken } = grantAnchorToBorder(
      new Map(),
      anchor,
      () => new Set(),
      (key) => (key === tileKey(5, 5) ? "p1" : undefined)
    );
    expect(border.get(tileKey(5, 5))).toBe("p1");
    expect(overtaken).toEqual([]);
  });

  // See reach-anchor-own-tile.test.ts for the "anchor's own tile is always
  // granted, even against a still-live rival" regression coverage — split
  // out to a separate file to keep this one under the 500-line cap.

  it("omitting settledOwnerAt keeps the original silent-grant behavior", () => {
    const anchor: ReachAnchor = { x: 5, y: 5, ownerId: "attacker", activatedAt: 2, kind: "DOCK" };
    const { border, overtaken } = grantAnchorToBorder(new Map(), anchor, () => new Set());
    expect(border.get(tileKey(5, 5))).toBe("attacker");
    expect(overtaken).toEqual([]);
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

  it("a live defending beacon holds neighbouring tiles against a contest, but never its own contested tile", () => {
    const beacon: ReachAnchor = { x: 200, y: 200, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    // Not realistically reachable in-game (you can't drop a new anchor on a
    // tile a rival still actively holds without capturing it first, which
    // deactivates their anchor there in the same transition — see "undefended
    // border withdraws only once an enemy anchor actually contests it" and
    // the capture-enclave tests below for the realistic flow). Kept as a
    // synthetic worst-case: even here, p2's own anchor tile still wins
    // (matches the "captured town keeps its own tile" rule), while p1's
    // still-active beacon keeps every neighbouring tile in its disk.
    const enemyBeacon: ReachAnchor = { x: 200, y: 200, ownerId: "p2", activatedAt: 5, kind: "OUTPOST" };
    const { border, overtaken } = applyAnchorEvents([
      { type: "ACTIVATE", anchor: beacon }, // still active, never deactivated
      { type: "ACTIVATE", anchor: enemyBeacon }
    ]);
    expect(border.get(tileKey(200, 200))).toBe("p2");
    expect(overtaken).toContainEqual({ tileKey: tileKey(200, 200), fromOwnerId: "p1", toOwnerId: "p2" });
    // p1's still-active beacon keeps defending every neighbouring tile.
    expect(border.get(tileKey(200 + OUTPOST_REACH_RADIUS, 200))).toBe("p1");
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

describe("reassessBorderOnAnchorDeactivation", () => {
  it("does nothing when no rival currently covers the vacated ground (stays sticky)", () => {
    const beacon: ReachAnchor = { x: 200, y: 200, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const existing = new Map([[tileKey(200, 200), "p1"]]);
    const { border, overtaken } = reassessBorderOnAnchorDeactivation(
      existing,
      beacon,
      new Set(), // p1 has no other coverage left here
      () => new Set(), // no rival covers it either
      ["p2"]
    );
    expect(border.get(tileKey(200, 200))).toBe("p1");
    expect(overtaken).toEqual([]);
  });

  it("does nothing when the owner still has other live coverage over the tile", () => {
    const beacon: ReachAnchor = { x: 200, y: 200, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const existing = new Map([[tileKey(200, 200), "p1"]]);
    const { border, overtaken } = reassessBorderOnAnchorDeactivation(
      existing,
      beacon,
      new Set([tileKey(200, 200)]), // p1's town still covers it
      (rivalId) => (rivalId === "p2" ? new Set([tileKey(200, 200)]) : new Set()), // rival is even sitting right there
      ["p2"]
    );
    expect(border.get(tileKey(200, 200))).toBe("p1");
    expect(overtaken).toEqual([]);
  });

  it("transfers the tile to a rival whose live reach already covers it", () => {
    const beacon: ReachAnchor = { x: 200, y: 200, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const existing = new Map([[tileKey(200, 200), "p1"]]);
    const { border, overtaken } = reassessBorderOnAnchorDeactivation(
      existing,
      beacon,
      new Set(), // p1 has nothing left defending it
      (rivalId) => (rivalId === "p2" ? new Set([tileKey(200, 200)]) : new Set()),
      ["p2"]
    );
    expect(border.get(tileKey(200, 200))).toBe("p2");
    expect(overtaken).toEqual([{ tileKey: tileKey(200, 200), fromOwnerId: "p1", toOwnerId: "p2" }]);
  });

  it("leaves tiles alone that already changed hands for an unrelated reason", () => {
    const beacon: ReachAnchor = { x: 200, y: 200, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const existing = new Map([[tileKey(200, 200), "p3"]]); // no longer p1's in the border at all
    const { border, overtaken } = reassessBorderOnAnchorDeactivation(
      existing,
      beacon,
      new Set(),
      (rivalId) => (rivalId === "p2" ? new Set([tileKey(200, 200)]) : new Set()),
      ["p2"]
    );
    expect(border.get(tileKey(200, 200))).toBe("p3");
    expect(overtaken).toEqual([]);
  });

  it("first rival in the ordered list wins when multiple rivals cover the tile", () => {
    const beacon: ReachAnchor = { x: 200, y: 200, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const existing = new Map([[tileKey(200, 200), "p1"]]);
    const { border, overtaken } = reassessBorderOnAnchorDeactivation(
      existing,
      beacon,
      new Set(),
      () => new Set([tileKey(200, 200)]), // every rival covers it
      ["p2", "p3"]
    );
    expect(border.get(tileKey(200, 200))).toBe("p2");
    expect(overtaken).toEqual([{ tileKey: tileKey(200, 200), fromOwnerId: "p1", toOwnerId: "p2" }]);
  });
});

describe("reconcileBorderAgainstLiveReach", () => {
  it("leaves an already-correct border entry untouched when the owner still has live coverage", () => {
    const anchor: ReachAnchor = { x: 200, y: 200, ownerId: "p1", activatedAt: 1, kind: "TOWN" };
    const correctBorder = new Map([[tileKey(200, 200), "p1"]]); // grantAnchorToBorder already got this right
    const { border, overtaken } = reconcileBorderAgainstLiveReach(
      correctBorder,
      [{ tileKey: tileKey(200, 200), ownerId: "p1" }],
      [anchor],
      ["p1", "p2"]
    );
    expect(border.get(tileKey(200, 200))).toBe("p1");
    expect(overtaken).toEqual([]);
  });

  it("leaves a settled tile alone when nobody currently covers it (sticky, no downgrade)", () => {
    const { border, overtaken } = reconcileBorderAgainstLiveReach(
      new Map(),
      [{ tileKey: tileKey(200, 200), ownerId: "p1" }],
      [], // no anchors at all cover it
      ["p1", "p2"]
    );
    expect(border.has(tileKey(200, 200))).toBe(false);
    expect(overtaken).toEqual([]);
  });

  it("transfers a settled tile to a rival whose live reach covers it when the owner no longer does", () => {
    const rivalAnchor: ReachAnchor = { x: 200, y: 200, ownerId: "p2", activatedAt: 1, kind: "TOWN" };
    const staleBorder = new Map([[tileKey(200, 200), "p1"]]); // border still (wrongly) says p1
    const { border, overtaken } = reconcileBorderAgainstLiveReach(
      staleBorder,
      [{ tileKey: tileKey(200, 200), ownerId: "p1" }], // but the tile is still SETTLED under p1 in the world
      [rivalAnchor], // p1 has no anchor left covering it; p2 does
      ["p1", "p2"]
    );
    expect(border.get(tileKey(200, 200))).toBe("p2");
    expect(overtaken).toEqual([{ tileKey: tileKey(200, 200), fromOwnerId: "p1", toOwnerId: "p2" }]);
  });

  it("also transfers a tile that grantAnchorToBorder-style reseeding would have silently dropped (no border entry at all)", () => {
    const rivalAnchor: ReachAnchor = { x: 200, y: 200, ownerId: "p2", activatedAt: 1, kind: "TOWN" };
    const { border, overtaken } = reconcileBorderAgainstLiveReach(
      new Map(), // no entry for this tile in border at all
      [{ tileKey: tileKey(200, 200), ownerId: "p1" }],
      [rivalAnchor],
      ["p1", "p2"]
    );
    expect(border.get(tileKey(200, 200))).toBe("p2");
    expect(overtaken).toEqual([{ tileKey: tileKey(200, 200), fromOwnerId: "p1", toOwnerId: "p2" }]);
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
