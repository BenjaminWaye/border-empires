import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  type Scene
} from "three";
import { SCOUT_DRONE_VISION_RADIUS } from "@border-empires/shared";
import { makeGlowTexture, makeShadowTexture, makeSweepTexture, makeVisionRingTexture } from "./client-map-3d-scout-drone-textures.js";

// What the scout drone puts on the ground (client-map-3d-scout-drone-overlay.ts): its vision
// footprint as an instrument ring (soft fill falling off to a crisp rim with tick marks), a radar
// sweep rotating inside it, a soft blob shadow that spreads and fades with altitude, and the
// route still ahead as a trail of glowing beads ending in a target ring. Everything is built once;
// the per-frame calls only move and tint what exists.

const CYAN = "#4fd8ff";
const VISION_RADIUS = SCOUT_DRONE_VISION_RADIUS + 0.5;
const GROUND_RISE = 0.04;
const ROUTE_RISE = 0.07;
const BEAD_SPACING = 0.45;
export const SCOUT_ROUTE_MAX_BEADS = 480;

export type ScoutGroundFx = {
  /** Places the footprint and shadow under the drone. `strength` fades the footprint in with lift. */
  readonly place: (sceneX: number, groundY: number, sceneZ: number, altitude: number, strength: number, sweepAngle: number, pulse: number) => void;
  /** Starts a new route; then add points in order with `routePoint`, and `endRoute`. */
  readonly beginRoute: () => void;
  readonly routePoint: (sceneX: number, groundY: number, sceneZ: number) => void;
  readonly endRoute: () => void;
  readonly setVisible: (visible: boolean) => void;
  readonly dispose: () => void;
};

export const createScoutGroundFx = (scene: Scene): ScoutGroundFx => {
  const visionTexture = makeVisionRingTexture();
  const sweepTexture = makeSweepTexture();
  const shadowTexture = makeShadowTexture();
  const glowTexture = makeGlowTexture();
  const additive = (opacity: number, map: typeof visionTexture): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color: CYAN, map, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
  const visionMaterial = additive(0.9, visionTexture);
  const sweepMaterial = additive(0.75, sweepTexture);
  const shadowMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#000000", map: shadowTexture, transparent: true, opacity: 0.5, depthWrite: false });
  const beadMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#bff4ff", map: glowTexture, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
  const targetMaterial = additive(0.85, null);

  const plane = new PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  // Without a canvas (tests) the textured planes would be solid squares; fall back to discs.
  const disc = new CircleGeometry(0.5, 48);
  disc.rotateX(-Math.PI / 2);
  const footprintGeometry = visionTexture ? plane : disc;
  const vision = new Mesh(footprintGeometry, visionMaterial);
  vision.scale.set(VISION_RADIUS * 2, 1, VISION_RADIUS * 2);
  const sweep = new Mesh(sweepTexture ? plane : disc, sweepMaterial);
  sweep.scale.set(VISION_RADIUS * 2, 1, VISION_RADIUS * 2);
  sweep.position.y = 0.003;
  const shadow = new Mesh(shadowTexture ? plane : disc, shadowMaterial);
  shadow.position.y = 0.006;
  const footprint = new Group();
  footprint.add(vision, sweep, shadow);

  const beadGeometry = new PlaneGeometry(0.2, 0.2);
  beadGeometry.rotateX(-Math.PI / 2);
  const beads = new InstancedMesh(beadGeometry, beadMaterial, SCOUT_ROUTE_MAX_BEADS);
  beads.frustumCulled = false;
  beads.count = 0;
  const targetGeometry = new RingGeometry(0.2, 0.3, 32);
  targetGeometry.rotateX(-Math.PI / 2);
  const target = new Mesh(targetGeometry, targetMaterial);

  const group = new Group();
  group.name = "scout-drone-ground-fx";
  group.add(footprint, beads, target);
  group.renderOrder = 24;
  scene.add(group);

  const matrix = new Matrix4();
  const tint = new Color(CYAN);
  let beadCount = 0;
  let carry = 0;
  let hasPrev = false;
  let prevX = 0;
  let prevY = 0;
  let prevZ = 0;

  const place: ScoutGroundFx["place"] = (sceneX, groundY, sceneZ, altitude, strength, sweepAngle, pulse) => {
    footprint.position.set(sceneX, groundY + GROUND_RISE, sceneZ);
    visionMaterial.opacity = strength * (0.75 + 0.2 * pulse);
    sweepMaterial.opacity = strength * 0.8;
    sweep.rotation.y = -sweepAngle;
    const height = Math.max(0, altitude - groundY);
    const spread = 0.55 + height * 0.35;
    shadow.scale.set(spread, 1, spread * 0.85);
    shadowMaterial.opacity = Math.max(0.12, 0.55 - height * 0.17);
    targetMaterial.color.copy(tint).multiplyScalar(0.7 + 0.3 * pulse);
  };

  const beginRoute = (): void => {
    beadCount = 0;
    carry = BEAD_SPACING * 0.9; // a gap under the drone itself
    hasPrev = false;
  };

  const routePoint: ScoutGroundFx["routePoint"] = (x, groundY, z) => {
    const y = groundY + ROUTE_RISE;
    if (hasPrev) {
      const length = Math.hypot(x - prevX, z - prevZ);
      let along = carry;
      for (; along <= length && beadCount < SCOUT_ROUTE_MAX_BEADS; along += BEAD_SPACING) {
        const t = length > 0 ? along / length : 0;
        matrix.makeTranslation(prevX + (x - prevX) * t, prevY + (y - prevY) * t, prevZ + (z - prevZ) * t);
        beads.setMatrixAt(beadCount, matrix);
        beadCount += 1;
      }
      carry = along - length;
    }
    hasPrev = true;
    prevX = x;
    prevY = y;
    prevZ = z;
  };

  const endRoute = (): void => {
    beads.count = beadCount;
    beads.instanceMatrix.needsUpdate = true;
    beads.visible = beadCount > 0;
    target.visible = hasPrev && beadCount > 0;
    target.position.set(prevX, prevY, prevZ);
  };

  return {
    place,
    beginRoute,
    routePoint,
    endRoute,
    setVisible: (visible) => {
      group.visible = visible;
    },
    dispose: () => {
      scene.remove(group);
      for (const g of [plane, disc, beadGeometry, targetGeometry]) g.dispose();
      for (const m of [visionMaterial, sweepMaterial, shadowMaterial, beadMaterial, targetMaterial]) m.dispose();
      for (const t of [visionTexture, sweepTexture, shadowTexture, glowTexture]) t?.dispose();
    }
  };
};
