import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("map name label regression guard", () => {
  it("does not draw floating territory owner names on the map", () => {
    const source = clientMainSource();
    expect(source).not.toContain("const visibleTerritoryLabels =");
    expect(source).not.toContain("const drawCurvedTerritoryLabel =");
    expect(source).not.toContain("for (const territoryLabel of visibleTerritoryLabels())");
  });
});
