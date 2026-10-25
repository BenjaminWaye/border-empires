import type { BufferGeometry } from "three";
import {
  createRoutedTownBuilder, createTownMeshBuilder, createTownRandom
} from "../client-map-3d-town-overlay/town-mesh-builder.js";
import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import type { DistrictBuildingKind } from "./district-catalog.js";
import { buildSupportFoundation } from "./support-model-core.js";
import { buildIndustry } from "./support-model-industry.js";
import { buildProjectPart } from "./support-model-projects.js";
import { buildUtility } from "./support-model-utilities.js";

export const DISTRICT_LAYERS = ["body", "metal", "glass", "glow", "halo", "steam", "plinth"] as const;
export type DistrictLayer = typeof DISTRICT_LAYERS[number];
export type DistrictGeometry = {
  readonly layers: Readonly<Partial<Record<DistrictLayer, BufferGeometry>>>;
  readonly height: number;
};

export const buildDistrictModel = (t: TownBuilders, kind: DistrictBuildingKind, foundation = true): void => {
  if (foundation) buildSupportFoundation(t);
  if (buildIndustry(t, kind) || buildProjectPart(t, kind) || buildUtility(t, kind)) return;
  throw new Error(`Missing district model: ${kind}`);
};

// The caller owns this geometry. Live overlays cache only the finite catalogue
// and instance it; gallery/icon generation uses exactly the same model source.
export const createDistrictGeometry = (kind: DistrictBuildingKind | undefined, foundation = true): DistrictGeometry => {
  const matte = createTownMeshBuilder({ occlusion: true, weathering: 0.1 });
  const metal = createTownMeshBuilder({ occlusion: true });
  const glass = createTownMeshBuilder({ occlusion: true, sheen: 0.35 });
  const t: TownBuilders = {
    body: createRoutedTownBuilder(matte, metal, glass),
    glow: createTownMeshBuilder(), halo: createTownMeshBuilder(), steam: createTownMeshBuilder(),
    plinth: createTownMeshBuilder(), random: createTownRandom(73)
  };
  if (kind) buildDistrictModel(t, kind, foundation);
  else if (foundation) buildSupportFoundation(t);
  const builders = { body: matte, metal, glass, glow: t.glow, halo: t.halo, steam: t.steam, plinth: t.plinth };
  const layers: Partial<Record<DistrictLayer, BufferGeometry>> = {};
  let height = 0;
  for (const layer of DISTRICT_LAYERS) {
    const geometry = builders[layer].build();
    if (!geometry) continue;
    geometry.computeBoundingBox();
    height = Math.max(height, geometry.boundingBox?.max.y ?? 0);
    layers[layer] = geometry;
  }
  return { layers, height };
};
