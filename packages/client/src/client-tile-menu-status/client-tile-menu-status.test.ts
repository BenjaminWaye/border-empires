import { describe, expect, it } from "vitest";
import { encirclementRemainingMsForTile, isFrontierNaturallyDecaying, isFrontierOriginCutOff, naturalDecayRemainingMsForTile, tileMenuHeaderStatusForTile } from "./client-tile-menu-status.js";
import type { Tile } from "../client-types.js";

const ENCIRCLEMENT_DECAY_MS = 60_000;

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

  it("returns undefined when frontierDecayAt is natural decay, even in the final 60 s", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 30_000, frontierDecayKind: "NATURAL" });
    expect(encirclementRemainingMsForTile(tile, nowMs)).toBeUndefined();
  });

  it("returns undefined for settled tiles", () => {
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

  it("returns false for NATURAL decay kind (not encirclement)", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 30_000, frontierDecayKind: "NATURAL" });
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

  it("does not show any decay header when natural decay is more than 60 s away", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 9 * 60_000, frontierDecayKind: "NATURAL" });
    const status = tileMenuHeaderStatusForTile(tile, nowMs);
    expect(status).toBeUndefined();
  });

  it("shows 'Frontier collapsing' countdown in the final 60 s of natural decay", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 45_000, frontierDecayKind: "NATURAL" });
    const status = tileMenuHeaderStatusForTile(tile, nowMs);
    expect(status?.tone).toBe("warning");
    expect(status?.text).toMatch(/Frontier collapsing/);
    expect(status?.text).toMatch(/45s/);
  });

});

describe("naturalDecayRemainingMsForTile", () => {
  it("returns remaining ms in the final 60 s", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 30_000, frontierDecayKind: "NATURAL" });
    expect(naturalDecayRemainingMsForTile(tile, nowMs)).toBe(30_000);
  });

  it("returns undefined when more than 60 s remain", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 9 * 60_000, frontierDecayKind: "NATURAL" });
    expect(naturalDecayRemainingMsForTile(tile, nowMs)).toBeUndefined();
  });

  it("returns undefined for ENCIRCLEMENT-kind tiles", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 30_000, frontierDecayKind: "ENCIRCLEMENT" });
    expect(naturalDecayRemainingMsForTile(tile, nowMs)).toBeUndefined();
  });

  it("returns undefined when timer has already expired", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs - 1, frontierDecayKind: "NATURAL" });
    expect(naturalDecayRemainingMsForTile(tile, nowMs)).toBeUndefined();
  });

  it("returns undefined for settled tiles", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ ownershipState: "SETTLED", frontierDecayAt: nowMs + 30_000, frontierDecayKind: "NATURAL" });
    expect(naturalDecayRemainingMsForTile(tile, nowMs)).toBeUndefined();
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
        type: "FARMSTEAD",
        status: "inactive",
        disabledUntil: nowMs + 5 * 60_000
      }
    };
    const status = tileMenuHeaderStatusForTile(tile, nowMs);
    expect(status?.text).toMatch(/Cut off from supply/);
  });
});

describe("isFrontierNaturallyDecaying", () => {
  it("returns false for SETTLED tiles", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ ownershipState: "SETTLED", frontierDecayAt: nowMs + 9 * 60_000, frontierDecayKind: "NATURAL" });
    expect(isFrontierNaturallyDecaying(tile, nowMs)).toBe(false);
  });

  it("returns false for ENCIRCLEMENT decay kind", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 30_000, frontierDecayKind: "ENCIRCLEMENT" });
    expect(isFrontierNaturallyDecaying(tile, nowMs)).toBe(false);
  });

  it("returns false when timer has expired", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs - 1, frontierDecayKind: "NATURAL" });
    expect(isFrontierNaturallyDecaying(tile, nowMs)).toBe(false);
  });

  it("returns true for FRONTIER + NATURAL + future timer (full 10 min window)", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 9 * 60_000, frontierDecayKind: "NATURAL" });
    expect(isFrontierNaturallyDecaying(tile, nowMs)).toBe(true);
  });

  it("returns false when no frontierDecayAt is set", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayKind: "NATURAL" });
    expect(isFrontierNaturallyDecaying(tile, nowMs)).toBe(false);
  });
});
