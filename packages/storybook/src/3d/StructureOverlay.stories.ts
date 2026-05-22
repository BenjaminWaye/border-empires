import type { Meta, StoryObj } from "@storybook/html-vite";
import { createStructureOverlay, type StructureKind, type StructureResourceHint } from "@client/client-map-3d-structure-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  structures: StructureKind[];
  resourceHint: "none" | "IRON" | "GEMS";
  cameraDistance: number;
  spacing: number;
};

const KINDS: ReadonlyArray<StructureKind> = [
  "FARMSTEAD", "WATERWORKS", "CAMP", "MINE", "IRONWORKS",
  "MARKET", "OBSERVATORY", "GRANARY", "SEED_GRANARY",
  "BANK", "AETHER_TOWER", "AEGIS_DOME", "WORLD_ENGINE", "IMPERIAL_EXCHANGE",
  "AIRPORT", "CARAVANARY", "CUSTOMS_HOUSE", "EXCHANGE_HOUSE",
  "GARRISON_HALL", "GOVERNORS_OFFICE", "RAIL_DEPOT", "RADAR_SYSTEM",
  "FOUNDRY", "ADVANCED_IRONWORKS",
  "FUR_SYNTHESIZER", "ADVANCED_FUR_SYNTHESIZER",
  "CRYSTAL_SYNTHESIZER", "ADVANCED_CRYSTAL_SYNTHESIZER",
  "ASTRAL_DOCK"
];

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1b1d22" });
  const overlay = createStructureOverlay(stage.scene, Math.max(args.structures.length, 1));
  const hint: StructureResourceHint = args.resourceHint === "none" ? undefined : args.resourceHint;
  args.structures.forEach((kind, idx) => {
    const x = (idx - (args.structures.length - 1) / 2) * args.spacing;
    overlay.addInstance(x, 0, 0, kind, hint);
  });
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/StructureOverlay",
  argTypes: {
    structures: { control: "check", options: KINDS as unknown as string[] },
    resourceHint: { control: "inline-radio", options: ["none", "IRON", "GEMS"] },
    cameraDistance: { control: { type: "range", min: 2, max: 18, step: 0.5 } },
    spacing: { control: { type: "range", min: 0.8, max: 2.5, step: 0.1 } }
  },
  args: { structures: [...KINDS], resourceHint: "none", cameraDistance: 10, spacing: 1.3 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const AllKinds: Story = {};
export const Farmstead: Story = { args: { structures: ["FARMSTEAD"], cameraDistance: 3 } };
export const Mine: Story = { args: { structures: ["MINE"], cameraDistance: 3 } };
export const MineIron: Story = { args: { structures: ["MINE"], resourceHint: "IRON", cameraDistance: 3 } };
export const MineGems: Story = { args: { structures: ["MINE"], resourceHint: "GEMS", cameraDistance: 3 } };
export const Observatory: Story = { args: { structures: ["OBSERVATORY"], cameraDistance: 3 } };
export const Market: Story = { args: { structures: ["MARKET"], cameraDistance: 3 } };
export const Granary: Story = { args: { structures: ["GRANARY"], cameraDistance: 3 } };
export const Bank: Story = { args: { structures: ["BANK"], cameraDistance: 3 } };
export const AetherTower: Story = { args: { structures: ["AETHER_TOWER"], cameraDistance: 3.5 } };
export const AegisDome: Story = { args: { structures: ["AEGIS_DOME"], cameraDistance: 3.5 } };
export const WorldEngine: Story = { args: { structures: ["WORLD_ENGINE"], cameraDistance: 4 } };
export const ImperialExchange: Story = { args: { structures: ["IMPERIAL_EXCHANGE"], cameraDistance: 4 } };
export const Airport: Story = { args: { structures: ["AIRPORT"], cameraDistance: 4 } };
export const Caravanary: Story = { args: { structures: ["CARAVANARY"], cameraDistance: 3.5 } };
export const CustomsHouse: Story = { args: { structures: ["CUSTOMS_HOUSE"], cameraDistance: 3 } };
export const ExchangeHouse: Story = { args: { structures: ["EXCHANGE_HOUSE"], cameraDistance: 3 } };
export const GarrisonHall: Story = { args: { structures: ["GARRISON_HALL"], cameraDistance: 3.5 } };
export const GovernorsOffice: Story = { args: { structures: ["GOVERNORS_OFFICE"], cameraDistance: 3.5 } };
export const RailDepot: Story = { args: { structures: ["RAIL_DEPOT"], cameraDistance: 3.5 } };
export const RadarSystem: Story = { args: { structures: ["RADAR_SYSTEM"], cameraDistance: 3 } };
export const Foundry: Story = { args: { structures: ["FOUNDRY"], cameraDistance: 4 } };
export const AdvancedIronworks: Story = { args: { structures: ["ADVANCED_IRONWORKS"], cameraDistance: 4 } };
export const FurSynthesizer: Story = { args: { structures: ["FUR_SYNTHESIZER"], cameraDistance: 3.5 } };
export const AdvancedFurSynthesizer: Story = { args: { structures: ["ADVANCED_FUR_SYNTHESIZER"], cameraDistance: 4 } };
export const CrystalSynthesizer: Story = { args: { structures: ["CRYSTAL_SYNTHESIZER"], cameraDistance: 3.5 } };
export const AdvancedCrystalSynthesizer: Story = { args: { structures: ["ADVANCED_CRYSTAL_SYNTHESIZER"], cameraDistance: 4 } };
export const AstralDock: Story = { args: { structures: ["ASTRAL_DOCK"], cameraDistance: 4 } };
export const FirstBatch: Story = { args: { structures: ["BANK", "AETHER_TOWER", "AEGIS_DOME", "WORLD_ENGINE", "IMPERIAL_EXCHANGE"], cameraDistance: 8, spacing: 1.5 } };
export const CivicBatch: Story = { args: { structures: ["BANK", "EXCHANGE_HOUSE", "CUSTOMS_HOUSE", "GARRISON_HALL", "GOVERNORS_OFFICE"], cameraDistance: 8, spacing: 1.5 } };
export const InfrastructureBatch: Story = { args: { structures: ["AIRPORT", "RAIL_DEPOT", "RADAR_SYSTEM", "CARAVANARY"], cameraDistance: 8, spacing: 1.8 } };
export const IndustrialBatch: Story = { args: { structures: ["IRONWORKS", "ADVANCED_IRONWORKS", "FOUNDRY"], cameraDistance: 7, spacing: 1.7 } };
export const SynthesizerBatch: Story = { args: { structures: ["FUR_SYNTHESIZER", "ADVANCED_FUR_SYNTHESIZER", "CRYSTAL_SYNTHESIZER", "ADVANCED_CRYSTAL_SYNTHESIZER"], cameraDistance: 8, spacing: 1.6 } };
export const ArcaneBatch: Story = { args: { structures: ["AETHER_TOWER", "AEGIS_DOME", "ASTRAL_DOCK", "WORLD_ENGINE", "IMPERIAL_EXCHANGE"], cameraDistance: 9, spacing: 1.6 } };
