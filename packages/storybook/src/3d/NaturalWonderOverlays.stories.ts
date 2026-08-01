import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import type { NaturalWonderType } from "@border-empires/shared";
import { createNaturalWonderOverlays } from "@client/client-map-3d-natural-wonders/client-map-3d-natural-wonder-overlays.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  spacing: number;
  cameraDistance: number;
};

const WONDER_TYPES: readonly NaturalWonderType[] = [
  "FOUNDRY_HEART",
  "DEEPWATER_ENGINE",
  "CONSCRIPTION_ENGINE",
  "WARPRESS",
  "BASTION_FRAME",
  "CALCULATING_ENGINE",
  "QUICKFORGE",
  "WATCHTOWER_ENGINE",
  "CARTOGRAPHERS_LENS"
];

/**
 * Renders the actual production overlay factories (createFoundryHeartOverlay,
 * createDeepwaterEngineOverlay, ...) via the createNaturalWonderOverlays
 * aggregator client-map-3d.ts wires in — not a shader mockup. Verifies the
 * shipped InstancedMesh lifecycle (clear/addInstance/commit/update/dispose)
 * end to end, in a real Three.js scene.
 */
const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0d1018" });

  const groundSize = (args.spacing * 3) + 2;
  const groundGeometry = new PlaneGeometry(groundSize, groundSize, 1, 1);
  const groundMaterial = new MeshStandardMaterial({ color: "#1c2620", roughness: 0.9, metalness: 0 });
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  stage.scene.add(ground);

  const overlays = createNaturalWonderOverlays(stage.scene);
  const cols = 3;
  WONDER_TYPES.forEach((type, i) => {
    const x = (i % cols) * args.spacing - args.spacing;
    const z = Math.floor(i / cols) * args.spacing - args.spacing;
    overlays.addInstance(type, x, z, 0);
  });
  overlays.commit();

  let rafId = 0;
  const animate = (): void => {
    overlays.update(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    overlays.dispose,
    () => { groundGeometry.dispose(); groundMaterial.dispose(); }
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/NaturalWonderOverlays",
  parameters: {
    docs: {
      description: {
        component: "All 9 natural wonder overlays (docs/natural-wonders-design.md §2), laid out 3x3, rendering the shipped production code."
      }
    }
  },
  argTypes: {
    spacing: { control: { type: "range", min: 1.5, max: 5, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 3, max: 30, step: 1 } }
  },
  args: { spacing: 2.5, cameraDistance: 12 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Grid: Story = {};
export const WideView: Story = { args: { spacing: 3, cameraDistance: 20 } };
