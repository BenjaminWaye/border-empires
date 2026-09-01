// Raycast picking for planet meshes, mirroring the split used by
// client-map-3d-pointer-pick.ts: a thin Three.js-dependent wrapper around a
// pure "resolve the picked seasonId from intersected objects" function, so
// the resolution logic can be unit-tested without a WebGL context.
import { PerspectiveCamera, Raycaster, Vector2, type Intersection, type Object3D } from "three";

/**
 * Walks up from a raycast hit to find the nearest ancestor (or itself)
 * carrying a `seasonId` in userData — planet groups set this on both the
 * group and its body mesh (see createPlanetMesh), so a hit on the glow
 * shell or body both resolve correctly.
 */
export const resolvePickedSeasonId = (intersections: ReadonlyArray<Intersection>): string | null => {
  for (const hit of intersections) {
    let node: Object3D | null = hit.object;
    while (node) {
      const seasonId = node.userData?.seasonId;
      if (typeof seasonId === "string") return seasonId;
      node = node.parent;
    }
  }
  return null;
};

export type SpacePointerPick = {
  pickSeasonIdAt: (offsetX: number, offsetY: number, canvas: HTMLCanvasElement, pickables: Object3D[]) => string | null;
};

export const createSpacePointerPick = (camera: PerspectiveCamera): SpacePointerPick => {
  const raycaster = new Raycaster();
  const ndc = new Vector2();

  const pickSeasonIdAt = (offsetX: number, offsetY: number, canvas: HTMLCanvasElement, pickables: Object3D[]): string | null => {
    const width = Math.max(1, canvas.clientWidth || canvas.width);
    const height = Math.max(1, canvas.clientHeight || canvas.height);
    ndc.set((offsetX / width) * 2 - 1, -((offsetY / height) * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    const intersections = raycaster.intersectObjects(pickables, true);
    return resolvePickedSeasonId(intersections);
  };

  return { pickSeasonIdAt };
};
