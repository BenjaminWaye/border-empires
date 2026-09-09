import { describe, expect, it } from "vitest";
import { MUSTER_ATTACK_COST } from "@border-empires/shared";
import { musterFillRatioForTile } from "./client-map-3d-muster-fill.js";
import type { MusterRateCache } from "./client-muster-prediction/client-muster-prediction.js";

describe("musterFillRatioForTile", () => {
  it("computes the ratio against MUSTER_ATTACK_COST for a fresh own-tile sample", () => {
    const rateByTile: MusterRateCache = new Map();
    const tile = { ownerId: "me", muster: { ownerId: "me", amount: MUSTER_ATTACK_COST / 2, mode: "HOLD" as const, updatedAt: 100 } };
    const ratio = musterFillRatioForTile(tile, "5,5", "me", 10_000, 10_000, rateByTile);
    expect(ratio).toBeCloseTo(0.5, 5);
  });

  it("does not predict for a tile owned by someone else", () => {
    const rateByTile: MusterRateCache = new Map();
    const tile = { ownerId: "rival", muster: { ownerId: "rival", amount: 10, mode: "HOLD" as const, updatedAt: 100 } };
    const ratio = musterFillRatioForTile(tile, "5,5", "me", 10_000, 10_000, rateByTile);
    expect(ratio).toBeCloseTo(10 / MUSTER_ATTACK_COST, 5);
  });

  it("clamps the ratio at 1 even if predicted amount exceeds MUSTER_ATTACK_COST", () => {
    const rateByTile: MusterRateCache = new Map();
    const tile = { ownerId: "me", muster: { ownerId: "me", amount: MUSTER_ATTACK_COST * 5, mode: "HOLD" as const, updatedAt: 100 } };
    const ratio = musterFillRatioForTile(tile, "5,5", "me", 1_000_000, 1_000_000, rateByTile);
    expect(ratio).toBe(1);
  });
});
