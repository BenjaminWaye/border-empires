import type { Meta, StoryObj } from "@storybook/html-vite";
import { InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, PlaneGeometry } from "three";
import { createMountainModelGeometry, createMountainModelMaterial, MOUNTAIN_MODELS } from "@client/client-map-3d-mountain-models.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = { cameraDistance: number; spacing: number; cameraTilt: number };

// The hand-designed mountain set: one row per climate (temperate, alpine),
// each model shown plain and with its snow cap.
const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#9fb3c8" });
  const cleanups: Array<() => void> = [];
  const ground = new Mesh(new PlaneGeometry(40, 40), new MeshLambertMaterial({ color: "#7fa34a" }));
  ground.rotation.x = -Math.PI / 2;
  stage.scene.add(ground);
  const material = createMountainModelMaterial();
  const count = MOUNTAIN_MODELS.length;
  (["temperate", "alpine"] as const).forEach((climate, row) => {
    MOUNTAIN_MODELS.forEach((model, i) => {
      const geometry = createMountainModelGeometry(model, climate);
      const snow = new InstancedBufferAttribute(new Float32Array([0, 1]), 1);
      geometry.setAttribute("aSnowLine", snow);
      const mesh = new InstancedMesh(geometry, material, 2);
      const x = (i - (count - 1) / 2) * args.spacing;
      mesh.setMatrixAt(0, new Matrix4().makeTranslation(x, 0, (row * 2 - 1.5) * args.spacing));
      mesh.setMatrixAt(1, new Matrix4().makeTranslation(x, 0, (row * 2 - 0.5) * args.spacing));
      stage.scene.add(mesh);
      cleanups.push(() => geometry.dispose());
    });
  });
  cleanups.push(() => material.dispose());
  return wrapWithCleanup(stage, cleanups);
};

const meta: Meta<Args> = {
  title: "3D Library/MountainModels",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 4, max: 30, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.1 } },
    cameraTilt: { control: { type: "range", min: 0.15, max: 1.2, step: 0.05 } }
  },
  args: { cameraDistance: 11, spacing: 1.7, cameraTilt: 0.6 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Lineup: Story = {};
export const CloseUp: Story = { args: { cameraDistance: 6 } };
export const Side: Story = { args: { cameraDistance: 8, cameraTilt: 1.15 } };
