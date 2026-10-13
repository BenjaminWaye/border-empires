import type { Meta, StoryObj } from "@storybook/html-vite";
import { createStructureOverlay, type StructureKind, type StructureResourceHint } from "@client/client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createContactShadowOverlay } from "@client/client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  structures: StructureKind[];
  resourceHint: "none" | "TITANIUM" | "GEMS";
  cameraDistance: number;
  spacing: number;
};

// UMBRITE_RIG has its own dedicated overlay + story file
// (client-map-3d-umbrite-extraction-rig.ts / UmbriteExtractionRig.stories.ts)
// and is no longer part of the generic StructureKind union handled here.
// MINTWORKS likewise has its own dedicated story file (Mintworks.stories.ts).
// TRADE_NEXUS likewise has its own dedicated overlay + story file
// (client-map-3d-trade-nexus-overlay.ts / TradeNexus.stories.ts).
const KINDS: ReadonlyArray<StructureKind> = [
  "HYDROGARDEN", "HYDROWORKS", "MINE", "TITANIUM_WORKS",
  "OBSERVATORY", "INCUBATION_ENGINE", "CENSUS_HALL",
  "CLEARING_HOUSE", "AMBARIC_TRANSFORMER", "AEGIS_DOME", "SOVEREIGN_SIEGE_ENGINE", "IMPERIAL_EXCHANGE",
  "SKY_DOCK", "HARBOR_EXCHANGE",
  "ANCILLARY_DEPOT", "MINISTRY_HALL", "NEURAL_WORKS", "RESONANCE_GRID",
  "ORE_REFINERY", "HIGH_YIELD_TITANIUM_WORKS",
  "UMBRITE_WORKS", "HIGH_YIELD_UMBRITE_WORKS",
  "AETHER_CONDENSER", "HIGH_YIELD_AETHER_CONDENSER",
  "ASTRAL_DOCK",
  "ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3",
  "QUARTERMASTERS_OFFICE", "ANCILLARY_FACTORY", "RESERVE_LATTICE",
  "CENSUS_DIRECTORATE", "TITANIUM_LEVY",
  "WEAPONS_WORKSHOP", "TITANIUM_WEAPONS_FACTORY",
  "SOVEREIGN_SIEGE_ENGINE_PART_1", "SOVEREIGN_SIEGE_ENGINE_PART_2", "SOVEREIGN_SIEGE_ENGINE_PART_3",
  "IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3",
  "CENSUS_DIRECTORATE_PART_1", "CENSUS_DIRECTORATE_PART_2", "CENSUS_DIRECTORATE_PART_3"
];

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1b1d22" });
  const count = Math.max(args.structures.length, 1);
  const contactShadows = createContactShadowOverlay(stage.scene, count);
  const overlay = createStructureOverlay(stage.scene, count, contactShadows);
  const hint: StructureResourceHint = args.resourceHint === "none" ? undefined : args.resourceHint;
  args.structures.forEach((kind, idx) => {
    const x = (idx - (args.structures.length - 1) / 2) * args.spacing;
    overlay.addInstance(x, 0, 0, kind, hint);
  });
  overlay.commit();
  contactShadows.commit();
  return wrapWithCleanup(stage, [overlay.dispose, contactShadows.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/StructureOverlay",
  argTypes: {
    structures: { control: "check", options: KINDS as unknown as string[] },
    resourceHint: { control: "inline-radio", options: ["none", "TITANIUM", "GEMS"] },
    cameraDistance: { control: { type: "range", min: 2, max: 18, step: 0.5 } },
    spacing: { control: { type: "range", min: 0.8, max: 2.5, step: 0.1 } }
  },
  args: { structures: [...KINDS], resourceHint: "none", cameraDistance: 10, spacing: 1.3 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const AllKinds: Story = {};
export const Hydrogarden: Story = { args: { structures: ["HYDROGARDEN"], cameraDistance: 6, spacing: 1.6 } };
export const Mine: Story = { args: { structures: ["MINE"], cameraDistance: 3 } };
export const MineTitanium: Story = { args: { structures: ["MINE"], resourceHint: "TITANIUM", cameraDistance: 3 } };
export const MineGems: Story = { args: { structures: ["MINE"], resourceHint: "GEMS", cameraDistance: 3 } };
export const Observatory: Story = { args: { structures: ["OBSERVATORY"], cameraDistance: 3 } };
export const IncubationEngine: Story = { args: { structures: ["INCUBATION_ENGINE"], cameraDistance: 3 } };
export const CensusHall: Story = { args: { structures: ["CENSUS_HALL"], cameraDistance: 3 } };
export const ClearingHouse: Story = { args: { structures: ["CLEARING_HOUSE"], cameraDistance: 3 } };
export const AmbaricTransformer: Story = { args: { structures: ["AMBARIC_TRANSFORMER"], cameraDistance: 3.5 } };
export const AegisDome: Story = { args: { structures: ["AEGIS_DOME"], cameraDistance: 3.5 } };
export const SovereignSiegeEngine: Story = { args: { structures: ["SOVEREIGN_SIEGE_ENGINE"], cameraDistance: 4 } };
export const ImperialExchange: Story = { args: { structures: ["IMPERIAL_EXCHANGE"], cameraDistance: 4 } };
export const SkyDock: Story = { args: { structures: ["SKY_DOCK"], cameraDistance: 4 } };
export const HarborExchange: Story = { args: { structures: ["HARBOR_EXCHANGE"], cameraDistance: 3 } };
export const AncillaryDepot: Story = { args: { structures: ["ANCILLARY_DEPOT"], cameraDistance: 3.5 } };
export const MinistryHall: Story = { args: { structures: ["MINISTRY_HALL"], cameraDistance: 3.5 } };
export const NeuralWorks: Story = { args: { structures: ["NEURAL_WORKS"], cameraDistance: 3.5 } };
export const ResonanceGrid: Story = { args: { structures: ["RESONANCE_GRID"], cameraDistance: 3 } };
export const OreRefinery: Story = { args: { structures: ["ORE_REFINERY"], cameraDistance: 4 } };
export const HighYieldTitaniumWorks: Story = { args: { structures: ["HIGH_YIELD_TITANIUM_WORKS"], cameraDistance: 4 } };
export const UmbriteWorks: Story = { args: { structures: ["UMBRITE_WORKS"], cameraDistance: 3.5 } };
export const HighYieldUmbriteWorks: Story = { args: { structures: ["HIGH_YIELD_UMBRITE_WORKS"], cameraDistance: 4 } };
export const AetherCondenser: Story = { args: { structures: ["AETHER_CONDENSER"], cameraDistance: 3.5 } };
export const HighYieldAetherCondenser: Story = { args: { structures: ["HIGH_YIELD_AETHER_CONDENSER"], cameraDistance: 4 } };
export const AstralDock: Story = { args: { structures: ["ASTRAL_DOCK"], cameraDistance: 4 } };
export const AstralDockPartCradle: Story = { args: { structures: ["ASTRAL_DOCK_PART_1"], cameraDistance: 3 } };
export const AstralDockPartArray: Story = { args: { structures: ["ASTRAL_DOCK_PART_2"], cameraDistance: 3 } };
export const AstralDockPartSail: Story = { args: { structures: ["ASTRAL_DOCK_PART_3"], cameraDistance: 3 } };
export const QuartermastersOffice: Story = { args: { structures: ["QUARTERMASTERS_OFFICE"], cameraDistance: 3 } };
export const AncillaryFactory: Story = { args: { structures: ["ANCILLARY_FACTORY"], cameraDistance: 3.5 } };
export const ReserveLattice: Story = { args: { structures: ["RESERVE_LATTICE"], cameraDistance: 3.5 } };
export const CensusDirectorate: Story = { args: { structures: ["CENSUS_DIRECTORATE"], cameraDistance: 4 } };
export const TitaniumLevy: Story = { args: { structures: ["TITANIUM_LEVY"], cameraDistance: 3.5 } };
export const WeaponsWorkshop: Story = { args: { structures: ["WEAPONS_WORKSHOP"], cameraDistance: 3 } };
export const WorldbreakerPartBarrel: Story = { args: { structures: ["SOVEREIGN_SIEGE_ENGINE_PART_1"], cameraDistance: 3 } };
export const WorldbreakerPartCore: Story = { args: { structures: ["SOVEREIGN_SIEGE_ENGINE_PART_2"], cameraDistance: 3 } };
export const WorldbreakerPartArray: Story = { args: { structures: ["SOVEREIGN_SIEGE_ENGINE_PART_3"], cameraDistance: 3 } };
// Titanium Weapons Factory reuses the Weapons Workshop model as-is (see
// client-map-3d-structure-industrial.ts) — Umbrite Weapons Factory has its
// own bespoke 3D model with its own story file
// (UmbriteWeaponsFactory.stories.ts), so it has no story here.
export const TitaniumWeaponsFactory: Story = { args: { structures: ["TITANIUM_WEAPONS_FACTORY"], cameraDistance: 3 } };
export const FirstBatch: Story = { args: { structures: ["AMBARIC_TRANSFORMER", "AEGIS_DOME", "SOVEREIGN_SIEGE_ENGINE", "IMPERIAL_EXCHANGE"], cameraDistance: 8, spacing: 1.5 } };
export const CivicBatch: Story = { args: { structures: ["CLEARING_HOUSE", "HARBOR_EXCHANGE", "ANCILLARY_DEPOT", "MINISTRY_HALL", "CENSUS_HALL"], cameraDistance: 8, spacing: 1.5 } };
export const InfrastructureBatch: Story = { args: { structures: ["SKY_DOCK", "NEURAL_WORKS", "RESONANCE_GRID"], cameraDistance: 8, spacing: 1.8 } };
export const IndustrialBatch: Story = { args: { structures: ["TITANIUM_WORKS", "HIGH_YIELD_TITANIUM_WORKS", "ORE_REFINERY"], cameraDistance: 7, spacing: 1.7 } };
export const SynthesizerBatch: Story = { args: { structures: ["UMBRITE_WORKS", "HIGH_YIELD_UMBRITE_WORKS", "AETHER_CONDENSER", "HIGH_YIELD_AETHER_CONDENSER"], cameraDistance: 8, spacing: 1.6 } };
export const ArcaneBatch: Story = { args: { structures: ["AMBARIC_TRANSFORMER", "AEGIS_DOME", "ASTRAL_DOCK", "SOVEREIGN_SIEGE_ENGINE", "IMPERIAL_EXCHANGE"], cameraDistance: 9, spacing: 1.6 } };
export const ManpowerBatch: Story = { args: { structures: ["QUARTERMASTERS_OFFICE", "ANCILLARY_FACTORY", "RESERVE_LATTICE", "CENSUS_DIRECTORATE", "TITANIUM_LEVY"], cameraDistance: 9, spacing: 1.7 } };
export const WorldbreakerPartsBatch: Story = { args: { structures: ["SOVEREIGN_SIEGE_ENGINE_PART_1", "SOVEREIGN_SIEGE_ENGINE_PART_2", "SOVEREIGN_SIEGE_ENGINE_PART_3"], cameraDistance: 7, spacing: 1.6 } };
export const ImperialExchangePartLedger: Story = { args: { structures: ["IMPERIAL_EXCHANGE_PART_1"], cameraDistance: 3 } };
export const ImperialExchangePartEngine: Story = { args: { structures: ["IMPERIAL_EXCHANGE_PART_2"], cameraDistance: 3 } };
export const ImperialExchangePartSeal: Story = { args: { structures: ["IMPERIAL_EXCHANGE_PART_3"], cameraDistance: 3 } };
export const ImperialExchangePartsBatch: Story = { args: { structures: ["IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3"], cameraDistance: 7, spacing: 1.6 } };
export const AstralDockPartsBatch: Story = { args: { structures: ["ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3"], cameraDistance: 7, spacing: 1.6 } };
export const CensusDirectoratePartEngine: Story = { args: { structures: ["CENSUS_DIRECTORATE_PART_1"], cameraDistance: 3 } };
export const CensusDirectoratePartVault: Story = { args: { structures: ["CENSUS_DIRECTORATE_PART_2"], cameraDistance: 3 } };
export const CensusDirectoratePartCharter: Story = { args: { structures: ["CENSUS_DIRECTORATE_PART_3"], cameraDistance: 3 } };
export const CensusDirectoratePartsBatch: Story = { args: { structures: ["CENSUS_DIRECTORATE_PART_1", "CENSUS_DIRECTORATE_PART_2", "CENSUS_DIRECTORATE_PART_3"], cameraDistance: 7, spacing: 1.6 } };
