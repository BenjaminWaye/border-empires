import { DirectionalLight, Mesh, MeshStandardMaterial, PCFSoftShadowMap, PlaneGeometry, PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { createDockOverlay } from "@client/client-map-3d-dock-overlay.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

type Args = {
  rotationDegrees: number;
  count: number;
  zoom: number;
};

// Lit like the structure lineups (Sandbox/Refineries): orthographic, shadowed,
// with the building environment map the live map hands the overlay.
const render = (args: Args): HTMLElement => {
  const stage = createStage({ width: 1200, height: 620, camera: "orthographic", orthoHalfHeight: (0.5 + 0.35 * args.count) / args.zoom, background: "#18232b", bloom: true });
  stage.camera.position.set(1.4, 1.5, 2.4);
  stage.camera.lookAt(0, 0.12, 0);
  stage.renderer.shadowMap.enabled = true;
  stage.renderer.shadowMap.type = PCFSoftShadowMap;
  const sun = stage.scene.children.find((object): object is DirectionalLight => object instanceof DirectionalLight);
  if (sun) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.1, far: 40 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.002;
  }
  const room = new RoomEnvironment();
  const pmrem = new PMREMGenerator(stage.renderer);
  const environment = pmrem.fromScene(room);
  pmrem.dispose();
  room.dispose();
  // Water under the whole stage; the quay stands on its own marble course.
  const waterGeometry = new PlaneGeometry(200, 200).rotateX(-Math.PI / 2);
  const waterMaterial = new MeshStandardMaterial({ color: "#2a5a78", roughness: 0.6 });
  const water = new Mesh(waterGeometry, waterMaterial);
  water.position.y = -0.04;
  water.receiveShadow = true;
  stage.scene.add(water);
  const overlay = createDockOverlay(stage.scene, Math.max(args.count, 1), environment.texture);
  const rad = (args.rotationDegrees * Math.PI) / 180;
  for (let i = 0; i < args.count; i += 1) {
    const x = (i - (args.count - 1) / 2) * 1.4;
    overlay.addInstance(x, 0, 0, rad, Math.round(x), 0);
  }
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose, () => environment.dispose(), () => waterGeometry.dispose(), () => waterMaterial.dispose()]);
};

const meta: Meta<Args> = {
  title: "Map/Structures/Dock",
  parameters: {
    docs: {
      description: {
        component:
          "Harbour quay (the dock tile; see Harbour for the full harbour with its landing slipways), in the shared structure palette: a black-and-gold marble quay on a charcoal course with a brass inlay and an iron-capped sea edge, an iron-plated pier on blackened piles, lamp posts along the edge, a glazed grey stone control office with a sensor mast, a powered gantry crane with cyan status strips fed by a cell bank, sealed cargo containers, a beacon on the pier head and an armoured troop carrier moored alongside. A transport hub, no guns and no walls (world bible §10, §11). Modelled facing +z (south); rotate to face the adjacent water tile."
      }
    }
  },
  argTypes: {
    rotationDegrees: { control: { type: "range", min: 0, max: 360, step: 15 } },
    count: { control: { type: "range", min: 1, max: 5, step: 1 } },
    zoom: { control: { type: "range", min: 0.5, max: 4, step: 0.1 } }
  },
  args: { rotationDegrees: 0, count: 1, zoom: 1 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const FacingSouth: Story = {};
export const FacingNorth: Story = { args: { rotationDegrees: 180 } };
export const FacingEast: Story = { args: { rotationDegrees: 90 } };
export const Row: Story = { args: { count: 4 } };
