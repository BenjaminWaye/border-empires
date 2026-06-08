import type { Meta, StoryObj } from "@storybook/html-vite";
import { createCrystalAbilityOverlay, CRYSTAL_ABILITY_KEYS } from "@client/client-map-3d-crystal-ability-overlay.js";
import type { CrystalAbilityInfoKey } from "@client/client-crystal-ability-info.js";
import { OFFENSIVE_ABILITY_KEYS } from "@client/client-map-3d-crystal-ability-offensive.js";
import { DEFENSIVE_ABILITY_KEYS } from "@client/client-map-3d-crystal-ability-defensive.js";
import { UTILITY_ABILITY_KEYS } from "@client/client-map-3d-crystal-ability-utility.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  abilities: CrystalAbilityInfoKey[];
  spacing: number;
  cameraDistance: number;
};

const renderAbilities = (abilities: ReadonlyArray<CrystalAbilityInfoKey>, spacing: number, cameraDistance: number): HTMLElement => {
  const stage = createStage({ cameraDistance, background: "#0c1220" });
  const overlay = createCrystalAbilityOverlay(stage.scene, abilities.length);
  abilities.forEach((key, idx) => {
    const x = (idx - (abilities.length - 1) / 2) * spacing;
    overlay.addInstance(key, x, 0, 0, x, 0);
  });
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const render = (args: Args): HTMLElement =>
  renderAbilities(args.abilities, args.spacing, args.cameraDistance);

const meta: Meta<Args> = {
  title: "3D Library/CrystalAbilityOverlay",
  argTypes: {
    abilities: { control: "check", options: CRYSTAL_ABILITY_KEYS as unknown as string[] },
    spacing: { control: { type: "range", min: 0.8, max: 3, step: 0.1 } },
    cameraDistance: { control: { type: "range", min: 2, max: 20, step: 0.5 } }
  },
  args: { abilities: [...CRYSTAL_ABILITY_KEYS], spacing: 1.4, cameraDistance: 11 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const AllAbilities: Story = {};
export const Offensive: Story = {
  render: (args) => renderAbilities(OFFENSIVE_ABILITY_KEYS, args.spacing, args.cameraDistance),
  args: { abilities: [...OFFENSIVE_ABILITY_KEYS], spacing: 1.4, cameraDistance: 9 }
};
export const Defensive: Story = {
  render: (args) => renderAbilities(DEFENSIVE_ABILITY_KEYS, args.spacing, args.cameraDistance),
  args: { abilities: [...DEFENSIVE_ABILITY_KEYS], spacing: 1.4, cameraDistance: 9 }
};
export const Utility: Story = {
  render: (args) => renderAbilities(UTILITY_ABILITY_KEYS, args.spacing, args.cameraDistance),
  args: { abilities: [...UTILITY_ABILITY_KEYS], spacing: 1.4, cameraDistance: 9 }
};
export const AetherWall: Story = {
  render: (args) => renderAbilities(["aether_wall"], args.spacing, args.cameraDistance),
  args: { abilities: ["aether_wall"], cameraDistance: 4 }
};
export const Siphon: Story = {
  render: (args) => renderAbilities(["siphon"], args.spacing, args.cameraDistance),
  args: { abilities: ["siphon"], cameraDistance: 4 }
};
export const Stormfront: Story = {
  render: (args) => renderAbilities(["stormfront"], args.spacing, args.cameraDistance),
  args: { abilities: ["stormfront"], cameraDistance: 4 }
};
