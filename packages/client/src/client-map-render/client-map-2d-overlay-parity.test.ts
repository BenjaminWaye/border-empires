import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const clientSource = (filename: string): string => readFileSync(resolve(here, filename), "utf8");
const overlayAsset = (filename: string): string => resolve(here, "../../public/overlays", filename);

describe("2D overlay parity with the 3D renderer", () => {
  const structureOverlayEntries = [
    ["SEED_GRANARY", "seed-granary-overlay.svg"],
    ["CENSUS_HALL", "census-hall-overlay.svg"],
    ["WEAPONS_WORKSHOP", "weapons-workshop-overlay.svg"],
    ["TITANIUM_WEAPONS_FACTORY", "titanium-weapons-factory-overlay.svg"],
    ["UMBRITE_WEAPONS_FACTORY", "umbrite-weapons-factory-overlay.svg"],
    ["WORLD_ENGINE_PART_1", "long-barrel-overlay.svg"],
    ["WORLD_ENGINE_PART_2", "fracture-core-overlay.svg"],
    ["WORLD_ENGINE_PART_3", "sky-marking-array-overlay.svg"],
    ["IMPERIAL_EXCHANGE_PART_1", "golden-ledger-overlay.svg"],
    ["IMPERIAL_EXCHANGE_PART_2", "counting-engine-overlay.svg"],
    ["IMPERIAL_EXCHANGE_PART_3", "sovereign-seal-overlay.svg"],
    ["POPULATION_BUREAU_PART_1", "census-engine-overlay.svg"],
    ["POPULATION_BUREAU_PART_2", "registry-vault-overlay.svg"],
    ["POPULATION_BUREAU_PART_3", "levy-charter-overlay.svg"]
  ] as const;

  const naturalWonderEntries = [
    ["FOUNDRY_HEART", "foundry-heart-overlay.svg"],
    ["DEEPWATER_ENGINE", "deepwater-engine-overlay.svg"],
    ["CONSCRIPTION_ENGINE", "conscription-engine-overlay.svg"],
    ["WARPRESS", "warpress-overlay.svg"],
    ["BASTION_FRAME", "bastion-frame-overlay.svg"],
    ["CALCULATING_ENGINE", "calculating-engine-overlay.svg"],
    ["QUICKFORGE", "quickforge-overlay.svg"],
    ["WATCHTOWER_ENGINE", "watchtower-engine-overlay.svg"],
    ["CARTOGRAPHERS_LENS", "cartographers-lens-overlay.svg"]
  ] as const;

  it("wires every 3D-rendered structure kind to a 2D SVG sprite", () => {
    const overlayImages = clientSource("../client-map-render/client-map-overlay-images.ts");
    for (const [structureType, asset] of structureOverlayEntries) {
      expect(overlayImages).toContain(`${structureType}: loadOverlayImage("${asset}")`);
      expect(existsSync(overlayAsset(asset))).toBe(true);
    }
  });

  it("preloads a 2D SVG sprite for every natural wonder type", () => {
    const overlayImages = clientSource("../client-map-render/client-map-overlay-images.ts");
    for (const [wonderType, asset] of naturalWonderEntries) {
      expect(overlayImages).toContain(`${wonderType}: loadOverlayImage("${asset}")`);
      expect(existsSync(overlayAsset(asset))).toBe(true);
    }
  });

  it("routes natural wonders through the 2D runtime loop in both passes", () => {
    const loop = clientSource("../client-runtime-loop.ts");
    const draws = loop.match(/t\.naturalWonder && !isTrue3DRendererActive\(\)/g);
    expect(draws).not.toBeNull();
    expect(draws?.length).toBeGreaterThanOrEqual(2);
    expect(loop).toContain("drawNaturalWonderOverlay2D(deps.ctx, naturalWonderOverlayForTile(t)");
    expect(loop).toContain('from "./client-map-2d-natural-wonder-overlay.js"');
  });

  it("resolves natural wonder tiles to an overlay via the 2D helper module", () => {
    const helper = clientSource("../client-map-2d-natural-wonder-overlay.ts");
    expect(helper).toContain("export const naturalWonderOverlayForTile = (tile: Tile): HTMLImageElement | undefined =>");
    expect(helper).toContain("tile.naturalWonder");
    expect(helper).toContain("naturalWonderOverlayImages[tile.naturalWonder.type]");
    expect(helper).toContain("export const drawNaturalWonderOverlay2D");
  });

  // Regression: the 3D renderer (client-map-3d.ts) shows an economicStructure
  // for any tile it has locally cached, with no vis/fog gate at all. The 2D
  // fallback used to be stricter (vis === "visible" only), so a building on
  // a tile that had fallen out of live vision — most commonly an ally's
  // territory, since shared ally vision retreats to each player's own
  // radius the instant an alliance breaks — silently disappeared in 2D while
  // the territory tint (which already tolerates "fogged", see the
  // ownership-tint branch) stayed put. Both economicStructure render sites
  // in the 2D loop must tolerate "fogged" the same way.
  it("renders economicStructure on fogged tiles in 2D, matching the ownership tint's fog tolerance", () => {
    const loop = clientSource("../client-runtime-loop.ts");
    const structureGates = loop.match(/if \(t && \(vis === "visible" \|\| vis === "fogged"\)[^]*?&& t\.economicStructure\) \{/g);
    expect(structureGates).not.toBeNull();
    expect(structureGates?.length).toBe(2);
  });
});
