import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client bootstrap staging regression", () => {
  it("requests the first world view immediately at radius 1 and defers a wider refresh after the first chunk", () => {
    const source = readFileSync(new URL("./client-network.ts", import.meta.url), "utf8");
    expect(source).toContain("requestViewRefresh(1, true);");
    expect(source).toContain("deferredBootstrapRefreshTimer");
    expect(source).toContain("requestViewRefresh(2, true);");
  });

  it("keeps bootstrap retries at radius 1 while the first chunk is still pending", () => {
    const source = readFileSync(new URL("./client-runtime-timers.ts", import.meta.url), "utf8");
    expect(source).toContain("Date.now() - state.lastSubAt > 4_000");
    expect(source).toContain("deps.requestViewRefresh(1, true);");
    expect(source.includes("deps.requestViewRefresh(3, true);")).toBe(false);
  });
});
