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

/**
 * OrbitControls shares the same canvas as click-picking: a drag-to-orbit
 * gesture still fires a native "click" on mouseup (browsers don't suppress
 * it just because the pointer moved), which would otherwise misfire
 * onEnterSeason mid-orbit. Pure so it's unit-testable without a WebGL
 * context — the scene assembler just feeds it real pointer coordinates.
 */
export const wasDragGesture = (
  down: { x: number; y: number },
  up: { x: number; y: number },
  thresholdPx = 6
): boolean => Math.hypot(up.x - down.x, up.y - down.y) > thresholdPx;

/**
 * Pairs a canvas's pointerdown/pointerup events into a single "was this a
 * genuine stationary click of the primary button" decision, so the scene
 * assembler doesn't have to hold that state itself. Deliberately built on
 * pointerdown/pointerup rather than the native "click" event: a pointerdown
 * that never produces a click at all (right-click, a drag whose pointerup
 * lands off-canvas, a cancelled multi-touch gesture) would otherwise leave
 * stale down-position state around to corrupt the *next*, unrelated click's
 * drag check. Restricting both ends to the primary button (0) means a
 * secondary-button press never sets state a later primary-button release
 * could pick up.
 */
export const createClickTracker = () => {
  let downAt: { x: number; y: number } | undefined;
  return {
    onPointerDown: (button: number, x: number, y: number): void => {
      downAt = button === 0 ? { x, y } : undefined;
    },
    onPointerUp: (button: number, x: number, y: number): boolean => {
      const down = downAt;
      downAt = undefined;
      if (!down || button !== 0) return false;
      return !wasDragGesture(down, { x, y });
    }
  };
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
