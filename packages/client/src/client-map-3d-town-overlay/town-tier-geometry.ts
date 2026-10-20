// Bakes each town tier into merged geometries -- the matte, vertex-coloured
// body (with ambient occlusion and weathering baked in), the metalwork (iron
// and brass, drawn metallic like the AFC), the mirror-glass curtain walls,
// the unlit glow (lit windows, shopfronts, lanterns, aether, beacons), the
// additive light pools on the paving, the steam puffs and the banners -- once per page
// load. Shared by every town overlay, so overlays must not dispose them.
import type { BufferGeometry } from "three";
import { createRoutedTownBuilder, createTownMeshBuilder, createTownRandom } from "./town-mesh-builder.js";
import type { TownBuilders } from "./town-parts.js";
import { buildGreatCity, buildMetropolis } from "./town-tier-large.js";
import { buildCity, buildSettlement, buildTown } from "./town-tier-small.js";

export type TownTier = "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";

export const TOWN_TIERS: readonly TownTier[] = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];

const TIER_LAYOUTS: Readonly<Record<TownTier, { readonly seed: number; readonly build: (t: TownBuilders) => void }>> = {
  SETTLEMENT: { seed: 11, build: buildSettlement },
  TOWN: { seed: 23, build: buildTown },
  CITY: { seed: 37, build: buildCity },
  GREAT_CITY: { seed: 41, build: buildGreatCity },
  METROPOLIS: { seed: 59, build: buildMetropolis }
};

export type TownTierGeometry = {
  readonly body: BufferGeometry;
  readonly metal: BufferGeometry | undefined;
  readonly glass: BufferGeometry | undefined;
  readonly glow: BufferGeometry | undefined;
  readonly halo: BufferGeometry | undefined;
  readonly steam: BufferGeometry | undefined;
  /** Banner cloth, white: the overlay tints it per town with the owner's colour. */
  readonly banner: BufferGeometry | undefined;
};

const cache = new Map<TownTier, TownTierGeometry>();

export const getTownTierGeometry = (tier: TownTier): TownTierGeometry => {
  let geometry = cache.get(tier);
  if (!geometry) {
    const layout = TIER_LAYOUTS[tier];
    const matte = createTownMeshBuilder({ occlusion: true, weathering: 0.1 });
    const metal = createTownMeshBuilder({ occlusion: true });
    const glass = createTownMeshBuilder({ occlusion: true, sheen: 0.35 });
    const builders: TownBuilders = {
      body: createRoutedTownBuilder(matte, metal, glass),
      glow: createTownMeshBuilder(),
      halo: createTownMeshBuilder(),
      steam: createTownMeshBuilder(),
      banner: createTownMeshBuilder(),
      random: createTownRandom(layout.seed)
    };
    layout.build(builders);
    const body = matte.build();
    if (!body) throw new Error(`town tier ${tier} produced no geometry`);
    body.computeBoundingBox();
    body.computeBoundingSphere();
    geometry = {
      body,
      metal: metal.build(),
      glass: glass.build(),
      glow: builders.glow.build(),
      halo: builders.halo.build(),
      steam: builders.steam.build(),
      banner: builders.banner.build()
    };
    cache.set(tier, geometry);
  }
  return geometry;
};
