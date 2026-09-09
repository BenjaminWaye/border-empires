import type { Meta, StoryObj } from "@storybook/html-vite";
import { createFleetHullMesh, disposeFleetHullMesh } from "@client/client-space-view/client-space-map-3d/client-space-fleet-hull-mesh.js";
import { FLEET_HULL_CLASS_IDS, type FleetHullClassId } from "@client/client-fleet-panel/client-fleet-panel-html.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  hulls: FleetHullClassId[];
  rotationDegrees: number;
  spacing: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#04070d" });
  const rad = (args.rotationDegrees * Math.PI) / 180;
  const entries = args.hulls.map((hullId, idx) => {
    const entry = createFleetHullMesh(hullId);
    entry.group.rotation.y = rad;
    entry.group.position.x = (idx - (args.hulls.length - 1) / 2) * args.spacing;
    stage.scene.add(entry.group);
    return entry;
  });
  const dispose = (): void => {
    for (const entry of entries) disposeFleetHullMesh(entry);
  };
  return wrapWithCleanup(stage, [dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/FleetHulls",
  parameters: {
    docs: {
      description: {
        component:
          "Fleets (§6/§12 v2a) hull-class ship models, rendered in Space View's 3D scene for a fleet order still TRAVELING (see client-space-fleet-overlay.ts). Each hull is authored nose-first along local +X: Scout is a small slender nosecone (fast, recon-only, no weapons silhouette); Raider is a wider dart shape; Battleline is a plain blunt hull, the unadorned main-line warship; Dreadnought is the largest hull with two side spikes for visible bulk/menace; Tanker is a long plain cylinder with two bulbous tanks, unmistakably a logistics hull rather than a warship."
      }
    }
  },
  argTypes: {
    hulls: { control: "check", options: FLEET_HULL_CLASS_IDS as unknown as string[] },
    rotationDegrees: { control: { type: "range", min: 0, max: 360, step: 15 } },
    spacing: { control: { type: "range", min: 0.8, max: 3, step: 0.1 } },
    cameraDistance: { control: { type: "range", min: 1, max: 12, step: 0.5 } }
  },
  args: { hulls: [...FLEET_HULL_CLASS_IDS], rotationDegrees: 0, spacing: 1.4, cameraDistance: 6 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const AllHulls: Story = {};
export const Scout: Story = { args: { hulls: ["SCOUT"], cameraDistance: 2 } };
export const Raider: Story = { args: { hulls: ["RAIDER"], cameraDistance: 2.5 } };
export const Battleline: Story = { args: { hulls: ["BATTLELINE"], cameraDistance: 3 } };
export const Dreadnought: Story = { args: { hulls: ["DREADNOUGHT"], cameraDistance: 3.5 } };
export const Tanker: Story = { args: { hulls: ["TANKER"], cameraDistance: 3 } };
// Rotated 90deg so the nose-forward orientation (the convention
// client-space-fleet-overlay.ts orients a whole formation by) is visible
// side-on rather than pointing straight at/away from the camera.
export const SideOnFormation: Story = { args: { rotationDegrees: 90, cameraDistance: 6.5 } };
