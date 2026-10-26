// History snapshot: packages/client/src/client-map-3d-town-overlay/town-tier-geometry.ts at commit 5b51d199 (2026-10-13).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// Bakes each town tier into merged geometries -- the matte, vertex-coloured
// body, the metalwork (iron, brass and glass, drawn metallic like the AFC),
// the unlit glow (lit windows, lanterns, aether) and the steam puffs -- once
// per page load. Shared by every town overlay, so overlays must not dispose them.
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
  readonly glow: BufferGeometry | undefined;
  readonly steam: BufferGeometry | undefined;
};

const cache = new Map<TownTier, TownTierGeometry>();

export const getTownTierGeometry = (tier: TownTier): TownTierGeometry => {
  let geometry = cache.get(tier);
  if (!geometry) {
    const layout = TIER_LAYOUTS[tier];
    const matte = createTownMeshBuilder();
    const metal = createTownMeshBuilder();
    const builders: TownBuilders = {
      body: createRoutedTownBuilder(matte, metal),
      glow: createTownMeshBuilder(),
      steam: createTownMeshBuilder(),
      random: createTownRandom(layout.seed)
    };
    layout.build(builders);
    const body = matte.build();
    if (!body) throw new Error(`town tier ${tier} produced no geometry`);
    body.computeBoundingBox();
    body.computeBoundingSphere();
    geometry = { body, metal: metal.build(), glow: builders.glow.build(), steam: builders.steam.build() };
    cache.set(tier, geometry);
  }
  return geometry;
};
