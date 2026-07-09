import { describe, expect, it } from "vitest";

import { buildTileDeltaGroupKey } from "./tile-delta-group-key.js";

describe("buildTileDeltaGroupKey", () => {
  it("gives a full delta and a clear-only stub for the SAME tile distinct keys", () => {
    // Regression: without the ":c" marker these collide, so a non-visible
    // subscriber's clear stub reuses a visible subscriber's cached full-delta
    // proto — leaking fog and dropping the ownershipClearOnly flag.
    const fullDelta = [{ x: 49, y: 288, ownerId: undefined, ownershipClearOnly: undefined, terrain: "LAND" }];
    const clearStub = [{ x: 49, y: 288, ownerId: undefined, ownershipClearOnly: true }];

    expect(buildTileDeltaGroupKey(fullDelta)).not.toBe(buildTileDeltaGroupKey(clearStub));
    expect(buildTileDeltaGroupKey(clearStub)).toBe("49:288:c");
    expect(buildTileDeltaGroupKey(fullDelta)).toBe("49:288");
  });

  it("marks a redacted (no ownerId key) stub with ':r' and never confuses it with ':c'", () => {
    const redacted = [{ x: 1, y: 2 }]; // no ownerId key at all
    const clearStub = [{ x: 1, y: 2, ownerId: undefined, ownershipClearOnly: true }];

    expect(buildTileDeltaGroupKey(redacted)).toBe("1:2:r");
    expect(buildTileDeltaGroupKey(clearStub)).toBe("1:2:c");
  });

  it("keeps identical clear stubs sharing a key (dedup still works for same-variant subscribers)", () => {
    const a = [{ x: 5, y: 5, ownerId: undefined, ownershipClearOnly: true }];
    const b = [{ x: 5, y: 5, ownerId: undefined, ownershipClearOnly: true }];
    expect(buildTileDeltaGroupKey(a)).toBe(buildTileDeltaGroupKey(b));
  });

  it("joins multiple tiles with '|' preserving per-tile suffixes", () => {
    const deltas = [
      { x: 1, y: 1, ownerId: "p1" },
      { x: 2, y: 2, ownerId: undefined, ownershipClearOnly: true },
      { x: 3, y: 3 }
    ];
    expect(buildTileDeltaGroupKey(deltas)).toBe("1:1|2:2:c|3:3:r");
  });
});
