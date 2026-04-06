import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client init login regression", () => {
  it("requests the first world view before expensive minimap rebuild work in INIT", () => {
    const source = readFileSync(new URL("./client-network.ts", import.meta.url), "utf8");
    const initBlockStart = source.indexOf('if (msg.type === "INIT") {');
    const requestRefreshAt = source.indexOf("requestViewRefresh();", initBlockStart);
    const buildMiniMapAt = source.indexOf("buildMiniMapBase();", initBlockStart);

    expect(initBlockStart).toBeGreaterThan(-1);
    expect(requestRefreshAt).toBeGreaterThan(-1);
    expect(buildMiniMapAt).toBeGreaterThan(-1);
    expect(requestRefreshAt).toBeLessThan(buildMiniMapAt);
  });
});
