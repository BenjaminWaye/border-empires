import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client init login regression", () => {
  it("requests the first radius-0 world view after home-tile centering but before expensive minimap rebuild work in INIT", () => {
    const source = readFileSync(new URL("./client-network.ts", import.meta.url), "utf8");
    const initBlockStart = source.indexOf('if (msg.type === "INIT") {');
    const requestRefreshAt = source.indexOf("requestViewRefresh(0, true);", initBlockStart);
    const buildMiniMapAt = source.indexOf("buildMiniMapBase();", initBlockStart);
    const homeTileAt = source.indexOf("state.homeTile = homeTile;", initBlockStart);
    const broadRefreshAt = source.indexOf("requestViewRefresh();", initBlockStart);

    expect(initBlockStart).toBeGreaterThan(-1);
    expect(requestRefreshAt).toBeGreaterThan(-1);
    expect(buildMiniMapAt).toBeGreaterThan(-1);
    expect(homeTileAt).toBeGreaterThan(-1);
    expect(homeTileAt).toBeLessThan(requestRefreshAt);
    expect(requestRefreshAt).toBeLessThan(buildMiniMapAt);
    expect(broadRefreshAt === -1 || broadRefreshAt > buildMiniMapAt).toBe(true);
  });

  it("clears stale subscribe throttle state before the first INIT refresh", () => {
    const source = readFileSync(new URL("./client-network.ts", import.meta.url), "utf8");
    const initBlockStart = source.indexOf('if (msg.type === "INIT") {');
    const resetLastSubAt = source.indexOf("state.lastSubAt = 0;", initBlockStart);
    const resetLastSubRadius = source.indexOf("state.lastSubRadius = -1;", initBlockStart);
    const requestRefreshAt = source.indexOf("requestViewRefresh(0, true);", initBlockStart);

    expect(initBlockStart).toBeGreaterThan(-1);
    expect(resetLastSubAt).toBeGreaterThan(-1);
    expect(resetLastSubRadius).toBeGreaterThan(-1);
    expect(requestRefreshAt).toBeGreaterThan(-1);
    expect(resetLastSubAt).toBeLessThan(requestRefreshAt);
    expect(resetLastSubRadius).toBeLessThan(requestRefreshAt);
  });
});
