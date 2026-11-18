import { describe, expect, it } from "vitest";

import { sweepExpiredCacheEntries } from "./sweep-expired-cache-entries.js";

describe("sweepExpiredCacheEntries", () => {
  it("drops entries at or past their expiry and keeps live ones", () => {
    const cache = new Map([["old", { expiresAt: 100 }], ["edge", { expiresAt: 200 }], ["live", { expiresAt: 201 }]]);
    sweepExpiredCacheEntries(cache, 200);
    expect([...cache.keys()]).toEqual(["live"]);
  });
});
