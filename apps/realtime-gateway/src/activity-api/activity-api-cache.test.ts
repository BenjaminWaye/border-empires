import { describe, expect, it } from "vitest";

import { createActivityApiCache } from "./activity-api-cache.js";

describe("createActivityApiCache", () => {
  it("returns undefined before anything is set", () => {
    const cache = createActivityApiCache<number>({ ttlMs: 1_000, now: () => 0 });
    expect(cache.get()).toBeUndefined();
  });

  it("returns the cached value within the TTL", () => {
    let now = 0;
    const cache = createActivityApiCache<number>({ ttlMs: 1_000, now: () => now });
    cache.set(42);
    now = 999;
    expect(cache.get()).toBe(42);
  });

  it("expires the value after the TTL elapses", () => {
    let now = 0;
    const cache = createActivityApiCache<number>({ ttlMs: 1_000, now: () => now });
    cache.set(42);
    now = 1_001;
    expect(cache.get()).toBeUndefined();
  });
});
