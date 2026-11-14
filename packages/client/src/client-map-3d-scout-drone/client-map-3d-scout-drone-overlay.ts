import {
  AdditiveBlending,
  CircleGeometry,
  ConeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Scene
} from "three";
import { SCOUT_DRONE_VISION_RADIUS, scoutDronePositionAt, scoutDroneStepIndexAt, type ScoutDroneFlight } from "@border-empires/shared";
import { createScoutDroneModel } from "./client-map-3d-scout-drone-model.js";

// The true-3D view of the player's scout drone (docs/explore-scout-plan.md): the drone itself
// cruising above the terrain along its flight, a cyan scan cone from its sensor lens to the
// ground, a soft cyan ring on the ground marking its vision footprint (radius
// SCOUT_DRONE_VISION_RADIUS), a ground shadow, and a dotted trail of glowing beads along the rest of its route
// (out to the turnaround tile, or home once it has turned). The 2D renderer draws the same
// pieces flat (client-map-render-2d-scout-drone.ts). Follows the clear/set/commit/dispose shape
// of client-map-3d-arrow-overlay.ts; client-map-3d/client-map-3d.ts calls
// syncScoutDroneOverlayFrame once per frame with toroid-wrapped scene positions.

export type ScoutDroneScenePoint = { sceneX: number; sceneZ: number; surfaceY: number };

export type ScoutDroneSceneFrame = {
  drone: ScoutDroneScenePoint;
  /** Unit direction of travel in scene X/Z. */
  dirX: number;
  dirZ: number;
  /** The route still ahead: the drone's own point first. */
  path: ScoutDroneScenePoint[];
};

export type ScoutDroneOverlay = {
  readonly set: (frame: ScoutDroneSceneFrame | undefined, nowMs: number) => void;
  readonly dispose: () => void;
};

/** Model scale: the courier drone is sized for a building site; the scout has to read at map zoom. */
export const SCOUT_DRONE_SCALE = 2.8;
export const SCOUT_DRONE_CRUISE_HEIGHT = 1.15;
const VISION_RING_RADIUS = SCOUT_DRONE_VISION_RADIUS + 0.5;
const GROUND_RISE = 0.05;
const PATH_RISE = 0.08;
const MAX_PATH_POINTS = 256;
const DOT_SPACING = 0.45;
const MAX_DOTS = 480;
const CYAN = "#4fd8ff";

export const createScoutDroneOverlay = (scene: Scene): ScoutDroneOverlay => {
  const model = createScoutDroneModel();
  model.root.scale.setScalar(SCOUT_DRONE_SCALE);

  const glow = (opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color: CYAN, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
  const ringMaterial = glow(0.55);
  const fillMaterial = glow(0.035);
  const coneMaterial = glow(0.03);
  const shadowMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#000000", transparent: true, opacity: 0.32, depthWrite: false });
  const ringGeometry = new RingGeometry(VISION_RING_RADIUS - 0.09, VISION_RING_RADIUS, 64);
  const fillGeometry = new CircleGeometry(VISION_RING_RADIUS, 64);
  const shadowGeometry = new CircleGeometry(0.42, 24);
  // An open cone, apex up at the sensor lens, base on the ground (its height is set per frame).
  const coneGeometry = new ConeGeometry(1, 1, 32, 1, true);
  coneGeometry.translate(0, -0.5, 0);

  const ground = new Group(); // laid flat on the terrain under the drone
  const ring = new Mesh(ringGeometry, ringMaterial);
  const fill = new Mesh(fillGeometry, fillMaterial);
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  for (const disc of [fill, ring, shadow]) {
    disc.rotation.x = -Math.PI / 2;
    ground.add(disc);
  }
  shadow.position.y = 0.004;
  const cone = new Mesh(coneGeometry, coneMaterial);

  // The route ahead as evenly spaced glowing beads: a 1px WebGL line vanishes against the vision disc.
  const dotGeometry = new CircleGeometry(0.075, 12);
  dotGeometry.rotateX(-Math.PI / 2);
  const pathMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#bff4ff", transparent: true, opacity: 0.9, depthWrite: false });
  const path = new InstancedMesh(dotGeometry, pathMaterial, MAX_DOTS);
  path.frustumCulled = false;
  const dotMatrix = new Matrix4();
  const endMarker = new Mesh(new RingGeometry(0.22, 0.32, 24), glow(0.8));
  endMarker.rotation.x = -Math.PI / 2;

  const group = new Group();
  group.name = "scout-drone-overlay";
  group.add(ground, cone, path, endMarker, model.root);
  group.renderOrder = 24;
  group.visible = false;
  scene.add(group);

  let yaw: number | undefined;
  let groundY: number | undefined;
  let lastMs: number | undefined;

  const set = (frame: ScoutDroneSceneFrame | undefined, nowMs: number): void => {
    if (!frame) {
      group.visible = false;
      yaw = undefined;
      groundY = undefined;
      return;
    }
    const dt = lastMs === undefined ? 16 : Math.min(100, Math.max(0, nowMs - lastMs));
    lastMs = nowMs;
    const { drone } = frame;
    // Ease the cruise altitude over terrain steps, and swing round smoothly at the turnaround.
    groundY = groundY === undefined ? drone.surfaceY : groundY + (drone.surfaceY - groundY) * Math.min(1, dt / 400);
    const targetYaw = Math.atan2(frame.dirX, frame.dirZ);
    if (yaw === undefined) yaw = targetYaw;
    else {
      const delta = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
      yaw += delta * Math.min(1, dt / 350);
    }
    const bob = 0.04 * Math.sin(nowMs * 0.0021);
    const altitude = groundY + SCOUT_DRONE_CRUISE_HEIGHT + bob;
    model.root.position.set(drone.sceneX, altitude, drone.sceneZ);
    model.root.rotation.set(0.12, yaw, 0.03 * Math.sin(nowMs * 0.0013), "YXZ"); // nose tipped down: flying forward
    model.rotors.forEach((rotor, k) => {
      rotor.rotation.y = (k % 2 === 0 ? 1 : -1) * nowMs * 0.047 + k;
    });
    model.tailLight.visible = nowMs % 720 < 130;
    const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.004);
    model.sensorGlow.color.set(CYAN).multiplyScalar(0.75 + 0.25 * pulse);

    ground.position.set(drone.sceneX, drone.surfaceY + GROUND_RISE, drone.sceneZ);
    ringMaterial.opacity = 0.4 + 0.25 * pulse;
    // The scan cone: from the lens down to the vision ring.
    const lensY = altitude - 0.07 * SCOUT_DRONE_SCALE;
    const coneHeight = Math.max(0.1, lensY - (drone.surfaceY + GROUND_RISE));
    cone.position.set(drone.sceneX, lensY, drone.sceneZ);
    cone.scale.set(VISION_RING_RADIUS * 0.92, coneHeight, VISION_RING_RADIUS * 0.92);
    coneMaterial.opacity = 0.07 + 0.05 * pulse;

    const points = frame.path.slice(0, MAX_PATH_POINTS);
    let dots = 0;
    let carry = DOT_SPACING * 0.6; // leave a gap under the drone itself
    for (let i = 1; i < points.length && dots < MAX_DOTS; i += 1) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const length = Math.hypot(b.sceneX - a.sceneX, b.sceneZ - a.sceneZ);
      let along = carry;
      for (; along <= length && dots < MAX_DOTS; along += DOT_SPACING) {
        const t = length > 0 ? along / length : 0;
        dotMatrix.makeTranslation(a.sceneX + (b.sceneX - a.sceneX) * t, a.surfaceY + (b.surfaceY - a.surfaceY) * t + PATH_RISE, a.sceneZ + (b.sceneZ - a.sceneZ) * t);
        path.setMatrixAt(dots, dotMatrix);
        dots += 1;
      }
      carry = along - length;
    }
    path.count = dots;
    path.instanceMatrix.needsUpdate = true;
    path.visible = dots > 0;
    const end = points[points.length - 1];
    endMarker.visible = Boolean(end) && points.length >= 2;
    if (end) endMarker.position.set(end.sceneX, end.surfaceY + PATH_RISE, end.sceneZ);
    group.visible = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    model.dispose();
    for (const g of [ringGeometry, fillGeometry, shadowGeometry, coneGeometry, dotGeometry, endMarker.geometry]) g.dispose();
    for (const m of [ringMaterial, fillMaterial, coneMaterial, shadowMaterial, pathMaterial, endMarker.material as MeshBasicMaterial]) m.dispose();
  };

  return { set, dispose };
};

/**
 * Per-frame sync, so client-map-3d/client-map-3d.ts (well over the line cap) needs one call:
 * places the drone from the flight at `nowMs` (local clock), or hides it once it has landed.
 * `sceneFor` maps a (possibly fractional) world tile position to toroid-wrapped scene space.
 */
export const syncScoutDroneOverlayFrame = (
  overlay: ScoutDroneOverlay,
  flight: ScoutDroneFlight | undefined,
  nowMs: number,
  world: { width: number; height: number },
  sceneFor: (x: number, y: number) => ScoutDroneScenePoint
): void => {
  const at = flight ? scoutDronePositionAt(flight, nowMs, world.width, world.height) : undefined;
  if (!flight || !at) {
    overlay.set(undefined, nowMs);
    return;
  }
  const drone = sceneFor(at.x, at.y);
  const index = Math.max(0, scoutDroneStepIndexAt(flight, nowMs));
  // The rest of the route: to the turnaround while outbound, home after it.
  const lastIndex = at.returning ? flight.steps.length - 1 : flight.turnIndex;
  const path: ScoutDroneScenePoint[] = [drone];
  for (let i = index + 1; i <= lastIndex; i += 1) {
    const step = flight.steps[i]!;
    const point = sceneFor(step.x, step.y);
    const prev = path[path.length - 1]!;
    // Keep the line continuous across the map's wrap seam: pick the copy nearest the previous point.
    point.sceneX = prev.sceneX + wrapNear(point.sceneX - prev.sceneX, world.width);
    point.sceneZ = prev.sceneZ + wrapNear(point.sceneZ - prev.sceneZ, world.height);
    path.push(point);
  }
  overlay.set({ drone, dirX: Math.cos(at.heading), dirZ: Math.sin(at.heading), path }, nowMs);
};

const wrapNear = (delta: number, size: number): number => {
  if (delta > size / 2) return delta - size;
  if (delta < -size / 2) return delta + size;
  return delta;
};
