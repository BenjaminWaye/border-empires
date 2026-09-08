import { describe, expect, it } from "vitest";
import { predictedMusterAmount, type MusterRateCache } from "./client-muster-prediction.js";

describe("predictedMusterAmount", () => {
  it("returns the raw amount (and doesn't anchor a cache entry) when the tile isn't owned by the given player", () => {
    const rateByTile: MusterRateCache = new Map();
    const tile = { ownerId: "rival", muster: { ownerId: "rival", amount: 42, mode: "HOLD" as const, updatedAt: 1_000 } };
    expect(predictedMusterAmount(rateByTile, "5,5", tile, "me", 1_000, 1_000, 2_000)).toBe(42);
    expect(rateByTile.has("5,5")).toBe(false);
  });

  it("stops predicting the moment ownership flips away, even with a live cache entry", () => {
    const rateByTile: MusterRateCache = new Map();
    const owned = { ownerId: "me", muster: { ownerId: "me", amount: 10, mode: "HOLD" as const, updatedAt: 1_000 } };
    predictedMusterAmount(rateByTile, "5,5", owned, "me", 1_000, 1_000, 1_000);
    expect(rateByTile.has("5,5")).toBe(true);

    const captured = { ownerId: "rival", muster: { ownerId: "rival", amount: 10, mode: "HOLD" as const, updatedAt: 1_000 } };
    const result = predictedMusterAmount(rateByTile, "5,5", captured, "me", 1_000, 1_000, 50_000);
    expect(result).toBe(10);
    expect(rateByTile.has("5,5")).toBe(false);
  });

  it("prefers the server-reported ratePerMin over a derived two-sample rate", () => {
    const rateByTile: MusterRateCache = new Map();
    // First sample anchors with no prior data (derived rate would be 0).
    const first = { ownerId: "me", muster: { ownerId: "me", amount: 0, mode: "HOLD" as const, updatedAt: 1_000, ratePerMin: 60 } };
    predictedMusterAmount(rateByTile, "5,5", first, "me", 1_000, 1_000, 1_000);

    // Second sample: server says the flag is still at 0 (e.g. a stamp-only
    // tick with no headroom) but reports ratePerMin: 120 — a naive derived
    // rate from these two samples would be 0, but the server rate should
    // still drive the prediction going forward.
    const second = { ownerId: "me", muster: { ownerId: "me", amount: 0, mode: "HOLD" as const, updatedAt: 2_000, ratePerMin: 120 } };
    predictedMusterAmount(rateByTile, "5,5", second, "me", 1_000, 1_000, 2_000);

    // 3 seconds after the second sample was received locally, at 120/min
    // the flag should have accrued 120/60 * 3 = 6.
    const predicted = predictedMusterAmount(rateByTile, "5,5", second, "me", 1_000, 1_000, 5_000);
    expect(predicted).toBeCloseTo(6, 5);
  });

  it("falls back to a derived two-sample rate when the server hasn't supplied ratePerMin", () => {
    const rateByTile: MusterRateCache = new Map();
    const first = { ownerId: "me", muster: { ownerId: "me", amount: 0, mode: "HOLD" as const, updatedAt: 1_000 } };
    predictedMusterAmount(rateByTile, "5,5", first, "me", 1_000, 1_000, 1_000);

    // 10s later, server reports amount grew to 20 (no ratePerMin) -> derived
    // rate is 20 / 10_000ms = 0.002/ms = 120/min.
    const second = { ownerId: "me", muster: { ownerId: "me", amount: 20, mode: "HOLD" as const, updatedAt: 11_000 } };
    predictedMusterAmount(rateByTile, "5,5", second, "me", 1_000, 1_000, 11_000);

    // 5s after that sample was received, expect +0.002*5000 = 10 more.
    const predicted = predictedMusterAmount(rateByTile, "5,5", second, "me", 1_000, 1_000, 16_000);
    expect(predicted).toBeCloseTo(30, 5);
  });

  it("clamps the predicted amount at the given cap", () => {
    const rateByTile: MusterRateCache = new Map();
    const first = { ownerId: "me", muster: { ownerId: "me", amount: 90, mode: "HOLD" as const, updatedAt: 1_000, ratePerMin: 600 } };
    predictedMusterAmount(rateByTile, "5,5", first, "me", 100, 1_000, 1_000);
    // At 600/min = 10/s, 5s later would be 90 + 50 = 140 uncapped, but cap is 100.
    const predicted = predictedMusterAmount(rateByTile, "5,5", first, "me", 100, 1_000, 6_000);
    expect(predicted).toBe(100);
  });

  it("clamps growth to the player's current manpower pool -- can't predict past what the pool could supply", () => {
    const rateByTile: MusterRateCache = new Map();
    const first = { ownerId: "me", muster: { ownerId: "me", amount: 50, mode: "HOLD" as const, updatedAt: 1_000, ratePerMin: 600 } };
    predictedMusterAmount(rateByTile, "5,5", first, "me", 1_000, 3, 1_000);
    // At 600/min = 10/s, 5s later would be +50 uncapped, but only 3 manpower
    // is left in the pool, so growth ceiling is 50 + 3 = 53.
    const predicted = predictedMusterAmount(rateByTile, "5,5", first, "me", 1_000, 3, 6_000);
    expect(predicted).toBe(53);
  });

  it("tolerates a skewed local clock by anchoring elapsed time on local receipt time, not the server's updatedAt", () => {
    const rateByTile: MusterRateCache = new Map();
    // Server's updatedAt is far in the "future" relative to a skewed local
    // clock at the moment of receipt (e.g. local clock is 1 hour behind).
    const skewedServerUpdatedAt = 4_000_000;
    const localReceiptTime = 1_000;
    const first = { ownerId: "me", muster: { ownerId: "me", amount: 0, mode: "HOLD" as const, updatedAt: skewedServerUpdatedAt, ratePerMin: 60 } };
    const anchored = predictedMusterAmount(rateByTile, "5,5", first, "me", 1_000, 1_000, localReceiptTime);
    // First call always just returns the (capped) raw amount.
    expect(anchored).toBe(0);

    // 2s of *local* wall-clock time pass; despite the server timestamp
    // being wildly different from the local clock, elapsed time for
    // interpolation must come from local receipt time only.
    const predicted = predictedMusterAmount(rateByTile, "5,5", first, "me", 1_000, 1_000, localReceiptTime + 2_000);
    expect(predicted).toBeCloseTo((60 / 60_000) * 2_000, 5);
  });
});
