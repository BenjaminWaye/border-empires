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
    const source = clientSource("../client-map-render/client-map-render.ts");
    expect(source).toContain('SETTLEMENT: overlaySrc("settlement-overlay-sand.svg")');
    expect(source).toContain('SETTLEMENT: overlaySrc("settlement-overlay-grass.svg")');
  });

  it("hides abandon territory on live settlement tiles", () => {
    const source = clientSource("../client-tile-action-logic/client-tile-action-logic.ts");
    expect(source).toContain('if (tile.town?.populationTier !== "SETTLEMENT") out.push({ id: "abandon_territory", label: "Abandon Territory" });');
  });

  it("does not treat settlements as support-building anchors or build hosts", () => {
    const originSelectionSource = clientSource("../client-origin-selection/client-origin-selection.ts");
    const roadNetworkSource = clientSource("../client-road-network/client-road-network.ts");
    const overviewModifierSource = clientSource("../client-tile-overview-modifiers/client-tile-overview-modifiers.ts");
    const tileActionLogicSource = clientSource("../client-tile-action-logic/client-tile-action-logic.ts");
    const tileMenuSource = clientSource("../client-tile-menu-view/client-tile-menu-view.ts");
    expect(originSelectionSource).toContain('if (candidate.town.populationTier === "SETTLEMENT") continue;');
    expect(roadNetworkSource).toContain('tile.town.populationTier !== "SETTLEMENT"');
    // The support row is emitted through a structured stat grid rather than a
    // formatted line, and has been reshaped more than once. Assert the actual
    // invariant -- support is only ever emitted for a non-SETTLEMENT tier --
    // with a whitespace-tolerant regex, so a harmless reformat doesn't fail
    // this guard while genuinely dropping the SETTLEMENT check still does.
    expect(tileMenuSource).toMatch(
      /populationTier\s*!==\s*"SETTLEMENT"\s*\?\s*\{\s*support:\s*\{\s*current:\s*supportCurrent,\s*max:\s*supportMax\s*\}\s*\}/
    );
    expect(overviewModifierSource).toContain('tile.town.populationTier !== "SETTLEMENT" && tile.town.connectedTownCount > 0');
    expect(tileActionLogicSource).toContain('tile.town?.populationTier !== "SETTLEMENT"');
  });
});
