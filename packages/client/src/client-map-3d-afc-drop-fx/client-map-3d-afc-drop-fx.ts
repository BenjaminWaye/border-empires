// True-3D "a whole AFC lands from orbit" sequence for the join-time drop
// (docs/manifest-afc-module-delivery-animation-plan.md, "Join drop"). Slow
// and deliberate on purpose: a real AFC model falls out of orbit wrapped in
// the module drop's white-hot-to-amber streak, lights a braking burn under
// the hull and settles to zero velocity, then lands in a flash, shockwave
// and a smoke bank that swallows the 3x3 footprint while the power-on glow
// pulses. All timing comes from client-afc-join-drop-timeline.ts, which the
// 2D companion shares.
//
// The descending model is a private single-instance createFabricationComplexOverlay
// parented to a child Scene whose Y is animated, so the shared AfcOverlayGroup
// (which rebuilds from tile state and has no per-instance identity) is never
// touched. The real AFC is hidden by the join-drop controller until touchdown
// and takes over from underneath the smoke; the descending copy lingers for
// AFC_JOIN_MODEL_OVERLAP_MS past touchdown to cover any rebuild throttling.
import {
  AdditiveBlending,
  CanvasTexture,
  SRGBColorSpace,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  RingGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  type Texture
} from "three";
import { createFabricationComplexOverlay, type FabricationComplexOverlay } from "../client-map-3d-fabrication-complex.js";
import { makeGlowTexture, makeStreakTexture } from "../client-map-3d-afc-module-delivery-fx.js";
import {
  AFC_JOIN_BRAKE_MS,
  AFC_JOIN_DESCENT_MS,
  AFC_JOIN_MODEL_OVERLAP_MS,
  AFC_JOIN_REENTRY_MS,
  AFC_JOIN_TOTAL_MS,
  afcJoinBrakeIntensity,
  afcJoinFallenFraction
} from "../client-afc-join-drop/client-afc-join-drop-timeline.js";

const DROP_HEIGHT = 6.5;
const STREAK_LENGTH = 4.5;
const STREAK_FADE_IN_MS = 500;
const FLASH_MS = 260;
const SHOCKWAVE_MS = 1600;
const SMOKE_MS = 2400;
const POWER_ON_START_MS = 1300;
const POWER_ON_MS = 1400;
const SMOKE_PUFF_COUNT = 30;
const SMOKE_SPREAD_RADIUS = 2.2;
const SMOKE_DRIFT_HEIGHT = 1.1;
const SMOKE_PEAK_OPACITY = 0.26;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

const setOpacity = (material: Mesh["material"] | Sprite["material"], opacity: number): void => {
  if (Array.isArray(material)) return;
  (material as MeshBasicMaterial | SpriteMaterial).opacity = clamp01(opacity);
};

/** Soft grey puff: opaque core fading to nothing, so overlapping puffs blend into a cloud instead of a stack of visible discs. */
const makeSmokeTexture = (): CanvasTexture | null => {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(176,160,142,0.95)");
  grad.addColorStop(0.5, "rgba(160,146,130,0.55)");
  grad.addColorStop(1, "rgba(150,138,124,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

type SmokePuff = { readonly mesh: Sprite; readonly delayMs: number; readonly riseHeight: number; readonly driftX: number; readonly driftZ: number };

type DropEntry = {
  readonly group: Group;
  readonly container: Scene;
  readonly model: FabricationComplexOverlay;
  modelAlive: boolean;
  readonly streak: Mesh;
  readonly streakCore: Mesh;
  readonly headGlow: Sprite;
  readonly burnCone: Mesh;
  readonly burnGlow: Sprite;
  readonly groundBlast: Mesh;
  readonly ring: Mesh;
  readonly flash: Sprite;
  readonly shockwave: Mesh;
  readonly smoke: SmokePuff[];
  readonly powerOnGlow: Sprite;
  readonly startedAt: number;
};

export type AfcDropFxLayer = {
  readonly group: Group;
  /** Starts a drop whose timeline began at `startedAtMs` (performance.now()); a late start plays the remainder and a finished one is ignored. */
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number, startedAtMs: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

export const createAfcDropFxLayer = (scene: Scene, buildingEnvironmentTexture?: Texture): AfcDropFxLayer => {
  const group = new Group();
  group.name = "afc-drop-fx";
  scene.add(group);

  const streakTexture = makeStreakTexture();
  const glowTexture = makeGlowTexture();
  const smokeTexture = makeSmokeTexture();
  const streakGeometry = new CylinderGeometry(0.85, 0.85, 1, 16, 1, true);
  const streakCoreGeometry = new CylinderGeometry(0.3, 0.3, 1, 12, 1, true);
  const burnGeometry = new CylinderGeometry(0.75, 0.1, 1.5, 18, 1, true);
  const ringGeometry = new RingGeometry(0.9, 1.05, 48);
  const blastGeometry = new PlaneGeometry(1, 1);
  const shockwaveGeometry = new RingGeometry(0.62, 0.7, 64);
  const entries: DropEntry[] = [];

  const glowMaterial = (color: string): SpriteMaterial =>
    new SpriteMaterial({ toneMapped: false, map: glowTexture, color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const additiveMaterial = (color: string, map?: CanvasTexture | null): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color, ...(map ? { map } : {}), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const smokeMaterial = (): SpriteMaterial =>
    new SpriteMaterial({ toneMapped: false, map: smokeTexture, color: "#ffffff", transparent: true, opacity: 0, blending: NormalBlending, depthWrite: false });
  const additiveGlowPlane = (color: string): MeshBasicMaterial => additiveMaterial(color, glowTexture);

  const spawnEntry = (sceneX: number, sceneZ: number, surfaceY: number, startedAtMs: number): void => {
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY, sceneZ);

    // A child Scene is a plain Object3D to the renderer; the overlay factory
    // only needs something to add its meshes to, and moving this container
    // moves the whole model.
    const container = new Scene();
    container.position.y = DROP_HEIGHT;
    entryGroup.add(container);
    const model = createFabricationComplexOverlay(container, 1, buildingEnvironmentTexture);
    model.addInstance(0, 0, 0, 0, 0);
    model.commit();

    const streak = new Mesh(streakGeometry, additiveMaterial("#ffb066", streakTexture));
    const streakCore = new Mesh(streakCoreGeometry, additiveMaterial("#ffb066", streakTexture));
    const headGlow = new Sprite(glowMaterial("#ffe0b0"));
    headGlow.scale.set(3.2, 3.2, 3.2);
    const burnCone = new Mesh(burnGeometry, additiveMaterial("#ff9a3d"));
    const burnGlow = new Sprite(glowMaterial("#ffc27a"));
    burnGlow.scale.set(3, 3, 3);
    const groundBlast = new Mesh(blastGeometry, additiveGlowPlane("#ffb266"));
    groundBlast.rotation.x = -Math.PI / 2;
    groundBlast.position.y = 0.006;
    const ring = new Mesh(ringGeometry, additiveMaterial("#ff9a3d"));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.007;
    const flash = new Sprite(glowMaterial("#ffe8c0"));
    flash.scale.set(5, 5, 5);
    flash.position.y = 0.4;
    const shockwave = new Mesh(shockwaveGeometry, additiveMaterial("#e0b070"));
    shockwave.rotation.x = -Math.PI / 2;
    shockwave.position.y = 0.005;
    const powerOnGlow = new Sprite(glowMaterial("#7fe8ff"));
    powerOnGlow.scale.set(3.4, 3.4, 3.4);
    powerOnGlow.position.y = 0.5;
    entryGroup.add(streak, streakCore, headGlow, burnCone, burnGlow, groundBlast, ring, flash, shockwave, powerOnGlow);

    const smoke: SmokePuff[] = [];
    for (let i = 0; i < SMOKE_PUFF_COUNT; i += 1) {
      const mesh = new Sprite(smokeMaterial());
      mesh.position.y = 0.05;
      entryGroup.add(mesh);
      const angle = (i / SMOKE_PUFF_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const radius = SMOKE_SPREAD_RADIUS * (0.3 + Math.random() * 0.7);
      smoke.push({ mesh, delayMs: i * 30 + Math.random() * 60, riseHeight: SMOKE_DRIFT_HEIGHT * (0.55 + Math.random() * 0.6), driftX: Math.cos(angle) * radius, driftZ: Math.sin(angle) * radius });
    }

    group.add(entryGroup);
    entries.push({ group: entryGroup, container, model, modelAlive: true, streak, streakCore, headGlow, burnCone, burnGlow, groundBlast, ring, flash, shockwave, smoke, powerOnGlow, startedAt: startedAtMs });
  };

  const disposeModel = (entry: DropEntry): void => {
    if (!entry.modelAlive) return;
    entry.modelAlive = false;
    entry.model.dispose();
    entry.group.remove(entry.container);
  };

  const disposeEntry = (entry: DropEntry): void => {
    disposeModel(entry);
    group.remove(entry.group);
    entry.group.traverse((child) => {
      const target = child as Mesh | Sprite;
      if (!("material" in target)) return;
      const material = target.material;
      if (Array.isArray(material)) for (const m of material) m.dispose();
      else material?.dispose();
    });
  };

  const updateFalling = (entry: DropEntry, age: number, nowMs: number): void => {
    const fallen = afcJoinFallenFraction(age);
    const baseY = DROP_HEIGHT * (1 - fallen);
    entry.container.position.y = baseY;
    entry.model.update(nowMs);
    entry.streak.position.y = baseY + STREAK_LENGTH / 2;
    entry.streak.scale.set(1, STREAK_LENGTH, 1);
    entry.streakCore.position.y = baseY + STREAK_LENGTH / 2;
    entry.streakCore.scale.set(1, STREAK_LENGTH, 1);
    entry.headGlow.position.y = baseY + 0.3;
    const streakA = clamp01(age / STREAK_FADE_IN_MS) * (1 - clamp01((age - AFC_JOIN_REENTRY_MS) / (AFC_JOIN_BRAKE_MS * 0.7)));
    setOpacity(entry.streak.material, 0.4 * streakA);
    setOpacity(entry.streakCore.material, 0.7 * streakA);
    setOpacity(entry.headGlow.material, 0.55 * streakA);
    const burn = afcJoinBrakeIntensity(age);
    const flicker = 0.9 + 0.1 * Math.sin(nowMs * 0.03);
    entry.burnCone.position.y = baseY - 0.75;
    entry.burnCone.scale.set(1, 0.6 + 0.6 * burn, 1);
    setOpacity(entry.burnCone.material, 0.5 * burn * flicker);
    entry.burnGlow.position.y = baseY - 0.1;
    setOpacity(entry.burnGlow.material, 0.7 * burn * flicker);
    // The thrusters scour the ground as the hull nears it.
    const blastScale = 2 + 3 * fallen;
    entry.groundBlast.scale.set(blastScale, blastScale, blastScale);
    setOpacity(entry.groundBlast.material, 0.28 * burn);
  };

  const hideFallingEffects = (entry: DropEntry): void => {
    setOpacity(entry.streak.material, 0);
    setOpacity(entry.streakCore.material, 0);
    setOpacity(entry.headGlow.material, 0);
    setOpacity(entry.burnCone.material, 0);
    setOpacity(entry.burnGlow.material, 0);
    setOpacity(entry.groundBlast.material, 0);
  };

  const updateTouchdown = (entry: DropEntry, landedAge: number): void => {
    setOpacity(entry.flash.material, landedAge < FLASH_MS ? 0.9 * (1 - landedAge / FLASH_MS) : 0);
    const ringT = clamp01(landedAge / (FLASH_MS * 3));
    const ringScale = 1 + easeOut(ringT) * 2.4;
    entry.ring.scale.set(ringScale, ringScale, ringScale);
    setOpacity(entry.ring.material, 0.7 * (1 - ringT));
    const shockT = clamp01(landedAge / SHOCKWAVE_MS);
    const shockScale = 1.5 + easeOut(shockT) * 5.5;
    entry.shockwave.scale.set(shockScale, shockScale, shockScale);
    setOpacity(entry.shockwave.material, 0.5 * (1 - shockT));

    for (const puff of entry.smoke) {
      const puffAge = landedAge - puff.delayMs;
      if (puffAge <= 0 || puffAge > SMOKE_MS) {
        setOpacity(puff.mesh.material, 0);
        continue;
      }
      const puffT = clamp01(puffAge / SMOKE_MS);
      const spreadT = easeOut(clamp01(puffAge / (SMOKE_MS * 0.4)));
      puff.mesh.position.set(spreadT * puff.driftX, 0.05 + spreadT * puff.riseHeight, spreadT * puff.driftZ);
      const scale = 1.4 + spreadT * 2.4;
      puff.mesh.scale.set(scale, scale, scale);
      setOpacity(puff.mesh.material, SMOKE_PEAK_OPACITY * clamp01(puffAge / 250) * (1 - puffT * puffT));
    }

    // Power-on: a cool cyan swell as the smoke thins (the aether core waking).
    const powerT = clamp01((landedAge - POWER_ON_START_MS) / POWER_ON_MS);
    setOpacity(entry.powerOnGlow.material, powerT <= 0 || powerT >= 1 ? 0 : 0.55 * Math.sin(powerT * Math.PI));
  };

  const hideTouchdownEffects = (entry: DropEntry): void => {
    setOpacity(entry.flash.material, 0);
    setOpacity(entry.ring.material, 0);
    setOpacity(entry.shockwave.material, 0);
    setOpacity(entry.powerOnGlow.material, 0);
    for (const puff of entry.smoke) setOpacity(puff.mesh.material, 0);
  };

  const update = (nowMs: number): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      const age = nowMs - entry.startedAt;
      if (age >= AFC_JOIN_TOTAL_MS + 50) {
        disposeEntry(entry);
        entries.splice(i, 1);
        continue;
      }
      const landedAge = age - AFC_JOIN_DESCENT_MS;
      if (entry.modelAlive && landedAge >= AFC_JOIN_MODEL_OVERLAP_MS) disposeModel(entry);
      if (entry.modelAlive) updateFalling(entry, age, nowMs);
      else hideFallingEffects(entry);
      if (landedAge < 0) hideTouchdownEffects(entry);
      else updateTouchdown(entry, landedAge);
    }
  };

  const clear = (): void => {
    while (entries.length > 0) disposeEntry(entries.pop()!);
  };

  const dispose = (): void => {
    clear();
    scene.remove(group);
    for (const geometry of [streakGeometry, streakCoreGeometry, burnGeometry, ringGeometry, blastGeometry, shockwaveGeometry]) geometry.dispose();
    streakTexture?.dispose();
    glowTexture?.dispose();
    smokeTexture?.dispose();
  };

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number, startedAtMs: number): void => {
    if (performance.now() - startedAtMs >= AFC_JOIN_TOTAL_MS) return;
    spawnEntry(sceneX, sceneZ, surfaceY, startedAtMs);
  };

  return { group, spawn, update, clear, dispose };
};
