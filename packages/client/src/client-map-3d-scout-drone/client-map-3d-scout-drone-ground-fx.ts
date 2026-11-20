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
import { SCOUT_DRONE_VISION_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { SCOUT_SHADOW_HALF_EXTENT, makeGlowTexture, makeSilhouetteShadowTexture, makeSweepTexture, makeVisionRingTexture } from "./client-map-3d-scout-drone-textures.js";

// What the scout drone puts on the ground (client-map-3d-scout-drone-overlay.ts): its vision
// footprint as an instrument ring (soft fill falling off to a crisp rim with tick marks), a radar
// sweep rotating inside it, a contact shadow in the drone's own X silhouette (turned with its
// heading; a crisp and a soft copy cross-fade so it blurs, spreads and fades with altitude), and the
// route still ahead as a trail of glowing beads ending in a target ring, and the rotor wash -- faint
// expanding ripples on the ground under each prop while the drone is low. Everything is built
// once; the per-frame calls only move and tint what exists.

const CYAN = "#4fd8ff";
const VISION_RADIUS = SCOUT_DRONE_VISION_RADIUS + 0.5;
const GROUND_RISE = 0.04;
const ROUTE_RISE = 0.07;
export const SCOUT_ROUTE_BEAD_SPACING = 0.45;
const BEAD_SPACING = SCOUT_ROUTE_BEAD_SPACING;
/**
 * Enough beads for the longest route a drone can fly. The drone has no range limit, and its line
 * takes the short way round the wrapping map, so one leg is at most half the map across on each
 * axis (with 10% slack for the stepped line). Sized from the map so 3D draws the whole route, as
 * 2D does.
 */
export const SCOUT_ROUTE_MAX_BEADS = Math.ceil((Math.hypot(WORLD_WIDTH / 2, WORLD_HEIGHT / 2) * 1.1) / BEAD_SPACING) + 2;
const WASH_RIPPLES_PER_ROTOR = 2;
const WASH_MAX = 4 * WASH_RIPPLES_PER_ROTOR;

export type ScoutGroundFx = {
  /** Places the footprint and shadow under the drone (heading `yaw`). `strength` fades the footprint in with lift. */
  readonly place: (sceneX: number, groundY: number, sceneZ: number, altitude: number, yaw: number, strength: number, sweepAngle: number, pulse: number) => void;
  /** Starts a new route; then add points in order with `routePoint`, and `endRoute`. */
  readonly beginRoute: () => void;
  readonly routePoint: (sceneX: number, groundY: number, sceneZ: number) => void;
  readonly endRoute: () => void;
  /** Starts this frame's rotor wash at `strength` (0 hides it); then add each prop's ground point and `endWash`. */
  readonly beginWash: (strength: number, nowMs: number) => void;
  readonly washPoint: (sceneX: number, groundY: number, sceneZ: number) => void;
  readonly endWash: () => void;
  readonly setVisible: (visible: boolean) => void;
  readonly dispose: () => void;
};

/** `droneScale`: the drone model's scale in the scene, which sizes its silhouette shadow. */
export const createScoutGroundFx = (scene: Scene, droneScale: number): ScoutGroundFx => {
  const visionTexture = makeVisionRingTexture();
  const sweepTexture = makeSweepTexture();
  const shadowSharpTexture = makeSilhouetteShadowTexture(0.012);
  const shadowSoftTexture = makeSilhouetteShadowTexture(0.06);
  const glowTexture = makeGlowTexture();
  const additive = (opacity: number, map: typeof visionTexture): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color: CYAN, map, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
  const visionMaterial = additive(0.9, visionTexture);
  const sweepMaterial = additive(0.75, sweepTexture);
  const shadowSharpMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#000000", map: shadowSharpTexture, transparent: true, opacity: 0.5, depthWrite: false });
  const shadowSoftMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#000000", map: shadowSoftTexture, transparent: true, opacity: 0, depthWrite: false });
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
  // The silhouette shadow: crisp near the ground, soft and spread out at altitude.
  const shadow = new Group();
  shadow.name = "scout-drone-shadow";
  shadow.position.y = 0.006;
  const shadowSharp = new Mesh(shadowSharpTexture ? plane : disc, shadowSharpMaterial);
  const shadowSoft = new Mesh(shadowSoftTexture ? plane : disc, shadowSoftMaterial);
  shadowSoft.position.y = 0.001;
  shadow.add(shadowSharp, shadowSoft);
  const shadowSpan = 2 * SCOUT_SHADOW_HALF_EXTENT * droneScale;
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

  const washGeometry = new RingGeometry(0.4, 0.5, 32);
  washGeometry.rotateX(-Math.PI / 2);
  const washMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", transparent: true, blending: AdditiveBlending, depthWrite: false });
  const washRings = new InstancedMesh(washGeometry, washMaterial, WASH_MAX);
  washRings.frustumCulled = false;
  // Create the per-instance colour buffer now: three.js would otherwise allocate it, and
  // recompile the material, on the first setColorAt -- mid-launch on a phone.
  washRings.setColorAt(0, new Color(0, 0, 0));
  washRings.count = 0;

  const group = new Group();
  group.name = "scout-drone-ground-fx";
  group.add(footprint, beads, target, washRings);
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

  const place: ScoutGroundFx["place"] = (sceneX, groundY, sceneZ, altitude, yaw, strength, sweepAngle, pulse) => {
    footprint.position.set(sceneX, groundY + GROUND_RISE, sceneZ);
    visionMaterial.opacity = strength * (0.75 + 0.2 * pulse);
    sweepMaterial.opacity = strength * 0.8;
    sweep.rotation.y = -sweepAngle;
    // Softer, larger and fainter as it climbs from the crown (strength 0) to cruise (1), plus a
    // little more over low ground far below.
    const height = Math.max(0, altitude - groundY);
    const climb = Math.min(1, strength + Math.max(0, height - 2.2) * 0.3);
    const spread = shadowSpan * (1 + 0.45 * climb);
    shadow.scale.set(spread, 1, spread);
    shadow.rotation.y = yaw;
    const soft = climb;
    const darkness = 0.55 - 0.3 * climb;
    shadowSharpMaterial.opacity = darkness * (1 - soft);
    shadowSoftMaterial.opacity = darkness * soft;
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

  const washTint = new Color("#c9d2c4"); // dust-and-grass grey-green
  const washColor = new Color();
  let washStrength = 0;
  let washNow = 0;
  let washCount = 0;
  const beginWash: ScoutGroundFx["beginWash"] = (strength, nowMs) => {
    washStrength = strength;
    washNow = nowMs;
    washCount = 0;
  };
  const washPoint: ScoutGroundFx["washPoint"] = (x, groundY, z) => {
    for (let i = 0; i < WASH_RIPPLES_PER_ROTOR && washCount < WASH_MAX; i += 1) {
      const phase = (washNow * 0.0011 + i / WASH_RIPPLES_PER_ROTOR + washCount * 0.13) % 1;
      const size = 0.35 + 0.75 * phase;
      matrix.makeScale(size, 1, size).setPosition(x, groundY + GROUND_RISE + 0.002, z);
      washRings.setMatrixAt(washCount, matrix);
      washRings.setColorAt(washCount, washColor.copy(washTint).multiplyScalar(0.22 * washStrength * (1 - phase) * (1 - phase)));
      washCount += 1;
    }
  };
  const endWash = (): void => {
    washRings.count = washStrength > 0.01 ? washCount : 0;
    washRings.instanceMatrix.needsUpdate = true;
    if (washRings.instanceColor) washRings.instanceColor.needsUpdate = true;
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
    beginWash,
    washPoint,
    endWash,
    setVisible: (visible) => {
      group.visible = visible;
    },
    dispose: () => {
      scene.remove(group);
      // InstancedMesh.dispose() releases the instance buffers the renderer holds for each mesh.
      beads.dispose();
      washRings.dispose();
      for (const g of [plane, disc, beadGeometry, targetGeometry, washGeometry]) g.dispose();
      for (const m of [visionMaterial, sweepMaterial, shadowSharpMaterial, shadowSoftMaterial, beadMaterial, targetMaterial, washMaterial]) m.dispose();
      for (const t of [visionTexture, sweepTexture, shadowSharpTexture, shadowSoftTexture, glowTexture]) t?.dispose();
    }
  };
};
