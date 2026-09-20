import { ACESFilmicToneMapping, DirectionalLight } from "three";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { createSiegeTowerOverlay } from "@client/client-map-3d-siege-tower-overlay.js";
import type { SiegeTowerVariant } from "@client/client-map-3d-siege-tower-palette.js";
import type { SiegeTowerRotationMode } from "@client/client-siege-tower-rotation-mode.js";
import { createGrassGround, createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  variant: SiegeTowerVariant;
  mode: SiegeTowerRotationMode;
  battleDistance: number;
  cameraDistance: number;
};

// Gameplay-context lighting (warm key, cool rim, ACES) so the black-iron
// lattice, brass gimbal and emissive lens read the way they do on the map.
const towerStage = (cameraDistance: number): Stage => {
  const stage = createStage({ cameraDistance, cameraTilt: 0.5, background: "#1b1d22" });
  stage.renderer.toneMapping = ACESFilmicToneMapping;
  stage.renderer.toneMappingExposure = 1.25;
  const rim = new DirectionalLight(0xdfe8ff, 1.6);
  rim.position.set(-6, 8, -10);
  stage.scene.add(rim);
  const back = new DirectionalLight(0xffffff, 0.8);
  back.position.set(0, 6, 12);
  stage.scene.add(back);
  return stage;
};

const render = (args: Args): HTMLElement => {
  const stage = towerStage(args.cameraDistance);
  const ground = createGrassGround(4, 0);
  stage.scene.add(ground.group);
  const overlay = createSiegeTowerOverlay(stage.scene, 8, () => args.mode);
  overlay.addInstance(0, 0, 0, 0, 0, args.variant);
  overlay.commit();

  if (args.battleDistance > 0) {
    const target = { x: args.battleDistance, y: 0 }; // battle east of the tower
    const animate = (): void => {
      overlay.update(performance.now(), target);
      rafId = requestAnimationFrame(animate);
    };
    let rafId = requestAnimationFrame(animate);
    return wrapWithCleanup(stage, [() => cancelAnimationFrame(rafId), overlay.dispose, ground.dispose]);
  }

  return wrapWithCleanup(stage, [overlay.dispose, ground.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/SiegeTower",
  argTypes: {
    variant: { control: "inline-radio", options: ["SIEGE_TOWER", "DREAD_TOWER"] },
    mode: { control: "inline-radio", options: ["lens", "structure"] },
    battleDistance: { control: { type: "range", min: 0, max: 8, step: 1 } },
    cameraDistance: { control: { type: "range", min: 2, max: 18, step: 0.5 } }
  },
  args: { variant: "SIEGE_TOWER", mode: "lens", battleDistance: 4, cameraDistance: 7 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const SiegeTowerFiring: Story = {};
export const DreadTowerFiring: Story = { args: { variant: "DREAD_TOWER", battleDistance: 5 } };
export const StructureModeWheelsTower: Story = { args: { mode: "structure", battleDistance: 4 } };
export const IdleTower: Story = { args: { battleDistance: 0 } };

// Both upgraded siege variants on the same battlefield to compare silhouettes
// and colour-coded beams at playing distance.
export const BothVariants:
  Story = {
    render: (args) => {
      const stage = towerStage(args.cameraDistance);
      const ground = createGrassGround(4, 0);
      stage.scene.add(ground.group);
      const overlay = createSiegeTowerOverlay(stage.scene, 8, () => args.mode);
      overlay.addInstance(-1.6, 0, 0, 0, 0, "SIEGE_TOWER");
      overlay.addInstance(1.6, 0, 0, 2, 0, "DREAD_TOWER");
      overlay.commit();
      const target = { x: 5, y: 0 };
      const animate = (): void => {
        overlay.update(performance.now(), target);
        rafId = requestAnimationFrame(animate);
      };
      let rafId = requestAnimationFrame(animate);
      return wrapWithCleanup(stage, [() => cancelAnimationFrame(rafId), overlay.dispose, ground.dispose]);
    }
  };