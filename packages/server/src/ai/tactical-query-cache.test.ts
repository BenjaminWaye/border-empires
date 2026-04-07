import { describe, expect, it } from "vitest";

import { resolveCachedTacticalQuery } from "./tactical-query-cache.js";

describe("tactical query cache", () => {
  it("reuses cached values when version and signature are unchanged", () => {
    const cache = new Map();
    let computeCount = 0;

    const first = resolveCachedTacticalQuery(cache, "enemy_attack", {
      version: 1,
      signature: "sig-a",
      nowMs: 1_000,
      minIntervalMs: 5_000,
      compute: () => {
        computeCount += 1;
        return { target: 1 };
      }
    });
    const second = resolveCachedTacticalQuery(cache, "enemy_attack", {
      version: 1,
      signature: "sig-a",
      nowMs: 2_000,
      minIntervalMs: 5_000,
      compute: () => {
        computeCount += 1;
        return { target: 2 };
      }
    });

    expect(first).toEqual({ target: 1 });
    expect(second).toEqual({ target: 1 });
    expect(computeCount).toBe(1);
  });

  it("recomputes when the territory version changes", () => {
    const cache = new Map();
    let computeCount = 0;

    resolveCachedTacticalQuery(cache, "enemy_attack", {
      version: 1,
      signature: "sig-a",
      nowMs: 1_000,
      minIntervalMs: 5_000,
      compute: () => {
        computeCount += 1;
        return { target: 1 };
      }
    });
    const second = resolveCachedTacticalQuery(cache, "enemy_attack", {
      version: 2,
      signature: "sig-a",
      nowMs: 2_000,
      minIntervalMs: 5_000,
      compute: () => {
        computeCount += 1;
        return { target: 2 };
      }
    });

    expect(second).toEqual({ target: 2 });
    expect(computeCount).toBe(2);
  });
});
