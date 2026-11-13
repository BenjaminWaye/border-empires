// True-3D parity for the refinery picker's map highlight (2D:
// refinery-canvas-2d.ts): the town's reach, its fields (eligible bright,
// taken / unlinked grey), the focused field and the chosen ring tile, as
// tinted ground plates. Synced every frame by the placement overlay
// (client-map-3d-placement-overlay.ts) from the single picker slot.
import { Color, DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, type Scene } from "three";
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
  // Two layers: the faint reach wash, and the fields / ring tiles over it. Depth-tested, so models stay in front.
  const layer = (name: string, opacity: number): InstancedMesh => {
    const material = new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new InstancedMesh(geometry, material, MAX_REFINERY_HIGHLIGHT_TILES);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = 13;
    mesh.count = 0;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  };
  const reach = layer("refinery-picker-reach", REFINERY_HIGHLIGHT_COLORS.reach.alpha * 1.6);
  const marks = layer("refinery-picker-highlight", 0.55);
  const matrix = new Matrix4(), color = new Color();
  const finish = (mesh: InstancedMesh, count: number): void => {
    mesh.count = count;
    mesh.visible = count > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  return {
    sync: (deps) => {
      const highlight = deps.highlight ?? refineryPickerHighlight();
      let reachCount = 0, markCount = 0;
      for (const [key, tone] of highlight ?? []) {
        if (reachCount + markCount >= MAX_REFINERY_HIGHLIGHT_TILES) break;
        const [x, y] = key.split(",").map(Number) as [number, number];
        if (deps.tileVisibilityStateAt(x, y, deps.state.tiles.get(key)) === "unexplored") continue;
        matrix.makeTranslation(
          toroidDelta(deps.sceneOrigin.camX, x, WORLD_WIDTH) + 0.5,
          tileCornerMeanY(deps.cornerYAt, x, y) + RISE_ABOVE_HEIGHTFIELD,
          toroidDelta(deps.sceneOrigin.camY, y, WORLD_HEIGHT) + 0.5
        );
        const mesh = tone === "reach" ? reach : marks;
        const index = tone === "reach" ? reachCount++ : markCount++;
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, color.set(REFINERY_HIGHLIGHT_COLORS[tone].fill));
      }
      finish(reach, reachCount);
      finish(marks, markCount);
      return reachCount + markCount;
    },
    dispose: () => {
      for (const mesh of [reach, marks]) { scene.remove(mesh); mesh.dispose(); (mesh.material as MeshBasicMaterial).dispose(); }
      geometry.dispose();
    }
  };
};
