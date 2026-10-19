import { BufferAttribute, BufferGeometry, DoubleSide, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, type Scene } from "three";
import { createBendingMarkerGeometry } from "../client-map-3d-bending-marker-geometry/client-map-3d-bending-marker-geometry.js";
import { GARRISON_MANY_LIMIT, type GarrisonManyState } from "./client-garrison-many-model.js";
import { syncTileHighlightMarker, type TileHighlightDeps } from "./client-tile-highlight-3d.js";

export type GarrisonSelection3D = {
  sync: (selection: GarrisonManyState, deps: TileHighlightDeps) => void;
  dispose: () => void;
};

export const createGarrisonSelection3D = (scene: Scene): GarrisonSelection3D => {
  const markers = Array.from({ length: GARRISON_MANY_LIMIT }, () => {
    const border = new LineSegments(createBendingMarkerGeometry(), new LineBasicMaterial({ toneMapped: false, color: "#ffd166", depthTest: false, depthWrite: false, transparent: true, opacity: 1 }));
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const fill = new Mesh(geometry, new MeshBasicMaterial({ toneMapped: false, color: "#ffd166", depthTest: false, depthWrite: false, transparent: true, opacity: .28, side: DoubleSide }));
    border.renderOrder = 32;
    fill.renderOrder = 31;
    border.frustumCulled = fill.frustumCulled = false;
    border.visible = fill.visible = false;
    scene.add(border, fill);
    return { border, fill };
  });
  const sync = (selection: GarrisonManyState, deps: TileHighlightDeps): void => {
    markers.forEach(({ border, fill }, index) => {
      const key = selection.active ? selection.keys[index] : undefined;
      if (!key) { border.visible = fill.visible = false; return; }
      const [x, y] = key.split(",").map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { border.visible = fill.visible = false; return; }
      syncTileHighlightMarker(deps, border, { x: x!, y: y! }, .02);
      const color = selection.invalidKeys.includes(key) ? "#ff8a3d" : "#ffd166";
      border.material.color.set(color);
      fill.material.color.set(color);
      // Reuse the outline's terrain-conforming corners for the fill triangles.
      const source = border.geometry.getAttribute("position");
      const target = fill.geometry.getAttribute("position");
      [0, 1, 3, 5].forEach((sourceIndex, corner) => target.setXYZ(corner, source.getX(sourceIndex), source.getY(sourceIndex), source.getZ(sourceIndex)));
      target.needsUpdate = true;
      fill.visible = true;
    });
  };
  const dispose = (): void => {
    for (const { border, fill } of markers) {
      scene.remove(border, fill);
      border.geometry.dispose(); border.material.dispose();
      fill.geometry.dispose(); fill.material.dispose();
    }
  };
  return { sync, dispose };
};
