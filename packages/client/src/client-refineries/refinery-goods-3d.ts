// True-3D moving goods on refinery supply lines (2D parity:
// refinery-canvas-2d.ts). One instanced mesh of small crates riding just above
// the district pipe (district-links-3d.ts), placed every frame from the pure
// refineryGoodsPositions, so both renderers agree on where each load is.
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, type Scene, type Texture } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import { DISTRICT_BASE_LIFT, DISTRICT_PORT_Y } from "../client-town-district/district-catalog.js";
import { districtWrapX as wrapX, districtWrapY as wrapY } from "../client-town-district/district-coordinates.js";
import type { DistrictPoint } from "../client-town-district/district-network.js";
import { MAX_LOADS_PER_LINE, REFINERY_GOODS_COLORS, refineryGoodsPositions } from "./refinery-goods.js";
import type { RefinerySupplyPath } from "./refinery-scene.js";

export type RefineryGoods3DDeps = {
  readonly origin: { camX: number; camY: number };
  /** Ground height under a world point (the district map's own surface, so loads sit on the pipe). */
  readonly surfaceAt: (point: DistrictPoint) => number;
};

export type RefineryGoods3D = {
  readonly setPaths: (paths: readonly RefinerySupplyPath[]) => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
  readonly diagnostics: { loads: number; lines: number };
};

// A crate sits on the pipe's top rail (pipe radius 0.014 at DISTRICT_PORT_Y).
const CRATE_LIFT = 0.032;

export const createRefineryGoods3D = (scene: Scene, maxLines: number, deps: RefineryGoods3DDeps, envMap?: Texture): RefineryGoods3D => {
  const capacity = Math.max(1, maxLines * MAX_LOADS_PER_LINE);
  const geometry = new BoxGeometry(0.055, 0.04, 0.055);
  const material = new MeshStandardMaterial({ color: "#ffffff", metalness: 0.35, roughness: 0.55 });
  applyBuildingEnvMap(material, envMap);
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = "refinery-goods";
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  const matrix = new Matrix4(), color = new Color();
  let paths: readonly RefinerySupplyPath[] = [];
  const diagnostics = { loads: 0, lines: 0 };
  const update = (nowMs: number): void => {
    let index = 0;
    for (const path of paths) {
      color.set(REFINERY_GOODS_COLORS[path.resource]);
      for (const point of refineryGoodsPositions(path, nowMs)) {
        if (index >= capacity) break;
        const wrapped = { x: wrapX(point.x), y: wrapY(point.y) };
        matrix.makeTranslation(
          toroidDelta(deps.origin.camX, wrapped.x, WORLD_WIDTH),
          deps.surfaceAt(wrapped) + DISTRICT_BASE_LIFT + DISTRICT_PORT_Y + CRATE_LIFT,
          toroidDelta(deps.origin.camY, wrapped.y, WORLD_HEIGHT)
        );
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, color);
        index += 1;
      }
    }
    mesh.count = index;
    diagnostics.loads = index;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  return {
    diagnostics,
    setPaths: (next) => { paths = next.filter((path) => path.working).slice(0, maxLines); diagnostics.lines = paths.length; },
    update,
    dispose: () => { scene.remove(mesh); mesh.dispose(); geometry.dispose(); material.dispose(); paths = []; }
  };
};
