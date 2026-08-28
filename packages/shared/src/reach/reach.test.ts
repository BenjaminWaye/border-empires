import { describe, expect, it } from "vitest";

import { DOCK_REACH_RADIUS, OUTPOST_REACH_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import {
  applyAnchorEvents,
  grantAnchorToBorder,
  isInReach,
  liveReachForOwner,
  reachOwnerCountAt,
  reachSetForPlayer,
  reassessBorderOnAnchorDeactivation,
  reconcileBorderAgainstLiveReach,
  tileKey,
  type ReachAnchor
} from "./reach.js";

// Geometry-helper tests (reachRadiusForKind, tileKeysInReach, chebyshevWithWrap,
// etc.) live in reach-geometry.test.ts, split out to keep this file under the
// 500-line cap.

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
  it("vacates peripheral ground when no rival currently covers it either (no longer sticky forever)", () => {
    const beacon: ReachAnchor = { x: 200, y: 200, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    // A tile in the beacon's disk but NOT its own founding tile.
    const peripheral = tileKey(202, 200);
    const existing = new Map([[peripheral, "p1"]]);
    const { border, overtaken } = reassessBorderOnAnchorDeactivation(
      existing,
      beacon,
      new Set(), // p1 has no other coverage left here
      () => new Set(), // no rival covers it either
      ["p2"]
    );
    expect(border.has(peripheral)).toBe(false);
    expect(overtaken).toEqual([{ tileKey: peripheral, fromOwnerId: "p1", toOwnerId: "" }]);
  });

  it("vacates the anchor's own founding tile too, same as any other ground it covered", () => {
    const beacon: ReachAnchor = { x: 200, y: 200, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const existing = new Map([[tileKey(200, 200), "p1"]]);
    const { border, overtaken } = reassessBorderOnAnchorDeactivation(
      existing,
      beacon,
      new Set(), // p1 has no other coverage left here
      () => new Set(), // no rival covers it either
      ["p2"]
    );
    // No exception for the anchor's own tile: recovering it means extending
    // reach back over it (another anchor, or expanding in from elsewhere)
    // and SETTLE-ing it again.
    expect(border.has(tileKey(200, 200))).toBe(false);
    expect(overtaken).toEqual([{ tileKey: tileKey(200, 200), fromOwnerId: "p1", toOwnerId: "" }]);
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
