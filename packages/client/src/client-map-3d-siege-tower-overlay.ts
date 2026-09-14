// 3D Siege Tower overlay — the upgraded SIEGE_TOWER and DREAD_TOWER variants
// render as a tall, futuristic-steampunk siege engine instead of the low
// watchtower+catapult used for base siege outposts (that stays on the fort
// overlay). Each instance is a heavy black-iron lattice tower carrying one
// enormous glowing aether lens in a yoke of aged-brass gimbal rings, firing a
// cyan-violet additive lance down at the battlefield.
//
// Every frame update(nowMs, latestBattleTarget) aims the lens assembly (outer
// cradle ring facing the azimuth + inner cradle ring tilted by the beam pitch
// + barrel/lens/beam) at the most recently started ongoing battle. The aim
// mode (siegeTowerRotationMode) decides whether only that lens assembly swings
// or the whole tower wheels around to face the battle.
//
// The write path follows the aether-tower overlay: matrices are appended per
// addInstance (recording each piece's base slot index in `bases`), commit()
// publishes counts, and update() rewrites the touched slices of the per-piece
// buffers through those recorded bases.

import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  SphereGeometry,
  Texture,
  TorusGeometry,
  Vector3
} from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { SIEGE_TOWER_PALETTES, type SiegeTowerPalette, type SiegeTowerVariant } from "./client-map-3d-siege-tower-palette.js";
import { PIECE_SPECS_BY_VARIANT, SHAPES, type TowerShape } from "./client-map-3d-siege-tower-pieces.js";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import type { SiegeTowerRotationMode } from "./client-siege-tower-rotation-mode.js";

export type SiegeTowerBattleTarget = { readonly x: number; readonly y: number };

export type SiegeTowerOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number, variant: SiegeTowerVariant) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number, latestBattleTarget?: SiegeTowerBattleTarget) => void;
  /** Whether any real siege tower is currently on the map — callers (e.g.
   * the pop-up-marine battle overlay's "kill shot" attribution) use this to
   * gate tower-caused effects so nothing fires when there is no tower to
   * have caused them. */
  readonly hasInstances: () => boolean;
  readonly dispose: () => void;
};

const BEAM_MAX_RANGE_TILES = 4.5;
const BARREL_BACK = 0.12;

const PLATFORM_Y = 1.72;
const BRACE_LOW_Y = 0.55;
const BRACE_HIGH_Y = 1.25;

const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);

type Slot = { mesh: InstancedMesh; count: number; cap: number };

export const createSiegeTowerOverlay = (
  scene: Scene,
  maxTiles: number,
  rotationMode: () => SiegeTowerRotationMode,
  buildingEnvironmentTexture?: Texture
): SiegeTowerOverlay => {
  const CAP = Math.min(64, Math.max(1, Math.floor(maxTiles)));

  // ─── Materials ──────────────────────────────────────────────────────
  const materials: Material[] = [];
  type PaletteMats = {
    iron: MeshStandardMaterial;
    ironDark: MeshStandardMaterial;
    brass: MeshStandardMaterial;
    brassBright: MeshStandardMaterial;
    brassDark: MeshStandardMaterial;
    lens: MeshStandardMaterial;
    halo: MeshBasicMaterial;
    sky: MeshBasicMaterial;
    beam: MeshBasicMaterial;
    beamCore: MeshBasicMaterial;
  };
  const makePaletteMats = (pal: SiegeTowerPalette): PaletteMats => {
    const iron = new MeshStandardMaterial({ color: pal.iron, roughness: 0.5, metalness: 0.7, flatShading: true });
    const ironDark = new MeshStandardMaterial({ color: pal.ironDark, roughness: 0.55, metalness: 0.65, flatShading: true });
    const brass = new MeshStandardMaterial({ color: pal.brass, roughness: 0.4, metalness: 0.85, flatShading: true });
    const brassBright = new MeshStandardMaterial({ color: pal.brassBright, roughness: 0.32, metalness: 0.9, flatShading: true });
    const brassDark = new MeshStandardMaterial({ color: pal.brassDark, roughness: 0.5, metalness: 0.8, flatShading: true });
    const lens = new MeshStandardMaterial({ color: pal.lensEmissive, emissive: pal.lensEmissive, emissiveIntensity: 1.35, roughness: 0.25, metalness: 0.15, flatShading: true });
    const halo = new MeshBasicMaterial({ toneMapped: false, color: pal.halo, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false });
    const sky = new MeshBasicMaterial({ toneMapped: false, color: pal.beamViolet, transparent: true, opacity: 0.1, blending: AdditiveBlending, depthWrite: false });
    const beam = new MeshBasicMaterial({ toneMapped: false, color: pal.beamViolet, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    const beamCore = new MeshBasicMaterial({ toneMapped: false, color: pal.beamCyan, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    for (const m of [iron, ironDark, brass, brassBright, brassDark, lens]) applyBuildingEnvMap(m, buildingEnvironmentTexture);
    const mats: PaletteMats = { iron, ironDark, brass, brassBright, brassDark, lens, halo, sky, beam, beamCore };
    materials.push(iron, ironDark, brass, brassBright, brassDark, lens, halo, sky, beam, beamCore);
    return mats;
  };

  const matsOf: Record<SiegeTowerVariant, PaletteMats> = {
    SIEGE_TOWER: makePaletteMats(SIEGE_TOWER_PALETTES.SIEGE_TOWER),
    DREAD_TOWER: makePaletteMats(SIEGE_TOWER_PALETTES.DREAD_TOWER)
  };
  const matFor = (variant: SiegeTowerVariant, key: string): Material => {
    const mats = matsOf[variant];
    switch (key) {
      case "base": return mats.iron;
      case "pylon": return mats.iron;
      case "core": return mats.lens;
      case "leg":
      case "brace":
      case "platform": return mats.ironDark;
      case "ringOuter":
      case "ringA":
      case "ringC": return mats.brass;
      case "ringInner":
      case "barrel":
      case "ringB":
      case "ringD": return mats.brassBright;
      case "rim": return mats.brassDark;
      case "lens": return mats.lens;
      case "halo":
      case "coreHalo": return mats.halo;
      case "sky": return mats.sky;
      case "beam": return mats.beam;
      case "beamCore": return mats.beamCore;
      default: return mats.iron;
    }
  };

  // ─── Geometries (unit-sized, scaled per variant in the matrix) ──────
  const geometries: BufferGeometry[] = [];
  const geo = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const unitBox = geo(new BoxGeometry(1, 1, 1));
  const sharedGeo: Record<string, BufferGeometry> = {
    base: geo(new CylinderGeometry(1, 1, 0.06, 8)),
    box: unitBox,
    leg: unitBox,
    brace: unitBox,
    platform: unitBox,
    column: geo(new CylinderGeometry(0.85, 1, 1, 8)),
    ringOuter: geo(new TorusGeometry(1, 0.05, 6, 24)),
    ringInner: geo(new TorusGeometry(1, 0.045, 6, 20)),
    barrel: geo(new CylinderGeometry(1, 1, 1, 12)),
    lens: geo(new IcosahedronGeometry(1, 1)),
    rim: geo(new TorusGeometry(1, 0.06, 6, 24)),
    halo: geo(new SphereGeometry(1, 12, 9)),
    ring: geo(new TorusGeometry(1, 0.06, 6, 28)),
    sky: geo(new CylinderGeometry(1, 1, 1, 8, 1, true)),
    beam: geo(new CylinderGeometry(1, 1, 1, 6, 1, true))
  };

  // ─── InstancedMesh registry ─────────────────────────────────────────
const slots = new Map<string, Slot>();
  for (const variant of ["SIEGE_TOWER", "DREAD_TOWER"] as const) {
    for (const spec of PIECE_SPECS_BY_VARIANT[variant]) {
      const slotKey = `${variant}:${spec.key}`;
      const mesh = new InstancedMesh(sharedGeo[spec.geo]!, matFor(variant, spec.key), CAP * spec.mult);
      mesh.name = slotKey;
      mesh.frustumCulled = false;
      // Opaque tower/cradle/lens pieces cast AND receive a real sun shadow
      // (same convention as client-map-3d-town-overlay.ts etc. -- the shared
      // structure builder covers everything else). The additive glow lances
      // (spec.glow: halo/beam/beamCore/sky) are unlit decals like the
      // watchtower's alert ring and must not shadow-cast or receive.
      mesh.castShadow = !spec.glow;
      mesh.receiveShadow = !spec.glow;
      mesh.count = 0;
      scene.add(mesh);
      slots.set(slotKey, { mesh, count: 0, cap: CAP * spec.mult });
    }
  }

  // ─── Matrix math scaffolding ────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const qYaw = new Quaternion();
  const qLocal = new Quaternion();
  const qBeam = new Quaternion();
  const qRingBase = new Quaternion();
  const qTilt = new Quaternion();
  const qCombined = new Quaternion();
  const qRim = new Quaternion();
  const qSpin = new Quaternion();
  const qIdentity = new Quaternion();
  const ringAxis = new Vector3();
  const dir = new Vector3();

  type SiegeTowerInstance = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly wx: number;
    readonly wy: number;
    readonly variant: SiegeTowerVariant;
    readonly shape: TowerShape;
    readonly phase: number;
    readonly bases: Record<string, number>;
    yaw: number;
  };

  const instances: SiegeTowerInstance[] = [];
  const slotKeyOf = (variant: SiegeTowerVariant, key: string): string => `${variant}:${key}`;
  const touched = new Set<string>();

  const write = (target: SiegeTowerInstance, key: string, rel: number, ox: number, oy: number, oz: number, quat: Quaternion, sx: number, sy: number, sz: number, isAppend: boolean): void => {
    const slotKey = slotKeyOf(target.variant, key);
    const slot = slots.get(slotKey);
    if (!slot) return;
    if (isAppend) {
      if (rel === 0) target.bases[key] = slot.count;
      slot.count += 1;
    }
    position.set(target.x + ox, target.y + oy, target.z + oz);
    scale.set(sx, sy, sz);
    matrix.compose(position, quat, scale);
    slot.mesh.setMatrixAt(target.bases[key]! + rel, matrix);
    if (!isAppend) touched.add(slotKey);
  };

  const writeRaw = (target: SiegeTowerInstance, key: string, rel: number, matrixToWrite: Matrix4, isAppend: boolean): void => {
    const slotKey = slotKeyOf(target.variant, key);
    const slot = slots.get(slotKey);
    if (!slot) return;
    if (isAppend) {
      if (rel === 0) target.bases[key] = slot.count;
      slot.count += 1;
    }
    slot.mesh.setMatrixAt(target.bases[key]! + rel, matrixToWrite);
    if (!isAppend) touched.add(slotKey);
  };

  const flushTouched = (): void => {
    for (const slotKey of touched) {
      const slot = slots.get(slotKey);
      if (!slot || slot.count === 0) continue;
      const { mesh, count } = slot;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
    touched.clear();
  };

  const writeDreadBody = (target: SiegeTowerInstance, isAppend: boolean, yaw: number): void => {
    const { shape } = target;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    qYaw.setFromAxisAngle(Y_AXIS, yaw);
    const rx = (ox: number, oz: number): [number, number] => [ox * cosYaw + oz * sinYaw, -ox * sinYaw + oz * cosYaw];

    write(target, "base", 0, 0, 0, 0, qYaw, shape.baseR, 1, shape.baseR, isAppend);

    const corners = [rx(shape.spread, shape.spread), rx(-shape.spread, shape.spread), rx(shape.spread, -shape.spread), rx(-shape.spread, -shape.spread)];
    for (let i = 0; i < 4; i += 1) {
      write(target, "leg", i, corners[i]![0], shape.legH / 2, corners[i]![1], qYaw, shape.legW, shape.legH, shape.legW, isAppend);
    }

    let rel = 0;
    for (const levelY of [BRACE_LOW_Y, BRACE_HIGH_Y] as const) {
      write(target, "brace", rel, 0, levelY, 0, qYaw, shape.braceW, 0.05, 0.045, isAppend);
      rel += 1;
      write(target, "brace", rel, 0, levelY, 0, qYaw, 0.045, 0.05, shape.braceW, isAppend);
      rel += 1;
      for (const rot of [Math.PI / 4, -Math.PI / 4] as const) {
        qLocal.setFromAxisAngle(Y_AXIS, rot);
        qCombined.multiplyQuaternions(qYaw, qLocal);
        write(target, "brace", rel, 0, levelY, 0, qCombined, shape.braceW, 0.05, 0.045, isAppend);
        rel += 1;
      }
    }

    write(target, "platform", 0, 0, PLATFORM_Y, 0, qYaw, shape.platformW, 0.06, shape.platformW, isAppend);
    const pylonH = shape.pylonTopY - PLATFORM_Y;
    write(target, "pylon", 0, 0, PLATFORM_Y + pylonH / 2, 0, qYaw, shape.pylonR, pylonH, shape.pylonR, isAppend);
  };

  const writeStatic = (target: SiegeTowerInstance, isAppend: boolean, yaw: number): void => {
    if (target.variant === "DREAD_TOWER") {
      writeDreadBody(target, isAppend, yaw);
      return;
    }
    const { shape } = target;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    qYaw.setFromAxisAngle(Y_AXIS, yaw);
    const rx = (ox: number, oz: number): [number, number] => [ox * cosYaw + oz * sinYaw, -ox * sinYaw + oz * cosYaw];

    write(target, "base", 0, 0, 0, 0, qYaw, shape.baseR, 1, shape.baseR, isAppend);

    const corners = [rx(shape.spread, shape.spread), rx(-shape.spread, shape.spread), rx(shape.spread, -shape.spread), rx(-shape.spread, -shape.spread)];
    for (let i = 0; i < 4; i += 1) {
      write(target, "leg", i, corners[i]![0], shape.legH / 2, corners[i]![1], qYaw, shape.legW, shape.legH, shape.legW, isAppend);
    }

    let rel = 0;
    for (const levelY of [BRACE_LOW_Y, BRACE_HIGH_Y] as const) {
      write(target, "brace", rel, 0, levelY, 0, qYaw, shape.braceW, 0.05, 0.045, isAppend);
      rel += 1;
      write(target, "brace", rel, 0, levelY, 0, qYaw, 0.045, 0.05, shape.braceW, isAppend);
      rel += 1;
      for (const rot of [Math.PI / 4, -Math.PI / 4] as const) {
        qLocal.setFromAxisAngle(Y_AXIS, rot);
        qCombined.multiplyQuaternions(qYaw, qLocal);
        write(target, "brace", rel, 0, levelY, 0, qCombined, shape.braceW, 0.05, 0.045, isAppend);
        rel += 1;
      }
    }

    write(target, "platform", 0, 0, PLATFORM_Y, 0, qYaw, shape.platformW, 0.06, shape.platformW, isAppend);
    write(target, "column", 0, 0, PLATFORM_Y + 0.21, 0, qYaw, 0.07, 0.42, 0.07, isAppend);
  };

  const RING_KEYS = ["ringA", "ringB", "ringC", "ringD"] as const;

  const writeLens = (target: SiegeTowerInstance, isAppend: boolean, yaw: number, pitch: number, beamLen: number, tMs: number): void => {
    const { shape } = target;
    const emitterY = shape.emitterY;

    // Beam direction: from the emitter down at `pitch` below the horizontal,
    // along azimuth `yaw`.
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    dir.set(Math.sin(yaw) * cosP, -sinP, Math.cos(yaw) * cosP);
    if (dir.lengthSq() < 0.0001) dir.set(0, -1, 0).normalize();
    dir.normalize();
    qBeam.setFromUnitVectors(Y_AXIS, dir);

    if (target.variant === "DREAD_TOWER") {
      // The core is a massive fixed reactor sphere; the beam lances out of it.
      qIdentity.set(0, 0, 0, 1);
      write(target, "core", 0, 0, emitterY, 0, qIdentity, shape.mediumR, shape.mediumR, shape.mediumR, isAppend);
      write(target, "coreHalo", 0, 0, emitterY, 0, qIdentity, shape.haloR, shape.haloR, shape.haloR, isAppend);

      // Four huge brass rings precess around the core, each tilted from the
      // vertical and swept around the shared axis at its own rate.
      const tSec = tMs / 1000;
      shape.rings.forEach((ring, i) => {
        const spin = tSec * ring.spinSpeed + target.phase + ring.phaseOffset;
        const cosT = Math.cos(ring.tilt);
        const sinT = Math.sin(ring.tilt);
        ringAxis.set(Math.cos(spin) * sinT, cosT, -Math.sin(spin) * sinT).normalize();
        qSpin.setFromUnitVectors(Z_AXIS, ringAxis);
        write(target, RING_KEYS[i]!, 0, 0, emitterY, 0, qSpin, ring.radius, ring.radius, ring.radius, isAppend);
      });

      // The sky lance charges a column of light up out of the core.
      if (shape.skyH > 0) {
        position.set(target.x, target.y + emitterY + shape.skyH / 2, target.z);
        qIdentity.set(0, 0, 0, 1);
        scale.set(shape.skyThick, shape.skyH, shape.skyThick);
        matrix.compose(position, qIdentity, scale);
        writeRaw(target, "sky", 0, matrix, isAppend);
      }
    } else {
      // Cradle rings: outer hoop faces only the azimuth; inner hoop is then
      // tilted by the beam pitch about the hoop's pivot axis.
      ringAxis.set(-Math.cos(yaw), 0, Math.sin(yaw)).normalize();
      qRingBase.setFromUnitVectors(Z_AXIS, ringAxis);
      write(target, "ringOuter", 0, 0, emitterY, 0, qRingBase, 0.5, 0.5, 0.5, isAppend);

      qTilt.setFromAxisAngle(ringAxis, -pitch);
      qCombined.multiplyQuaternions(qTilt, qRingBase);
      write(target, "ringInner", 0, 0, emitterY, 0, qCombined, 0.36, 0.36, 0.36, isAppend);

      // Barrel sits just behind the lens, pointing back along the beam axis.
      position.set(target.x - dir.x * BARREL_BACK, target.y + emitterY - dir.y * BARREL_BACK, target.z - dir.z * BARREL_BACK);
      scale.set(0.15, 0.3, 0.15);
      matrix.compose(position, qBeam, scale);
      writeRaw(target, "barrel", 0, matrix, isAppend);

      write(target, "lens", 0, 0, emitterY, 0, qBeam, shape.mediumR, shape.mediumR, shape.mediumR, isAppend);

      qRim.setFromUnitVectors(Z_AXIS, dir);
      write(target, "rim", 0, 0, emitterY, 0, qRim, shape.mediumR * 1.25, shape.mediumR * 1.25, shape.mediumR * 1.25, isAppend);
      write(target, "halo", 0, 0, emitterY, 0, qRim, shape.mediumR * 1.6, shape.mediumR * 1.6, shape.mediumR * 1.6, isAppend);
    }

    // Beam: a unit cylinder stretched from the emitter down to the impact point.
    const beamMidX = target.x + dir.x * (beamLen / 2);
    const beamMidY = target.y + emitterY + dir.y * (beamLen / 2);
    const beamMidZ = target.z + dir.z * (beamLen / 2);
    position.set(beamMidX, beamMidY, beamMidZ);
    scale.set(shape.beamR, beamLen, shape.beamR);
    matrix.compose(position, qBeam, scale);
    writeRaw(target, "beam", 0, matrix, isAppend);
    scale.set(shape.beamR * 0.45, beamLen, shape.beamR * 0.45);
    matrix.compose(position, qBeam, scale);
    writeRaw(target, "beamCore", 0, matrix, isAppend);
  };

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
    instances.length = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number, variant: SiegeTowerVariant): void => {
    if (instances.length >= CAP) return;
    const hash = ((worldTileX * 92_821) ^ (worldTileY * 68_917)) >>> 0;
    const phase = ((hash % 1000) / 1000) * Math.PI * 2;
    const target: SiegeTowerInstance = { x: sceneX, y: surfaceY, z: sceneZ, wx: worldTileX, wy: worldTileY, variant, shape: SHAPES[variant], phase, bases: {}, yaw: 0 };
    writeStatic(target, true, 0);
    writeLens(target, true, 0, Math.PI / 2, target.shape.emitterY, 0);
    instances.push(target);
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      const { mesh, count } = slot;
      mesh.count = count;
      if (count === 0) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const approach = (current: number, target: number, rate: number): number => {
    const delta = target - current;
    return Math.abs(delta) < 0.0005 ? target : current + delta * rate;
  };

  const turnToward = (current: number, target: number, rate: number): number => {
    const shortest = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return approach(current, current + shortest, rate);
  };

  let beamOp = 0;
  const update = (nowMs: number, latestBattleTarget?: SiegeTowerBattleTarget): void => {
    if (instances.length === 0) return;
    const structureMode = rotationMode() === "structure";
    const hasBattle = latestBattleTarget !== undefined;

    beamOp = approach(beamOp, hasBattle ? 1 : 0, 0.05);
    const flicker = 0.78 + 0.22 * Math.sin(nowMs * 0.02);
    const haloGlow = 0.3 + 0.55 * beamOp + 0.15 * Math.sin(nowMs * 0.004);
    const siegeMats = matsOf.SIEGE_TOWER;
    siegeMats.beam.opacity = beamOp * flicker;
    siegeMats.beamCore.opacity = beamOp * 0.95 * flicker;
    siegeMats.halo.opacity = haloGlow;
    const dreadMats = matsOf.DREAD_TOWER;
    dreadMats.beam.opacity = beamOp * (0.85 + 0.1 * Math.sin(nowMs * 0.013)) * flicker;
    dreadMats.beamCore.opacity = beamOp * 0.9 * flicker;
    dreadMats.halo.opacity = haloGlow;
    dreadMats.sky.opacity = 0.08 + 0.1 * beamOp + 0.05 * Math.sin(nowMs * 0.003);

    for (const target of instances) {
      let yawTarget = target.yaw;
      // Idle pose matches the spawn pose (writeLens(…, Math.PI / 2, emitterY))
      // so the cradle doesn't snap on the first frame of no battle.
      let pitch = Math.PI / 2;
      let beamLen = target.shape.emitterY;
      if (latestBattleTarget) {
        const dx = toroidDelta(target.wx, latestBattleTarget.x, WORLD_WIDTH);
        const dz = toroidDelta(target.wy, latestBattleTarget.y, WORLD_HEIGHT);
        const h0 = Math.hypot(dx, dz);
        if (h0 > 0.001) {
          yawTarget = Math.atan2(dx, dz);
          const hClamp = Math.min(h0, BEAM_MAX_RANGE_TILES);
          pitch = Math.atan2(target.shape.emitterY, hClamp);
          beamLen = Math.hypot(hClamp, target.shape.emitterY);
        }
      }
      target.yaw = turnToward(target.yaw, yawTarget, 0.08);
      if (structureMode) writeStatic(target, false, target.yaw);
      writeLens(target, false, target.yaw, pitch, beamLen, nowMs);
    }
    flushTouched();
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  };

  const hasInstances = (): boolean => instances.length > 0;

  return { clear, addInstance, commit, update, hasInstances, dispose };
};