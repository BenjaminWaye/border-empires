import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./client-hud.ts"), "utf8");
};

describe("mobile HUD gold rate regression guard", () => {
  it("keeps the per-minute suffix on the compact gold chip", () => {
    expect(clientSource()).toContain('const mobileGoldRateText = `${netGoldPerMinute > 0 ? "+" : ""}${netGoldPerMinute.toFixed(0)}/m`;');
  });
});
