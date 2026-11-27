import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, type Scene } from "three";
import { PLOT_AMBER, PLOT_DIAMOND, PLOT_IVORY, PLOT_VERTICES } from "../client-town-support-plot/plot-style.js";

export type TownSupportTileOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceHeights: Float32Array, highlighted: boolean) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

// One shallow, terrain-following mesh: four open ivory corners and a small
// brass diamond. No hatch, floor, shaft or upright sides remain.
export const createTownSupportTileOverlay = (scene: Scene, maxTiles: number): TownSupportTileOverlay => {
  const group = new Group();
  group.name = "town-support-tile-overlay";
  scene.add(group);
  const geometry = new BufferGeometry();
  const positions = new BufferAttribute(new Float32Array(maxTiles * PLOT_VERTICES.length * 3), 3);
  const colors = new BufferAttribute(new Float32Array(positions.array.length), 3);
  geometry.setAttribute("position", positions);
  geometry.setAttribute("color", colors);
  geometry.setDrawRange(0, 0);
  const material = new MeshBasicMaterial({ toneMapped: false,
    vertexColors: true, side: DoubleSide, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 28;
  mesh.name = "town-plot-corner-markers";
  group.add(mesh);
  const ivory = new Color(PLOT_IVORY), amber = new Color(PLOT_AMBER), brass = new Color(PLOT_DIAMOND);
  let count = 0;
  return {
    group,
    clear: () => { count = 0; },
    addInstance: (cx, cz, heights, highlighted) => {
      if (count >= maxTiles) return;
      const start = count * PLOT_VERTICES.length;
      for (let i = 0; i < PLOT_VERTICES.length; i += 1) {
        const [x, z] = PLOT_VERTICES[i]!;
        positions.setXYZ(start + i, cx + x, heights[i]!, cz + z);
        const color = highlighted ? amber : i >= PLOT_VERTICES.length - 6 ? brass : ivory;
        colors.setXYZ(start + i, color.r, color.g, color.b);
      }
      count += 1;
    },
    commit: () => {
      geometry.setDrawRange(0, count * PLOT_VERTICES.length);
      if (count === 0) return;
      for (const attr of [positions, colors]) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, count * PLOT_VERTICES.length * 3);
        attr.needsUpdate = true;
      }
    },
    dispose: () => {
      scene.remove(group);
      geometry.dispose();
      material.dispose();
    }
  };
};
