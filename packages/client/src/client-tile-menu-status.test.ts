import { describe, expect, it } from "vitest";
import { encirclementRemainingMsForTile, tileMenuHeaderStatusForTile } from "./client-tile-menu-status.js";
import type { Tile } from "./client-types.js";

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
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 30_000 });
    expect(encirclementRemainingMsForTile(tile, nowMs)).toBe(30_000);
  });

  it("returns undefined when frontierDecayAt is beyond 60 s (natural decay only)", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 9 * 60_000 });
    expect(encirclementRemainingMsForTile(tile, nowMs)).toBeUndefined();
  });

  it("returns undefined for settled tiles", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ ownershipState: "SETTLED", frontierDecayAt: nowMs + 30_000 });
    expect(encirclementRemainingMsForTile(tile, nowMs)).toBeUndefined();
  });

  it("returns undefined when no frontierDecayAt", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile();
    expect(encirclementRemainingMsForTile(tile, nowMs)).toBeUndefined();
  });

  it("returns undefined when timer has already expired", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs - 1 }); // already expired
    expect(encirclementRemainingMsForTile(tile, nowMs)).toBeUndefined();
  });
});

describe("tileMenuHeaderStatusForTile — encirclement tooltip", () => {
  it("shows 'Cut off from supply' with countdown for blinking frontier tile", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 30_000 });
    const status = tileMenuHeaderStatusForTile(tile, nowMs);
    expect(status).toBeDefined();
    expect(status?.tone).toBe("warning");
    expect(status?.text).toMatch(/Cut off from supply/);
    expect(status?.text).toMatch(/30s/);
  });

  it("does not show encirclement tooltip for tile with only natural 10-min decay", () => {
    const nowMs = 1_000;
    const tile = makeFrontierTile({ frontierDecayAt: nowMs + 9 * 60_000 });
    const status = tileMenuHeaderStatusForTile(tile, nowMs);
    // No encirclement and no capture recovery → undefined
    expect(status).toBeUndefined();
  });

  it("encirclement tooltip takes priority over capture-recovery status", () => {
    const nowMs = 1_000;
    // A tile that is both cut-off AND recently captured — encirclement wins.
    const tile: Tile = {
      ...makeFrontierTile({ frontierDecayAt: nowMs + 30_000 }),
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
