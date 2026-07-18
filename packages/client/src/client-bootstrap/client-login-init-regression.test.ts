import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The INIT message handling this file asserts on was extracted out of
// client-network.ts (which is over the repo's 500-line cap and may not grow)
// into client-network-init-message.ts. Read from the new location.
describe("client init login regression", () => {
  it("requests the first radius-1 world view after home-tile centering but before expensive minimap rebuild work in INIT", () => {
    const source = readFileSync(new URL("../client-network-init-message/client-network-init-message.ts", import.meta.url), "utf8");
    const requestRefreshAt = source.indexOf("requestViewRefresh(1, true);");
    const buildMiniMapAt = source.indexOf("buildMiniMapBase();");
    const homeTileAt = source.indexOf("state.homeTile = homeTile;");
    const broadRefreshAt = source.indexOf("requestViewRefresh();");

    expect(requestRefreshAt).toBeGreaterThan(-1);
    expect(buildMiniMapAt).toBeGreaterThan(-1);
    expect(homeTileAt).toBeGreaterThan(-1);
    expect(homeTileAt).toBeLessThan(requestRefreshAt);
    expect(requestRefreshAt).toBeLessThan(buildMiniMapAt);
    expect(broadRefreshAt === -1 || broadRefreshAt > buildMiniMapAt).toBe(true);
  });

  it("clears stale subscribe throttle state before the first INIT refresh", () => {
    const source = readFileSync(new URL("../client-network-init-message/client-network-init-message.ts", import.meta.url), "utf8");
    const resetLastSubAt = source.indexOf("state.lastSubAt = 0;");
    const resetLastSubRadius = source.indexOf("state.lastSubRadius = -1;");
    const requestRefreshAt = source.indexOf("requestViewRefresh(1, true);");

    expect(resetLastSubAt).toBeGreaterThan(-1);
    expect(resetLastSubRadius).toBeGreaterThan(-1);
    expect(requestRefreshAt).toBeGreaterThan(-1);
    expect(resetLastSubAt).toBeLessThan(requestRefreshAt);
    expect(resetLastSubRadius).toBeLessThan(requestRefreshAt);
  });
});
