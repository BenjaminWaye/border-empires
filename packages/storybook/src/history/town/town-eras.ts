// Every 3D town design the game has shipped, oldest first, for the
// History/Town Progression stories. Each era folder is a frozen copy of the
// client's town code at the commit that closed that era (see each file's
// header); "Live" renders the town the game ships today.
import type { Scene, Texture } from "three";
import { createTownOverlay as createLiveTownOverlay } from "@client/client-map-3d-town-overlay.js";
import { createClientThreeTownLayer } from "./2026-04-first-houses/town-layer.js";
import { createTownOverlay as createTierScaledBlocks } from "./2026-05-tier-scaled-blocks/town-overlay.js";
import { createTownOverlay as createSteampunkTiers } from "./2026-08-steampunk-tiers/town-overlay.js";
import { createTownOverlay as createTexturedModels } from "./2026-10-04-textured-models/town-overlay.js";
import { createTownOverlay as createSunlitProcedural } from "./2026-10-12-sunlit-procedural/town-overlay.js";
import { createTownOverlay as createSteampunkSoul } from "./2026-10-12-steampunk-soul/town-overlay.js";
import { createTownOverlay as createClockworkSkyscrapers } from "./2026-10-13-clockwork-skyscrapers/town-overlay.js";
import { createTownOverlay as createGlassSkyscrapers } from "./2026-10-13-glass-skyscrapers/town-overlay.js";
import { createTownOverlay as createStreetGrid } from "./2026-10-13-street-grid/town-overlay.js";
import { createTownOverlay as createAaaPolish } from "./2026-10-20-aaa-polish/town-overlay.js";
import { createTownOverlay as createBannersFountains } from "./2026-10-20-banners-fountains/town-overlay.js";

export type HistoricTownTier = "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";

export const HISTORIC_TOWN_TIERS: readonly HistoricTownTier[] = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];

/** The one shape every era is adapted to, whatever its own API was. */
export type HistoricTownOverlay = {
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, tier: HistoricTownTier, tileX: number, tileY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export type TownEra = {
  readonly id: string;
  /** When the design shipped, e.g. "Oct 2026". */
  readonly date: string;
  readonly title: string;
  /** Commit whose town code the snapshot was taken from ("develop" for Live). */
  readonly commit: string;
  readonly summary: string;
  /** True when the era streams in assets after the first layout (GLB models). */
  readonly loadsAssets: boolean;
  readonly create: (scene: Scene, maxTiles: number, envMap?: Texture) => HistoricTownOverlay;
};

// Shown in the banners era so its owner-coloured flags read as a player's.
const SAMPLE_OWNER_COLOR = "#c8443a";

type OverlayWithTileCoords = {
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, tier: HistoricTownTier, tileX?: number, tileY?: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const adapt = (overlay: OverlayWithTileCoords): HistoricTownOverlay => ({
  clear: overlay.clear,
  addInstance: (x, z, y, tier, tileX, tileY) => overlay.addInstance(x, z, y, tier, tileX, tileY),
  commit: overlay.commit,
  dispose: overlay.dispose
});

const createFirstHouses = (scene: Scene, maxTiles: number): HistoricTownOverlay => {
  const layer = createClientThreeTownLayer(scene, maxTiles);
  return {
    clear: layer.beginFrame,
    addInstance: (x, z, _y, tier) => layer.addTown(tier, x, z),
    commit: layer.commitFrame,
    dispose: layer.dispose
  };
};

export const TOWN_ERAS: readonly TownEra[] = [
  {
    id: "first-houses",
    date: "Apr 2026",
    title: "First houses",
    commit: "68f591f5",
    summary: "The first true-3D map: a few pale houses with orange roofs, and a keep for cities and up.",
    loadsAssets: false,
    create: createFirstHouses
  },
  {
    id: "tier-scaled-blocks",
    date: "May 2026",
    title: "Tier-scaled clusters",
    commit: "c729197d",
    summary: "Hut clusters that grow with the tier, from 3 houses to a 100-house metropolis with towers and a spire.",
    loadsAssets: false,
    create: (scene, maxTiles) => adapt(createTierScaledBlocks(scene, maxTiles))
  },
  {
    id: "steampunk-tiers",
    date: "Aug 2026",
    title: "Steampunk tiers",
    commit: "523f9f42",
    summary: "Five hand-authored iron-and-brass layouts glowing with aether, topped by the towering Metropolis Monument.",
    loadsAssets: false,
    create: (scene, maxTiles) => adapt(createSteampunkTiers(scene, maxTiles))
  },
  {
    id: "textured-models",
    date: "Oct 2026",
    title: "Textured models",
    commit: "6caba71c",
    summary: "Textured steampunk models for Town to Metropolis. Settlements stayed procedural.",
    loadsAssets: true,
    create: (scene, maxTiles) => adapt(createTexturedModels(scene, maxTiles))
  },
  {
    id: "sunlit-procedural",
    date: "Oct 2026",
    title: "Sunlit procedural",
    commit: "a10c42e6",
    summary: "The models replaced by procedural towns in the map's warm sunlit palette, with lit windows and aether lamps.",
    loadsAssets: false,
    create: (scene, maxTiles, envMap) => adapt(createSunlitProcedural(scene, maxTiles, envMap))
  },
  {
    id: "steampunk-soul",
    date: "Oct 2026",
    title: "Steampunk with soul",
    commit: "750ba4bc",
    summary: "Crescents of sandstone and brick townhouses round plazas, with brass-banded AFC towers rising out of them.",
    loadsAssets: false,
    create: (scene, maxTiles, envMap) => adapt(createSteampunkSoul(scene, maxTiles, envMap))
  },
  {
    id: "clockwork-skyscrapers",
    date: "Oct 2026",
    title: "Clockwork skyscrapers",
    commit: "2e4f2f72",
    summary: "Grey stone art-deco skyscrapers banded in brass, crowned with cog clocks and spires, on an octagonal plate.",
    loadsAssets: false,
    create: (scene, maxTiles, envMap) => adapt(createClockworkSkyscrapers(scene, maxTiles, envMap))
  },
  {
    id: "glass-skyscrapers",
    date: "Oct 2026",
    title: "Glass skyscrapers",
    commit: "5b51d199",
    summary: "Mirror-glass curtain walls, steaming smokestacks and shader-driven animation: cogs, beacons, airships.",
    loadsAssets: false,
    create: (scene, maxTiles, envMap) => adapt(createGlassSkyscrapers(scene, maxTiles, envMap))
  },
  {
    id: "street-grid",
    date: "Oct 2026",
    title: "Street grid",
    commit: "0636d368",
    summary: "Towns and cities laid out on a street grid, with glass downtowns tied together by skybridges.",
    loadsAssets: false,
    create: (scene, maxTiles, envMap) => adapt(createStreetGrid(scene, maxTiles, envMap))
  },
  {
    id: "aaa-polish",
    date: "Oct 2026",
    title: "AAA polish",
    commit: "f4007556",
    summary: "Baked ambient occlusion, weathered stone and pools of lamplight at street level.",
    loadsAssets: false,
    create: (scene, maxTiles, envMap) => adapt(createAaaPolish(scene, maxTiles, envMap))
  },
  {
    id: "banners-fountains",
    date: "Oct 2026",
    title: "Banners and fountains",
    commit: "fc4288dd",
    summary: "Owner-coloured banners rippling over every town, plus fountains, gardens and a sheen of sky on the glass.",
    loadsAssets: false,
    create: (scene, maxTiles, envMap) => {
      const overlay = createBannersFountains(scene, maxTiles, envMap);
      return {
        clear: overlay.clear,
        addInstance: (x, z, y, tier, tileX, tileY) => overlay.addInstance(x, z, y, tier, tileX, tileY, SAMPLE_OWNER_COLOR),
        commit: overlay.commit,
        dispose: overlay.dispose
      };
    }
  },
  {
    id: "live",
    date: "Today",
    title: "Marble plinth (live)",
    commit: "develop",
    summary: "What the game ships now: banners and shopfront lights dropped, towns standing on the muster flag's marble.",
    loadsAssets: false,
    create: (scene, maxTiles, envMap) => adapt(createLiveTownOverlay(scene, maxTiles, envMap))
  }
];

export const townEraById = (id: string): TownEra => TOWN_ERAS.find((era) => era.id === id) ?? TOWN_ERAS[TOWN_ERAS.length - 1]!;
