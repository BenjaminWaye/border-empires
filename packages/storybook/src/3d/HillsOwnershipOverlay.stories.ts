import type { Meta, StoryObj } from "@storybook/html-vite";
import { DirectionalLight, Color, MeshBasicMaterial } from "three";
import {
  createHeightfield,
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  type HeightfieldTerrainKind
} from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createHillTerrain } from "@client/client-map-3d-hills.js";
import { createOwnershipOverlay } from "@client/client-map-3d-ownership-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Regression demo for the "hills don't follow terrain under the ownership
// overlay" bug: the overlay quad's corners come from heightfield.cornerYAt,
// but hills are a separate dome mesh layered on top of the flat heightfield
// (client-map-3d-hills.ts) -- cornerYAt never reflects the dome. FixApplied
// bumps the quad up by HEIGHTFIELD_HILLS_ELEVATION_BONUS on hill tiles;
// Draped calls the real addHillTile, which drapes the overlay over the
// dome's own domeFalloff curve instead of bridging it with one flat plane
// (see client-map-3d-ownership-overlay.ts and client-map-3d.ts:1780-1802).
// BugRepro leaves both off so the flat overlay sinks into / floats below
// the raised hill surface.
const CENTER = 100;

type Args = {
  applyHillBonus: boolean;
  cameraDistance: number;
  cameraTilt: number;
  trueDepth: boolean;
  drape: boolean;
};

const isHillsAt = (wx: number, wy: number): boolean => wx - CENTER === 0 && wy - CENTER === 0;
const tileKindAt = (_wx: number, _wy: number): HeightfieldTerrainKind => "GRASS";

const OWNER_COLOR = new Color("#4a8cff");

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    cameraDistance: args.cameraDistance,
    cameraTilt: args.cameraTilt,
    background: "#1a2030"
  });
  const raking = new DirectionalLight("#fff0c0", 1.8);
  raking.position.set(-14, 9, 6);
  stage.scene.add(raking);

  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.setGridlinesVisible(true);

  const hillTerrain = createHillTerrain(stage.scene, 512, hf.material);

  const shared = {
    camX: CENTER,
    camY: CENTER,
    halfW: 6,
    halfH: 6,
    worldWidth: 240,
    worldHeight: 240,
    tileKindAt
  };
  hf.rebuild({ ...shared, isHillsAt });
  hillTerrain.rebuild({ ...shared, isHillsAt });

  const RISE = 0.022; // OWNERSHIP_RISE_ABOVE_HEIGHTFIELD
  const corner00Y = hf.cornerYAt(CENTER, CENTER) + RISE;
  const corner10Y = hf.cornerYAt(CENTER + 1, CENTER) + RISE;
  const corner01Y = hf.cornerYAt(CENTER, CENTER + 1) + RISE;
  const corner11Y = hf.cornerYAt(CENTER + 1, CENTER + 1) + RISE;

  const overlay = createOwnershipOverlay(stage.scene, 1);

  if (args.drape) {
    // Real production path: addHillTile drapes the overlay over the dome's
    // own domeFalloff curve instead of bridging it with one flat plane.
    overlay.addHillTile(0, 1, 0, 1, corner00Y, corner10Y, corner01Y, corner11Y, OWNER_COLOR, false);
  } else {
    // Mirrors the flat-quad ownership overlay tile loop in client-map-3d.ts
    // for non-hill tiles: one quad, corners sourced from cornerYAt (+ the
    // hill bonus once fixed). Only the single hill tile (dx=0, dz=0) is
    // drawn so the height mismatch against the dome underneath is
    // unambiguous.
    const hillBonus = args.applyHillBonus ? HEIGHTFIELD_HILLS_ELEVATION_BONUS : 0;
    overlay.addTile(
      0, corner00Y + hillBonus, 0,
      1, corner10Y + hillBonus, 0,
      0, corner01Y + hillBonus, 1,
      1, corner11Y + hillBonus, 1,
      OWNER_COLOR, false
    );

    // Production always renders the overlay with depthTest/depthWrite off
    // (client-map-3d-ownership-overlay.ts) so it never disappears behind
    // terrain -- that's why the mismatch in BugRepro shows as a flat plane
    // floating in front of the dome instead of being hidden by it. Flipping
    // depth testing back on here is *not* how the game renders it; it's only
    // to visualize where the overlay quad actually sits in 3D space: with
    // real depth testing, the hill's solid geometry occludes the overlay
    // wherever the flat plane is physically buried under the dome's surface.
    if (args.trueDepth) {
      const material = overlay.settledMesh.material as MeshBasicMaterial;
      material.depthTest = true;
      material.depthWrite = true;
      overlay.settledMesh.renderOrder = 0;
    }
  }
  overlay.commit();

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines, raking); },
    hf.dispose,
    hillTerrain.dispose,
    overlay.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/HillsOwnershipOverlay",
  parameters: {
    docs: {
      description: {
        component:
          "Ownership overlay over a single hill tile. BugRepro shows the flat overlay quad sunk into the raised hill dome (cornerYAt alone, no hill awareness). FixApplied raises the whole quad by HEIGHTFIELD_HILLS_ELEVATION_BONUS so it clears the dome peak (a stopgap, superseded below). Draped calls the real addHillTile, which drapes the overlay over the dome's own curve -- this is what production actually ships."
      }
    }
  },
  argTypes: {
    applyHillBonus: { control: "boolean" },
    trueDepth: { control: "boolean" },
    drape: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 4, max: 20, step: 1 } },
    cameraTilt: { control: { type: "range", min: 0.05, max: 1.4, step: 0.05 } }
  },
  args: { applyHillBonus: true, trueDepth: false, drape: false, cameraDistance: 5, cameraTilt: 0.9 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const FixApplied: Story = { args: { applyHillBonus: true } };
export const BugRepro: Story = { args: { applyHillBonus: false } };
// Close, near-level side view: the dome's full silhouette rises well above
// the flat overlay plane sitting at its base, so the overlay reads as a
// patch of grass the hill is sitting on top of, rather than a highlight
// that follows the hill's surface (the reported bug).
export const BugReproSideProfile: Story = { args: { applyHillBonus: false, cameraDistance: 3.5, cameraTilt: 1.15 } };
// With real depth testing (NOT how production renders it -- see the
// trueDepth comment in render()), the hill's solid geometry buries the
// overlay wherever the flat plane sits below the dome's surface: only the
// sliver outside the dome's footprint stays visible. This is the ground
// truth of where the buggy overlay quad actually sits in 3D space.
export const BugReproUnderHill: Story = {
  args: { applyHillBonus: false, trueDepth: true, cameraDistance: 3.5, cameraTilt: 1.15 }
};
export const FixAppliedTrueDepth: Story = {
  args: { applyHillBonus: true, trueDepth: true, cameraDistance: 3.5, cameraTilt: 1.15 }
};
// Production path: the overlay patch drapes over the dome's own curve (same
// domeFalloff radial shape as the terrain mesh) instead of bridging it with
// one flat plane -- "cellophane wrapped around the hill".
export const Draped: Story = { args: { drape: true, cameraDistance: 10, cameraTilt: 1.0 } };
export const DrapedSideProfile: Story = { args: { drape: true, cameraDistance: 3, cameraTilt: 1.2 } };
