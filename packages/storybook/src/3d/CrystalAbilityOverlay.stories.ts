import type { Meta, StoryObj } from "@storybook/html-vite";
import type { CrystalAbilityInfoKey } from "@client/client-crystal-ability-info.js";
import { createCrystalAbilityOverlay } from "@client/client-map-3d-crystal-ability-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = { key: CrystalAbilityInfoKey; cameraDistance: number };

const ALL_KEYS: CrystalAbilityInfoKey[] = [
  "reveal_empire",
  "reveal_empire_stats",
  "aether_wall",
  "survey_sweep",
  "aether_lance",
  "retort_recasting",
  "aether_bridge",
  "siphon",
  "aether_emp",
  "city_overclock",
  "stormfront",
  "aegis_lock",
  "astral_dock_launch",
  "create_mountain",
  "remove_mountain"
];

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0d1721" });
  const overlay = createCrystalAbilityOverlay(stage.scene);
  overlay.addInstance(args.key, 0, 0, 0, 0, 0);
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/CrystalAbilityOverlay",
  args: { key: "reveal_empire", cameraDistance: 4.5 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Gallery: Story = {
  render: (args) => {
    const stage = createStage({ cameraDistance: 12, background: "#0d1721" });
    const overlay = createCrystalAbilityOverlay(stage.scene);
    ALL_KEYS.forEach((key, index) => {
      const col = index % 5;
      const row = Math.floor(index / 5);
      overlay.addInstance(key, (col - 2) * 1.5, (row - 1) * 1.5, 0, col, row);
    });
    overlay.commit();
    return wrapWithCleanup(stage, [overlay.dispose]);
  }
};
export const RevealEmpire: Story = { args: { key: "reveal_empire" } };
export const RevealEmpireStats: Story = { args: { key: "reveal_empire_stats" } };
export const AetherWall: Story = { args: { key: "aether_wall" } };
export const SurveySweep: Story = { args: { key: "survey_sweep" } };
export const AetherLance: Story = { args: { key: "aether_lance" } };
export const RetortRecasting: Story = { args: { key: "retort_recasting" } };
export const AetherBridge: Story = { args: { key: "aether_bridge" } };
export const Siphon: Story = { args: { key: "siphon" } };
export const AetherEmp: Story = { args: { key: "aether_emp" } };
export const CityOverclock: Story = { args: { key: "city_overclock" } };
export const Stormfront: Story = { args: { key: "stormfront" } };
export const AegisLock: Story = { args: { key: "aegis_lock" } };
export const AstralDockLaunch: Story = { args: { key: "astral_dock_launch" } };
export const CreateMountain: Story = { args: { key: "create_mountain" } };
export const RemoveMountain: Story = { args: { key: "remove_mountain" } };
