// True-3D parity for the refinery picker's map highlight (2D:
// refinery-canvas-2d.ts): the town's reach, its fields (eligible bright,
// taken / unlinked grey), the focused field and the chosen ring tile, as
// tinted ground plates. Synced every frame by the placement overlay
// (client-map-3d-placement-overlay.ts) from the single picker slot.
import { AdditiveBlending, Color, DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, type Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { tileCornerMeanY } from "../client-map-3d-beacon-placement-overlay/client-map-3d-beacon-placement-overlay.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { REFINERY_HIGHLIGHT_COLORS, refineryPickerHighlight, type RefineryPickerHighlight } from "./refinery-picker-highlight.js";

/** Reach (21 x 21) plus every field around it fits well inside this. */
export const MAX_REFINERY_HIGHLIGHT_TILES = 1024;
const RISE_ABOVE_HEIGHTFIELD = 0.016;

export type RefineryHighlight3DSyncDeps = {
  readonly state: { readonly tiles: ReadonlyMap<string, Tile> };
  readonly sceneOrigin: { camX: number; camY: number };
  readonly tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  readonly cornerYAt: (x: number, y: number) => number;
  /** Tests pass a highlight; the map reads the open picker's. */
  readonly highlight?: RefineryPickerHighlight | undefined;
};

export const createRefineryHighlight3D = (scene: Scene): { readonly sync: (deps: RefineryHighlight3DSyncDeps) => number; readonly dispose: () => void } => {
  const geometry = new PlaneGeometry(0.94, 0.94);
  geometry.rotateX(-Math.PI * 0.5);
  const material = new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 1, depthTest: false, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
  const mesh = new InstancedMesh(geometry, material, MAX_REFINERY_HIGHLIGHT_TILES);
  mesh.name = "refinery-picker-highlight";
  mesh.frustumCulled = false;
  mesh.renderOrder = 13;
  mesh.count = 0;
  mesh.visible = false;
  scene.add(mesh);
  const matrix = new Matrix4(), color = new Color(), background = new Color("#000000");
  return {
    sync: (deps) => {
      const highlight = deps.highlight ?? refineryPickerHighlight();
      if (!highlight || highlight.size === 0) {
        mesh.visible = false; mesh.count = 0;
        return 0;
      }
      let count = 0;
      for (const [key, tone] of highlight) {
        if (count >= MAX_REFINERY_HIGHLIGHT_TILES) break;
        const [x, y] = key.split(",").map(Number) as [number, number];
        if (deps.tileVisibilityStateAt(x, y, deps.state.tiles.get(key)) === "unexplored") continue;
        matrix.makeTranslation(
          toroidDelta(deps.sceneOrigin.camX, x, WORLD_WIDTH) + 0.5,
          tileCornerMeanY(deps.cornerYAt, x, y) + RISE_ABOVE_HEIGHTFIELD,
          toroidDelta(deps.sceneOrigin.camY, y, WORLD_HEIGHT) + 0.5
        );
        mesh.setMatrixAt(count, matrix);
        // Additive over the ground: the tone's alpha is baked into the colour (instances share one material).
        const colors = REFINERY_HIGHLIGHT_COLORS[tone];
        mesh.setColorAt(count, color.set(colors.fill).lerp(background, 1 - Math.min(1, colors.alpha * 2.2)));
        count += 1;
      }
      mesh.count = count;
      mesh.visible = count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return count;
    },
    dispose: () => { scene.remove(mesh); mesh.dispose(); geometry.dispose(); material.dispose(); }
  };
};
