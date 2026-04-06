import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const renderSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./client-map-render.ts"), "utf8");
};

describe("road style regression guard", () => {
  it("draws roads as a single stroke without a dark edge outline", () => {
    const source = renderSource();

    expect(source).toContain('ctx.strokeStyle = "rgba(210, 180, 120, 0.92)"');
    expect(source).not.toContain('ctx.strokeStyle = "rgba(88, 62, 34, 0.42)"');
    expect(source).not.toContain("const innerWidth = Math.max(1, roadWidth * 0.58);");
  });
});
