// Single source of truth for "which AFC-Module tech id docks which 3D
// module family" (Manifest plan §10 step 10), plus a thin wrapper that
// fans an AFC instance + its docked modules out to the right overlays.
// A future branch adding the remaining module families only needs to add
// one entry here -- client-map-3d.ts never needs to change.
import type { Scene, Texture } from "three";
import { createFabricationComplexOverlay, AFC_SOCKET_COUNT, type FabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import { createAetherResonanceModuleOverlay } from "./client-map-3d-aether-resonance-module.js";
import { createAetherwardCoilModuleOverlay } from "./client-map-3d-aetherward-coil-module.js";
import { createGeoformEngineModuleOverlay } from "./client-map-3d-geoform-engine-module.js";
import { createMatterwrightRetortModuleOverlay } from "./client-map-3d-matterwright-retort-module.js";
import { createResonanceGridModuleOverlay } from "./client-map-3d-resonance-grid-module.js";
import { createRiggingWorksModuleOverlay } from "./client-map-3d-rigging-works-module.js";
import { createSiegeLensFoundryModuleOverlay } from "./client-map-3d-siege-lens-foundry-module.js";
import { createStratosphericDockyardModuleOverlay } from "./client-map-3d-stratospheric-dockyard-module.js";
import { createTidewayLatticeModuleOverlay } from "./client-map-3d-tideway-lattice-module.js";
import { createTitaniumForgeModuleOverlay } from "./client-map-3d-titanium-forge-module.js";
import { createTranspositionArrayModuleOverlay } from "./client-map-3d-transposition-array-module.js";
import { createUmbriteSynthesisModuleOverlay } from "./client-map-3d-umbrite-synthesis-module.js";

type ModuleFamilyOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

type ModuleFamilyFactory = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture) => ModuleFamilyOverlay;

// Tech id -> module family factory, for the 12 families built so far
// (PR #2119). A tech id docked on a player's AFC with no entry here
// (one of the 10 remaining families, being built on a separate branch)
// simply gets no socket instance -- not an error, see
// docs/manifest-afc-overlay-wiring-plan.md.
const MODULE_FAMILY_FACTORIES: Readonly<Record<string, ModuleFamilyFactory>> = {
  masonry: createTitaniumForgeModuleOverlay,
  leatherworking: createRiggingWorksModuleOverlay,
  "crystal-lattices": createAetherResonanceModuleOverlay,
  workshops: createUmbriteSynthesisModuleOverlay,
  siegecraft: createSiegeLensFoundryModuleOverlay,
  logistics: createTranspositionArrayModuleOverlay,
  harborcraft: createAetherwardCoilModuleOverlay,
  "terrain-engineering": createGeoformEngineModuleOverlay,
  navigation: createTidewayLatticeModuleOverlay,
  aeronautics: createStratosphericDockyardModuleOverlay,
  radar: createResonanceGridModuleOverlay,
  "matterwright-retort": createMatterwrightRetortModuleOverlay
};

export const AFC_MODULE_FAMILY_TECH_IDS: readonly string[] = Object.keys(MODULE_FAMILY_FACTORIES);

export type AfcOverlayGroup = {
  readonly clear: () => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
  // Docks the AFC itself plus up to AFC_SOCKET_COUNT of moduleTechIds (in
  // order) into their matching family overlay's next socket attachment.
  readonly addAfc: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number, moduleTechIds: readonly string[]) => void;
};

export const createAfcOverlayGroup = (scene: Scene, maxAfcInstances: number, buildingEnvironmentTexture?: Texture): AfcOverlayGroup => {
  const afc: FabricationComplexOverlay = createFabricationComplexOverlay(scene, maxAfcInstances, buildingEnvironmentTexture);
  const familyCapacity = maxAfcInstances * AFC_SOCKET_COUNT;
  const families = new Map<string, ModuleFamilyOverlay>(
    Object.entries(MODULE_FAMILY_FACTORIES).map(([techId, factory]) => [techId, factory(scene, familyCapacity, buildingEnvironmentTexture)])
  );
  const allFamilies = [...families.values()];

  const addAfc = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number, moduleTechIds: readonly string[]): void => {
    const index = afc.addInstance(sceneX, sceneZ, surfaceY, worldTileX, worldTileY);
    const attachments = afc.moduleSocketAttachments(index);
    moduleTechIds.slice(0, attachments.length).forEach((techId, i) => {
      const family = families.get(techId);
      const attachment = attachments[i];
      if (!family || !attachment) return;
      family.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, worldTileX, worldTileY);
    });
  };

  return {
    addAfc,
    clear: () => { afc.clear(); for (const family of allFamilies) family.clear(); },
    commit: () => { afc.commit(); for (const family of allFamilies) family.commit(); },
    update: (nowMs) => { afc.update(nowMs); for (const family of allFamilies) family.update(nowMs); },
    dispose: () => { afc.dispose(); for (const family of allFamilies) family.dispose(); }
  };
};
