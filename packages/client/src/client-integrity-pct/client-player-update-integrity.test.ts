import { describe, expect, it } from "vitest";
import { applyPlayerUpdateIntegrity } from "./client-player-update-integrity.js";

const freshState = () => ({ defensibilityPct: 100, defensibilityAnimUntil: 0, defensibilityAnimDir: 0 as -1 | 0 | 1, ownedT: undefined as number | undefined, settledT: 1, settledE: 4 });

describe("applyPlayerUpdateIntegrity", () => {
  // The Integrity panel and the fallback read the server's owned-tile count, so they match the headline.
  it("keeps the server's owned land count and takes the authoritative percentage", () => {
    const state = freshState();
    applyPlayerUpdateIntegrity(state, { T: 144, Ts: 20, Es: 48, integrityPct: 100 }, 100, 0);
    expect(state.ownedT).toBe(144);
    expect(state.defensibilityPct).toBe(100);
  });

  it("recomputes from owned, open and garrisoned counts when no percentage is sent", () => {
    const state = { ...freshState(), settledT: 0, settledE: 48 };
    applyPlayerUpdateIntegrity(state, { T: 144, Ts: 0, Es: 48 }, 100, 0);
    expect(state.defensibilityPct).toBeCloseTo(70); // a perfect 12x12 square, nothing garrisoned: the full penalty
  });
});
