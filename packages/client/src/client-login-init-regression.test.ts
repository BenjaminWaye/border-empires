import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client init login regression", () => {
  it("requests the first radius-1 world view before expensive minimap rebuild work in INIT", () => {
    const source = readFileSync(new URL("./client-network.ts", import.meta.url), "utf8");
    const initBlockStart = source.indexOf('if (msg.type === "INIT") {');
    const requestRefreshAt = source.indexOf("requestViewRefresh(1, true);", initBlockStart);
    const buildMiniMapAt = source.indexOf("buildMiniMapBase();", initBlockStart);
    const broadRefreshAt = source.indexOf("requestViewRefresh();", initBlockStart);

    expect(initBlockStart).toBeGreaterThan(-1);
    expect(requestRefreshAt).toBeGreaterThan(-1);
    expect(buildMiniMapAt).toBeGreaterThan(-1);
    expect(requestRefreshAt).toBeLessThan(buildMiniMapAt);
    expect(broadRefreshAt === -1 || broadRefreshAt > buildMiniMapAt).toBe(true);
  });
});
