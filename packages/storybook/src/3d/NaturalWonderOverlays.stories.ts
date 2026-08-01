import type { Meta, StoryObj } from "@storybook/html-vite";
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import type { NaturalWonderType } from "@border-empires/shared";
import { createNaturalWonderOverlays } from "@client/client-map-3d-natural-wonders/client-map-3d-natural-wonder-overlays.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Matches legacy3DTerrainPalette.grassLight/grassDark in
// client-map-3d-terrain-textures.ts, without pulling in that module's full
// procedural-texture pipeline for a Storybook ground plane.
const GRASS_LIGHT = "#778e42"; // rgb(119, 142, 66)
const GRASS_DARK = "#5e7c30"; // rgb(94, 124, 48)
const TILE_GAP = 0.04;

const createGrassTileGrid = (radius: number): Group => {
  const group = new Group();
  const geometry = new PlaneGeometry(1 - TILE_GAP, 1 - TILE_GAP);
  const lightMat = new MeshStandardMaterial({ color: GRASS_LIGHT, roughness: 0.95, metalness: 0 });
  const darkMat = new MeshStandardMaterial({ color: GRASS_DARK, roughness: 0.95, metalness: 0 });
  for (let gz = -radius; gz <= radius; gz += 1) {
    for (let gx = -radius; gx <= radius; gx += 1) {
      const tile = new Mesh(geometry, (gx + gz) % 2 === 0 ? lightMat : darkMat);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(gx, -0.01, gz);
      group.add(tile);
    }
  }
  group.userData.dispose = (): void => { geometry.dispose(); lightMat.dispose(); darkMat.dispose(); };
  return group;
};

type Args = {
  tileSpacing: number;
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

  const grassGrid = createGrassTileGrid(args.tileSpacing + 1);
  stage.scene.add(grassGrid);

  const overlays = createNaturalWonderOverlays(stage.scene);
  const cols = 3;
  WONDER_TYPES.forEach((type, i) => {
    // Each wonder sits centered on its own grass tile, tileSpacing tiles
    // apart from its neighbors — one wonder per map tile, same as in-game.
    const x = (i % cols) * args.tileSpacing - args.tileSpacing;
    const z = Math.floor(i / cols) * args.tileSpacing - args.tileSpacing;
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
    () => (grassGrid.userData.dispose as () => void)()
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/NaturalWonderOverlays",
  parameters: {
    docs: {
      description: {
        component: "All 9 natural wonder overlays (docs/natural-wonders-design.md §2), one per grass tile, laid out 3x3, rendering the shipped production code."
      }
    }
  },
  argTypes: {
    tileSpacing: { control: { type: "range", min: 1, max: 5, step: 1 } },
    cameraDistance: { control: { type: "range", min: 3, max: 30, step: 1 } }
  },
  args: { tileSpacing: 2, cameraDistance: 12 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Grid: Story = {};
export const WideView: Story = { args: { tileSpacing: 3, cameraDistance: 20 } };
