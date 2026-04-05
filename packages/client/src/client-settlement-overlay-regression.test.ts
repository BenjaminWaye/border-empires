import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("settlement overlay regression guard", () => {
  it("uses dedicated settlement overlays instead of ancient-town art", () => {
    const source = clientSource("./client-map-render.ts");
    expect(source).toContain('SETTLEMENT: overlaySrc("settlement-overlay-sand.svg")');
    expect(source).toContain('SETTLEMENT: overlaySrc("settlement-overlay-grass.svg")');
  });

  it("hides abandon territory on live settlement tiles", () => {
    const source = clientSource("./client-tile-action-logic.ts");
    expect(source).toContain('if (tile.town?.populationTier !== "SETTLEMENT") out.push({ id: "abandon_territory", label: "Abandon Territory" });');
  });

  it("does not treat settlements as support-building anchors or build hosts", () => {
    const originSelectionSource = clientSource("./client-origin-selection.ts");
    const tileActionLogicSource = clientSource("./client-tile-action-logic.ts");
    const tileMenuSource = clientSource("./client-tile-menu-view.ts");
    expect(originSelectionSource).toContain('if (candidate.town.populationTier === "SETTLEMENT") continue;');
    expect(tileMenuSource).toContain('if (tile.town.populationTier !== "SETTLEMENT") pushLine(`Support ${tile.town.supportCurrent}/${tile.town.supportMax}`);');
    expect(tileActionLogicSource).toContain('tile.town?.populationTier !== "SETTLEMENT"');
  });
});
