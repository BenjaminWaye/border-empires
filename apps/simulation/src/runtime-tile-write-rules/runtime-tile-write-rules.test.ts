import type { DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { updateTileSettledAt, withoutStaleCaptureHold } from "./runtime-tile-write-rules.js";

const NOW = 1_000_000;
const tile = (overrides: Partial<DomainTileState> = {}): DomainTileState => ({ x: 1, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER", ...overrides });

describe("withoutStaleCaptureHold", () => {
  it("keeps a live hold, including a freshly stamped one on a capture", () => {
    expect(withoutStaleCaptureHold(tile(), tile({ captureHoldUntil: NOW + 1 }), NOW).captureHoldUntil).toBe(NOW + 1);
    const captured = withoutStaleCaptureHold(tile({ ownerId: "p2", captureHoldUntil: NOW + 5 }), tile({ captureHoldUntil: NOW + 60_000 }), NOW);
    expect(captured.captureHoldUntil).toBe(NOW + 60_000);
  });

  it("drops a hold once it expired, once the tile is garrisoned or neutral, or when a new owner merely inherits it", () => {
    expect("captureHoldUntil" in withoutStaleCaptureHold(tile(), tile({ captureHoldUntil: NOW }), NOW)).toBe(false);
    expect("captureHoldUntil" in withoutStaleCaptureHold(tile(), tile({ ownershipState: "SETTLED", captureHoldUntil: NOW + 1 }), NOW)).toBe(false);
    const { ownerId: _o, ownershipState: _s, ...neutral } = tile({ captureHoldUntil: NOW + 1 });
    expect("captureHoldUntil" in withoutStaleCaptureHold(tile(), neutral, NOW)).toBe(false);
    const inherited = withoutStaleCaptureHold(tile({ captureHoldUntil: NOW + 1 }), tile({ ownerId: "p3", captureHoldUntil: NOW + 1 }), NOW);
    expect("captureHoldUntil" in inherited).toBe(false);
  });
});

describe("updateTileSettledAt", () => {
  it("stamps newly settled tiles, preserves same-owner stamps and clears on leaving SETTLED", () => {
    const map = new Map<string, number>();
    updateTileSettledAt(map, "k", tile(), tile({ ownershipState: "SETTLED" }), 10);
    expect(map.get("k")).toBe(10);
    expect(updateTileSettledAt(map, "k", tile({ ownershipState: "SETTLED" }), tile({ ownershipState: "SETTLED" }), 20)).toBe(true);
    expect(map.get("k")).toBe(10);
    updateTileSettledAt(map, "k", tile({ ownershipState: "SETTLED" }), tile({ ownerId: "p2", ownershipState: "SETTLED" }), 30);
    expect(map.get("k")).toBe(30);
    updateTileSettledAt(map, "k", tile({ ownershipState: "SETTLED" }), tile(), 40);
    expect(map.has("k")).toBe(false);
  });
});
