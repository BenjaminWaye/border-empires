// Every bespoke AFC module model, keyed to the AFC_MODULE tech that docks it
// (packages/game-domain/data/tech-tree.json). `inGame` reads the client's own
// tech-id -> model registry, so a model flips to "in game" in Storybook the
// moment it is wired into client-map-3d-afc-module-family.ts.
import type { Scene, Texture } from "three";
import { AFC_MODULE_FAMILY_TECH_IDS } from "@client/client-map-3d-afc-module-family.js";
import { createAetherResonanceModuleOverlay } from "@client/client-map-3d-aether-resonance-module.js";
import { createAetherwardCoilModuleOverlay } from "@client/client-map-3d-aetherward-coil-module.js";
import { createAncillaryControlCoreModuleOverlay } from "@client/client-map-3d-ancillary-control-core-module.js";
import { createBastionMasterDieModuleOverlay } from "@client/client-map-3d-bastion-master-die-module.js";
import { createCatalystFabricatorModuleOverlay } from "@client/client-map-3d-catalyst-fabricator-module.js";
import { createGeoformEngineModuleOverlay } from "@client/client-map-3d-geoform-engine-module.js";
import { createHiveMindIiModuleOverlay } from "@client/client-map-3d-hive-mind-ii-module.js";
import { createHiveMindModuleOverlay } from "@client/client-map-3d-hive-mind-module.js";
import { createMatterwrightRetortModuleOverlay } from "@client/client-map-3d-matterwright-retort-module.js";
import { createNeuralAssemblyCoreModuleOverlay } from "@client/client-map-3d-neural-assembly-core-module.js";
import { createReserveLatticeModuleOverlay } from "@client/client-map-3d-reserve-lattice-module.js";
import { createResonanceGridModuleOverlay } from "@client/client-map-3d-resonance-grid-module.js";
import { createRiggingWorksModuleOverlay } from "@client/client-map-3d-rigging-works-module.js";
import { createSiegeLensFoundryModuleOverlay } from "@client/client-map-3d-siege-lens-foundry-module.js";
import { createStratosphericDockyardModuleOverlay } from "@client/client-map-3d-stratospheric-dockyard-module.js";
import { createThunderplateInductionModuleOverlay } from "@client/client-map-3d-thunderplate-induction-module.js";
import { createTidewayLatticeModuleOverlay } from "@client/client-map-3d-tideway-lattice-module.js";
import { createTitaniumForgeModuleOverlay } from "@client/client-map-3d-titanium-forge-module.js";
import { createTitaniumSynthesisModuleOverlay } from "@client/client-map-3d-titanium-synthesis-module.js";
import { createTranspositionArrayModuleOverlay } from "@client/client-map-3d-transposition-array-module.js";
import { createUmbriteSynthesisModuleOverlay } from "@client/client-map-3d-umbrite-synthesis-module.js";

export type AfcModuleOverlay = {
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export type AfcModuleModel = {
  readonly id: string;
  readonly name: string;
  readonly techId: string;
  readonly create: (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture) => AfcModuleOverlay;
  /** Extra yaw that turns the module's working face toward the camera; +0.35 or -0.35 rad. */
  readonly facing: number;
  readonly shadowRadius: number;
  /** World tile the solo shots seed the model's variation from. */
  readonly seedTile: readonly [number, number];
};

// Facing, shadow radius and the order the AFC ring docks them in are carried
// over unchanged from the per-module stories this registry replaced.
export const AFC_MODULE_MODELS: readonly AfcModuleModel[] = [
  { id: "siege-lens-foundry", name: "Siege Lens Foundry", techId: "siegecraft", create: createSiegeLensFoundryModuleOverlay, facing: -0.35, shadowRadius: 0.36, seedTile: [7, 3] },
  { id: "titanium-forge", name: "Titanium Forge", techId: "masonry", create: createTitaniumForgeModuleOverlay, facing: -0.35, shadowRadius: 0.36, seedTile: [7, 3] },
  { id: "rigging-works", name: "Rigging Works", techId: "leatherworking", create: createRiggingWorksModuleOverlay, facing: -0.35, shadowRadius: 0.36, seedTile: [7, 3] },
  { id: "aether-resonance-core", name: "Aether Resonance Core", techId: "crystal-lattices", create: createAetherResonanceModuleOverlay, facing: -0.35, shadowRadius: 0.36, seedTile: [7, 3] },
  { id: "transposition-array", name: "Transposition Array", techId: "logistics", create: createTranspositionArrayModuleOverlay, facing: -0.35, shadowRadius: 0.36, seedTile: [7, 3] },
  { id: "aetherward-coil", name: "Aetherward Coil", techId: "harborcraft", create: createAetherwardCoilModuleOverlay, facing: -0.35, shadowRadius: 0.36, seedTile: [8, 4] },
  { id: "tideway-lattice", name: "Tideway Lattice", techId: "navigation", create: createTidewayLatticeModuleOverlay, facing: -0.35, shadowRadius: 0.36, seedTile: [8, 4] },
  { id: "geoform-engine", name: "Geoform Engine", techId: "terrain-engineering", create: createGeoformEngineModuleOverlay, facing: -0.35, shadowRadius: 0.36, seedTile: [8, 4] },
  { id: "stratospheric-dockyard", name: "Stratospheric Dockyard", techId: "aeronautics", create: createStratosphericDockyardModuleOverlay, facing: -0.35, shadowRadius: 0.36, seedTile: [8, 4] },
  { id: "resonance-grid", name: "Resonance Grid", techId: "radar", create: createResonanceGridModuleOverlay, facing: -0.35, shadowRadius: 0.36, seedTile: [8, 4] },
  { id: "matterwright-retort", name: "Matterwright Retort", techId: "matterwright-retort", create: createMatterwrightRetortModuleOverlay, facing: -0.35, shadowRadius: 0.36, seedTile: [8, 4] },
  { id: "umbrite-synthesis", name: "Umbrite Synthesis", techId: "workshops", create: createUmbriteSynthesisModuleOverlay, facing: -0.35, shadowRadius: 0.4, seedTile: [8, 4] },
  { id: "titanium-synthesis", name: "Titanium Synthesis", techId: "alchemy", create: createTitaniumSynthesisModuleOverlay, facing: -0.35, shadowRadius: 0.4, seedTile: [8, 4] },
  { id: "catalyst-fabricator", name: "Catalyst Fabricator", techId: "advanced-synthetication", create: createCatalystFabricatorModuleOverlay, facing: -0.35, shadowRadius: 0.4, seedTile: [8, 4] },
  { id: "ancillary-control-core", name: "Ancillary Control Core", techId: "remade-concordat", create: createAncillaryControlCoreModuleOverlay, facing: 0.35, shadowRadius: 0.4, seedTile: [8, 4] },
  { id: "reserve-lattice", name: "Reserve Lattice", techId: "conveyor-networks", create: createReserveLatticeModuleOverlay, facing: 0.35, shadowRadius: 0.4, seedTile: [8, 4] },
  { id: "neural-assembly-core", name: "Neural Assembly Core", techId: "global-trade-networks", create: createNeuralAssemblyCoreModuleOverlay, facing: 0.35, shadowRadius: 0.4, seedTile: [8, 4] },
  { id: "bastion-master-die", name: "Bastion Master-Die", techId: "fortified-walls", create: createBastionMasterDieModuleOverlay, facing: 0.35, shadowRadius: 0.4, seedTile: [8, 4] },
  { id: "thunderplate-induction", name: "Thunderplate Induction", techId: "steelworking", create: createThunderplateInductionModuleOverlay, facing: 0.35, shadowRadius: 0.4, seedTile: [8, 4] },
  { id: "hive-mind", name: "Hive Mind I", techId: "muster-discipline", create: createHiveMindModuleOverlay, facing: 0.35, shadowRadius: 0.4, seedTile: [8, 4] },
  { id: "hive-mind-ii", name: "Hive Mind II", techId: "muster-command", create: createHiveMindIiModuleOverlay, facing: 0.35, shadowRadius: 0.4, seedTile: [8, 4] }
];

export const isAfcModuleInGame = (model: AfcModuleModel): boolean => AFC_MODULE_FAMILY_TECH_IDS.includes(model.techId);

export const afcModuleById = (id: string): AfcModuleModel => AFC_MODULE_MODELS.find((m) => m.id === id) ?? AFC_MODULE_MODELS[0]!;
