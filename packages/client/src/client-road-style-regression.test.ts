import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const renderSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./client-road-render.ts"), "utf8");
};

describe("road style regression guard", () => {
  it("draws roads as a layered dirt path with an edge and highlight", () => {
    const source = renderSource();

    expect(source).toContain('outer: "rgba(104, 72, 40, 0.82)"');
    expect(source).toContain('fill: "rgba(190, 156, 99, 0.96)"');
    expect(source).toContain('highlight: "rgba(226, 200, 139, 0.7)"');
    expect(source).toContain("ctx.lineWidth = roadWidth * 1.34;");
    expect(source).toContain('ctx.strokeStyle = colors.highlight;');
  });
});
