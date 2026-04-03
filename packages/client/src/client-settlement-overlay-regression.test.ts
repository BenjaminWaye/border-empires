import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("settlement overlay regression guard", () => {
  it("uses dedicated settlement overlays instead of ancient-town art", () => {
    const source = clientMainSource();
    expect(source).toContain('SETTLEMENT: overlaySrc("settlement-overlay-sand.svg")');
    expect(source).toContain('SETTLEMENT: overlaySrc("settlement-overlay-grass.svg")');
  });

  it("hides abandon territory on live settlement tiles", () => {
    const source = clientMainSource();
    expect(source).toContain('if (tile.town?.populationTier !== "SETTLEMENT") out.push({ id: "abandon_territory", label: "Abandon Territory" });');
  });

  it("does not treat settlements as support-building anchors or build hosts", () => {
    const source = clientMainSource();
    expect(source).toContain('if (candidate.town.populationTier === "SETTLEMENT") continue;');
    expect(source).toContain('if (tile.town.populationTier !== "SETTLEMENT") pushLine(`Support ${tile.town.supportCurrent}/${tile.town.supportMax}`);');
    expect(source).toContain('tile.town?.populationTier !== "SETTLEMENT" &&');
  });
});
