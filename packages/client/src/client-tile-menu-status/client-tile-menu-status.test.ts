import { describe, expect, it, vi } from "vitest";
import { encirclementRemainingMsForTile, isFrontierOriginCutOff, tileMenuHeaderStatusForTile } from "./client-tile-menu-status.js";
import type { Tile } from "../client-types.js";

const makeFrontierTile = (overrides: Partial<Tile> = {}): Tile => ({
  x: 10,
  y: 10,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "FRONTIER",
  ...overrides
});

describe("encirclementRemainingMsForTile", () => {
  it("returns remaining ms when cut-off timer is within 60 s window", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 30_000, frontierDecayKind: "ENCIRCLEMENT" });
    expect(encirclementRemainingMsForTile(tile, nowMs)).toBe(30_000);
  });

  it("returns undefined for garrisoned tiles", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ ownershipState: "SETTLED", frontierDecayAt: nowMs + 30_000, frontierDecayKind: "ENCIRCLEMENT" });
    expect(encirclementRemainingMsForTile(tile, nowMs)).toBeUndefined();
  });

  it("returns undefined when no frontierDecayAt", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile();
    expect(encirclementRemainingMsForTile(tile, nowMs)).toBeUndefined();
  });

  it("returns undefined when timer has already expired", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs - 1, frontierDecayKind: "ENCIRCLEMENT" }); // already expired
    expect(encirclementRemainingMsForTile(tile, nowMs)).toBeUndefined();
  });
});

describe("isFrontierOriginCutOff", () => {
  it("returns true for FRONTIER + ENCIRCLEMENT in-window", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 30_000, frontierDecayKind: "ENCIRCLEMENT" });
    expect(isFrontierOriginCutOff(tile, nowMs)).toBe(true);
  });

  it("returns false for SETTLED tiles even with encirclement decay params", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ ownershipState: "SETTLED", frontierDecayAt: nowMs + 30_000, frontierDecayKind: "ENCIRCLEMENT" });
    expect(isFrontierOriginCutOff(tile, nowMs)).toBe(false);
  });

  it("returns false when encirclement timer has expired", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs - 1, frontierDecayKind: "ENCIRCLEMENT" });
    expect(isFrontierOriginCutOff(tile, nowMs)).toBe(false);
  });

  it("returns false when no frontierDecayAt is set", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayKind: "ENCIRCLEMENT" });
    expect(isFrontierOriginCutOff(tile, nowMs)).toBe(false);
  });
});

describe("tileMenuHeaderStatusForTile — encirclement tooltip", () => {
  it("shows 'Cut off from supply' with countdown for blinking frontier tile", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 30_000, frontierDecayKind: "ENCIRCLEMENT" });
    const status = tileMenuHeaderStatusForTile(tile, nowMs);
    expect(status).toBeDefined();
    expect(status?.tone).toBe("warning");
    expect(status?.text).toMatch(/Cut off from supply/);
    expect(status?.text).toMatch(/30s/);
  });
});

describe("tileMenuHeaderStatusForTile — priority", () => {
  it("encirclement tooltip takes priority over capture-recovery status", () => {
    const nowMs = 1_000;
    // A tile that is both cut-off AND recently captured — encirclement wins.
    const tile: Tile = {
      ...makeFrontierTile({ frontierDecayAt: nowMs + 30_000, frontierDecayKind: "ENCIRCLEMENT" }),
      history: { lastCapturedAt: nowMs - 100, previousOwners: [], captureCount: 1, structureHistory: [] },
      economicStructure: {
        ownerId: "player-1",
        type: "HYDROGARDEN",
        status: "inactive",
        disabledUntil: nowMs + 5 * 60_000
      }
    };
    const status = tileMenuHeaderStatusForTile(tile, nowMs);
    expect(status?.text).toMatch(/Cut off from supply/);
  });
});

describe("tileMenuHeaderStatusForTile — reach lines", () => {
  it("shows \"Beyond your reach\" with the garrison/build explainer for own frontier in no-man's-land", () => {
    // Regression: this used to read "Beyond your reach — decays in 90s".
    // Out-of-reach frontier no longer decays, so the line explains what you
    // can't do there and how to extend reach instead of a countdown.
    const status = tileMenuHeaderStatusForTile(makeFrontierTile(), 1_000, () => false, () => []);
    expect(status?.text).toBe("Beyond your reach");
    expect(status?.helpText).toBe("Reach: 3 tiles from garrisoned towns (more with Dominion), 5 from Relay Beacons, over land only; mountains and sea stop it. Outside it: claim only, no garrison or build, lost if cut off. A Relay Beacon extends it.");
  });

  it("ignores a legacy OUT_OF_REACH timer instead of counting it down", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 90_000, frontierDecayKind: "OUT_OF_REACH" });
    expect(tileMenuHeaderStatusForTile(tile, nowMs, () => false)?.text).toBe("Beyond your reach");
    expect(tileMenuHeaderStatusForTile(tile, nowMs, () => true)).toBeUndefined();
  });

  it("lets encirclement outrank the reach line", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 30_000, frontierDecayKind: "ENCIRCLEMENT" });
    expect(tileMenuHeaderStatusForTile(tile, nowMs, () => false)?.text).toBe("Cut off from supply — disappears in 30s");
  });

  // Regression (2026-11 staging playtest): "can't garrison" sat above a working Garrison button on tiles the sim garrisons out of reach.
  it.each([
    ["a town", { town: { name: "Far", type: "FARMING", populationTier: "TOWN" } }],
    ["a dock", { dockId: "dock-far" }],
    ["a captured building", { economicStructure: { ownerId: "me", type: "HYDROGARDEN", status: "active" } }]
  ])("shows no reach warning on %s, which Garrison accepts out of reach", (_label, extra) => {
    expect(tileMenuHeaderStatusForTile(makeFrontierTile(extra as never), 1_000, () => false, () => ["Ravenwood"])).toBeUndefined();
    expect(tileMenuHeaderStatusForTile(makeFrontierTile({ ...(extra as object), reachOwnerId: "player-2" } as never), 1_000, () => false, () => [])).toBeUndefined();
  });

  it("shows \"Inside Enemy Reach\" when a rival's reach border covers the tile but its owner isn't known locally", () => {
    const tile = makeFrontierTile({ reachOwnerId: "player-2" });
    expect(tileMenuHeaderStatusForTile(tile, 1_000, () => false, () => [])?.text).toBe("Inside Enemy Reach");
  });

  it("names the covering empire instead of \"Enemy\" when it is known", () => {
    const tile = makeFrontierTile();
    expect(tileMenuHeaderStatusForTile(tile, 1_000, () => false, () => ["Ravenwood"])?.text).toBe("Inside Ravenwood Reach");
  });

  it("names both empires when two reaches overlap the tile", () => {
    const tile = makeFrontierTile();
    expect(tileMenuHeaderStatusForTile(tile, 1_000, () => false, () => ["Ravenwood", "Ironvale"])?.text).toBe("Inside Ravenwood and Ironvale Reach");
  });

  it("falls back to \"Enemy\" when the owner is unknown or there are too many to list", () => {
    const tile = makeFrontierTile({ reachOwnerId: "player-2" });
    expect(tileMenuHeaderStatusForTile(tile, 1_000, () => false, () => [])?.text).toBe("Inside Enemy Reach");
    expect(tileMenuHeaderStatusForTile(tile, 1_000, () => false, () => ["A", "B", "C"])?.text).toBe("Inside Enemy Reach");
  });

  it("does not look up owner names unless the reach line is shown", () => {
    const lookup = vi.fn(() => ["Ravenwood"]);
    tileMenuHeaderStatusForTile(makeFrontierTile(), 1_000, () => true, lookup);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("escapes player-controlled names and attaches the explainer to the reach line only", () => {
    const tile = makeFrontierTile();
    const status = tileMenuHeaderStatusForTile(tile, 1_000, () => false, () => ["<b>Evil</b>"]);
    expect(status?.text).toBe("Inside &lt;b&gt;Evil&lt;/b&gt; Reach");
    expect(status?.helpText).toBe("Can't garrison inside another empire's reach.");
    expect(tileMenuHeaderStatusForTile(tile, 1_000, () => true)?.helpText).toBeUndefined();
  });
});

describe("tileMenuHeaderStatusForTile capture hold", () => {
  it("shows a Holding captured ground countdown while the hold is active", () => {
    const nowMs = 1_000;
    const status = tileMenuHeaderStatusForTile(makeFrontierTile({ captureHoldUntil: nowMs + 42_000 }), nowMs);
    expect(status?.text).toBe("Holding captured ground 00:42");
    expect(status?.tone).toBe("neutral");
  });

  it("explains the reach requirement before suggesting a garrison", () => {
    const held = makeFrontierTile({ captureHoldUntil: 43_000 });
    expect(tileMenuHeaderStatusForTile(held, 1_000, () => false)?.helpText).toContain("Extend your reach");
    expect(tileMenuHeaderStatusForTile(held, 1_000, () => true)?.helpText).toContain("Garrison it to keep it defended.");
  });

  it("drops the line once the hold has ended or the tile is garrisoned", () => {
    const nowMs = 1_000;
    expect(tileMenuHeaderStatusForTile(makeFrontierTile({ captureHoldUntil: nowMs - 1 }), nowMs)).toBeUndefined();
    expect(tileMenuHeaderStatusForTile(makeFrontierTile({ ownershipState: "SETTLED", captureHoldUntil: nowMs + 42_000 }), nowMs)).toBeUndefined();
  });
});
