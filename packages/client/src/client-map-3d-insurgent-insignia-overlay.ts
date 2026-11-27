import {
  CanvasTexture,
  DoubleSide,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3
} from "three";
import { insurgentMarkSprite } from "./client-insurgent-insignia.js";
import { RENDER_ORDER } from "./client-map-3d-render-order.js";

// True-3D side of the Insurgent frontier marker (client-insurgent-insignia.ts):
// the faint raised-fist mark laid flat on the ground of every Insurgent
// FRONTIER tile, one InstancedMesh of textured planes sharing the mark sprite
// as their texture. Static (no bob or spin) so a camp's twenty tiles of pickets read
// as marked ground, not as twenty alerts. Owned by the Planetary Defense
// patrol overlay, which shares its clear/commit/dispose lifecycle.
export const INSURGENT_INSIGNIA_TILE_FRACTION = 0.56;
// Lift above the hill-dome surface so the plane never z-fights the terrain.
const LIFT_Y = 0.012;
const FLAT_ROTATION = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

export type InsurgentInsigniaOverlay = {
  readonly mesh: InstancedMesh;
  readonly clear: () => void;
  readonly addInstance: (worldX: number, worldZ: number, flatOverlayY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const buildTexture = (): CanvasTexture | null => {
  // Node tests have no `document`: build the mesh without a texture.
  const sprite = insurgentMarkSprite();
  if (!sprite) return null;
  const texture = new CanvasTexture(sprite);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8; // seen at a slant on the ground
  return texture;
};

export const createInsurgentInsigniaOverlay = (scene: Scene, maxTiles: number): InsurgentInsigniaOverlay => {
  const texture = buildTexture();
  const geometry = new PlaneGeometry(INSURGENT_INSIGNIA_TILE_FRACTION, INSURGENT_INSIGNIA_TILE_FRACTION);
  const material = new MeshBasicMaterial({
    toneMapped: false,
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const mesh = new InstancedMesh(geometry, material, maxTiles);
  mesh.name = "insurgent-insignia-overlay";
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  mesh.renderOrder = RENDER_ORDER.insurgentInsignia;
  scene.add(mesh);

  const matrix = new Matrix4();
  const position = new Vector3();
  const unitScale = new Vector3(1, 1, 1);
  let count = 0;

  const clear = (): void => {
    count = 0;
  };

  const addInstance = (worldX: number, worldZ: number, flatOverlayY: number): void => {
    if (count >= maxTiles) return;
    position.set(worldX, flatOverlayY + LIFT_Y, worldZ);
    matrix.compose(position, FLAT_ROTATION, unitScale);
    mesh.setMatrixAt(count, matrix);
    count += 1;
  };

  const commit = (): void => {
    mesh.count = count;
    mesh.visible = count > 0;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    texture?.dispose();
  };

  return { mesh, clear, addInstance, commit, dispose };
};
