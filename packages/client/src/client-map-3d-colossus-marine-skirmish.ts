import { AnimationMixer, Color, Matrix4, Object3D, Quaternion, Scene, SkinnedMesh, Vector3, type AnimationAction } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { firstSkinnedMesh, loadPopupMarineTemplate, MARINE_CLIP_NAMES, type PopupMarineTemplate } from "./client-map-3d-popup-marine/popup-marine-asset.js";
import { MARINE_MODEL_SCALE } from "./client-map-3d-popup-marine/popup-marine-timeline.js";
// Same pooled effect-mesh factories the two-sided marine battle overlay
// draws its own laser bolts and impact sparks with (popup-marine-shot-
// render.ts) -- reused here so a colossus fight's laser fire looks
// IDENTICAL to every other marine battle in the game: a thin oriented
// tracer bar stretched along its travel direction, not a ball moving
// through space. The original version of this module drew bolts as a
// fixed-size sphere translated frame to frame, which read as a drifting
// blob rather than a beam -- this fixes that by adopting the same
// box-geometry-plus-quaternion approach popup-marine-shot-render.ts uses.
import { createBoltMesh, createSparkMesh } from "./client-map-3d-popup-marine/popup-marine-effect-meshes.js";

// A small defender-only marine squad shooting at a Voidcrystal Colossus,
// used by BOTH client-map-3d-barbarian-overlay.ts (the colossus wins: it
// kills the marines one by one) and client-map-3d-barbarian-loss-overlay.ts
// (the colossus loses: the marines keep firing the whole time and the
// colossus itself dissolves elsewhere). Deliberately NOT built on
// popup-marine-overlay-fx.ts's two-sided BattleOverlayRenderEntry system --
// that system always renders an attacker-side marine squad too, which has
// no meaning here (the attacker is the colossus, not marines), and doing so
// shipped a confusing "marines fighting marines" visual once already.
//
// This module owns only: the marine squad's models/poses, laser bolts fired
// from each living marine at the colossus's current position, an impact
// spark where a bolt lands, and (only when told the colossus wins) killing
// one marine at a time on a fixed cadence. It has no opinion on how the
// colossus itself is animated or how it dies -- callers position it via
// `colossusWorldX/Z/surfaceY` and tell it the fight's timing/outcome.
const MARINES_PER_FIGHT = 4;
const MAX_CONCURRENT_FIGHTS = 6;
const MAX_MARINES = MARINES_PER_FIGHT * MAX_CONCURRENT_FIGHTS;
const FIRE_INTERVAL_MS = 420;
const BOLT_TRAVEL_MS = 160;
const MAX_CONCURRENT_BOLTS = MAX_CONCURRENT_FIGHTS * MARINES_PER_FIGHT;
const IMPACT_PARTICLES_PER_HIT = 6;
const IMPACT_LIFETIME_MS = 220;
const MAX_IMPACT_PARTICLES = MAX_CONCURRENT_BOLTS * IMPACT_PARTICLES_PER_HIT;
const BOLT_COLOR = new Color("#ff5a3c");
const IMPACT_COLOR = new Color("#ffd27a");
const SQUAD_RADIUS = 0.85;
const COLOSSUS_HIT_HEIGHT = 0.9; // roughly torso height on the colossus model
// Sized the same way popup-marine-shot-render.ts sizes its own bolts/sparks
// -- authored at the marine model's native scale and scaled once, so a
// colossus fight's laser fire is proportional to the marines the same way
// a marine-vs-marine fight's is.
const BOLT_LENGTH = 0.02 * MARINE_MODEL_SCALE;
const BOLT_WIDTH = 0.0022 * MARINE_MODEL_SCALE;
const SPARK_SIZE = 0.0026 * MARINE_MODEL_SCALE;
const SPARK_SPREAD_RADIUS = 0.016 * MARINE_MODEL_SCALE;
const FWD_AXIS = new Vector3(0, 0, 1);

export type SkirmishFight = {
  readonly colossusWorldX: number;
  readonly colossusWorldZ: number;
  readonly colossusSurfaceY: number;
  readonly startAt: number;
  readonly endAt: number;
  // true: the colossus wins this fight -- marines die one by one on a fixed
  // cadence until the fight ends. false: the marines hold -- they keep
  // firing the whole window and none of them die (the colossus is the one
  // that dies, handled entirely elsewhere).
  readonly colossusWins: boolean;
};

type Marine = {
  root: Object3D;
  mixer: AnimationMixer;
  action: AnimationAction | undefined;
  alive: boolean;
  angle: number;
  lastFiredAt: number;
};

type Fight = {
  key: string;
  marines: Marine[];
  nextKillAt: number;
  killIndex: number;
};

type Bolt = { fromX: number; fromY: number; fromZ: number; toX: number; toY: number; toZ: number; startAt: number };
type Impact = { x: number; y: number; z: number; startAt: number; seed: number };

export type ColossusMarineSkirmish = {
  // Starts (or refreshes, if already active) the fight keyed by `key`.
  // Idempotent per key -- safe to call every frame with the same fight data.
  readonly sync: (fights: ReadonlyMap<string, SkirmishFight>, nowMs: number) => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createColossusMarineSkirmish = (scene: Scene): ColossusMarineSkirmish => {
  let disposed = false;
  let template: PopupMarineTemplate | undefined;
  let marinePool: Marine[] = [];
  const fightsByKey = new Map<string, Fight>();
  const fightDataByKey = new Map<string, SkirmishFight>();

  let bolts: Bolt[] = [];
  let impacts: Impact[] = [];

  const boltFx = createBoltMesh(scene, BOLT_WIDTH, MAX_CONCURRENT_BOLTS);
  const impactFx = createSparkMesh(scene, SPARK_SIZE, MAX_IMPACT_PARTICLES);

  const tmpMatrix = new Matrix4();
  const tmpPos = new Vector3();
  const tmpFrom = new Vector3();
  const tmpTo = new Vector3();
  const tmpDir = new Vector3();
  const tmpScale = new Vector3();
  const tmpQuat = new Quaternion();
  const identityQuat = new Quaternion();

  const makeMarine = (angle: number): Marine => {
    const root = cloneSkinned(template!.root) as Object3D;
    const mesh = firstSkinnedMesh(root);
    mesh.frustumCulled = false;
    const mixer = new AnimationMixer(root);
    const clip = template!.clips.get(MARINE_CLIP_NAMES.stand);
    const action = clip ? mixer.clipAction(clip) : undefined;
    action?.play();
    root.visible = false;
    root.scale.setScalar(MARINE_MODEL_SCALE);
    scene.add(root);
    return { root, mixer, action, alive: true, angle, lastFiredAt: 0 };
  };

  loadPopupMarineTemplate()
    .then((loaded) => {
      if (disposed) return;
      template = loaded;
      marinePool = Array.from({ length: MAX_MARINES }, (_, i) => makeMarine((i % MARINES_PER_FIGHT) * ((Math.PI * 2) / MARINES_PER_FIGHT)));
    })
    .catch((err: unknown) => {
      console.error("popup-marine model failed to load; colossus-vs-marines skirmishes will not render a squad", err);
    });

  const endFight = (fight: Fight): void => {
    for (const marine of fight.marines) {
      marine.mixer.stopAllAction();
      marine.root.visible = false;
      marinePool.push(marine);
    }
    fightsByKey.delete(fight.key);
  };

  const startFight = (key: string): void => {
    if (marinePool.length < MARINES_PER_FIGHT) return; // at capacity -- silently skip, matches other capped overlays
    const marines = marinePool.splice(0, MARINES_PER_FIGHT);
    for (const marine of marines) {
      marine.alive = true;
      marine.lastFiredAt = 0;
      marine.action?.reset().play();
    }
    fightsByKey.set(key, { key, marines, nextKillAt: 0, killIndex: 0 });
  };

  const sync = (fights: ReadonlyMap<string, SkirmishFight>, nowMs: number): void => {
    fightDataByKey.clear();
    for (const [key, data] of fights) fightDataByKey.set(key, data);

    for (const key of [...fightsByKey.keys()]) {
      const data = fightDataByKey.get(key);
      if (!data || nowMs >= data.endAt) endFight(fightsByKey.get(key)!);
    }
    for (const [key, data] of fightDataByKey) {
      if (fightsByKey.has(key) || nowMs >= data.endAt) continue;
      startFight(key);
      const fight = fightsByKey.get(key);
      if (fight) fight.nextKillAt = nowMs + (data.endAt - nowMs) / (MARINES_PER_FIGHT + 1);
    }
  };

  const fireBolt = (marine: Marine, data: SkirmishFight, nowMs: number): void => {
    if (bolts.length >= MAX_CONCURRENT_BOLTS) return;
    bolts.push({
      fromX: marine.root.position.x,
      fromY: marine.root.position.y + 0.25,
      fromZ: marine.root.position.z,
      toX: data.colossusWorldX,
      toY: data.colossusSurfaceY + COLOSSUS_HIT_HEIGHT,
      toZ: data.colossusWorldZ,
      startAt: nowMs
    });
  };

  const spawnImpact = (x: number, y: number, z: number, nowMs: number): void => {
    impacts.push({ x, y, z, startAt: nowMs, seed: Math.floor(x * 7919 + z * 104729 + nowMs) });
  };

  const tick = (nowMs: number): void => {
    for (const fight of fightsByKey.values()) {
      const data = fightDataByKey.get(fight.key);
      if (!data) continue;

      for (let i = 0; i < fight.marines.length; i += 1) {
        const marine = fight.marines[i]!;
        marine.mixer.update(0.016);
        if (!marine.alive) continue;
        const mx = data.colossusWorldX + Math.sin(marine.angle) * SQUAD_RADIUS;
        const mz = data.colossusWorldZ + Math.cos(marine.angle) * SQUAD_RADIUS;
        marine.root.position.set(mx, data.colossusSurfaceY, mz);
        marine.root.lookAt(data.colossusWorldX, data.colossusSurfaceY, data.colossusWorldZ);
        marine.root.visible = true;
        marine.root.updateMatrixWorld(true);

        if (nowMs - marine.lastFiredAt >= FIRE_INTERVAL_MS + i * 60) {
          marine.lastFiredAt = nowMs;
          fireBolt(marine, data, nowMs);
        }
      }

      if (data.colossusWins && nowMs >= fight.nextKillAt && fight.killIndex < fight.marines.length) {
        const victim = fight.marines[fight.killIndex]!;
        victim.alive = false;
        victim.root.visible = false;
        fight.killIndex += 1;
        fight.nextKillAt = nowMs + Math.max(1, (data.endAt - nowMs) / Math.max(1, fight.marines.length - fight.killIndex + 1));
      }
    }

    // Advance bolts; any that reach BOLT_TRAVEL_MS spawn an impact and die.
    // Drawn as a thin bar oriented along its own travel direction and
    // stretched from the muzzle to how far it's travelled (clamped to
    // BOLT_LENGTH once it's covered enough ground) -- the same tracer-streak
    // approach popup-marine-shot-render.ts uses, not a ball at a lerped point.
    let boltCount = 0;
    const survivingBolts: Bolt[] = [];
    for (const bolt of bolts) {
      const t = Math.min(1, (nowMs - bolt.startAt) / BOLT_TRAVEL_MS);
      if (t >= 1) {
        spawnImpact(bolt.toX, bolt.toY, bolt.toZ, nowMs);
        continue;
      }
      survivingBolts.push(bolt);
      if (boltCount >= MAX_CONCURRENT_BOLTS) continue;
      tmpFrom.set(bolt.fromX, bolt.fromY, bolt.fromZ);
      tmpTo.set(bolt.toX, bolt.toY, bolt.toZ);
      tmpDir.subVectors(tmpTo, tmpFrom);
      const dist = tmpDir.length();
      if (dist < 1e-6) continue;
      tmpDir.divideScalar(dist);
      const travelled = Math.min(t * dist, dist);
      tmpPos.copy(tmpFrom).addScaledVector(tmpDir, Math.max(travelled - BOLT_LENGTH * 0.5, 0));
      tmpQuat.setFromUnitVectors(FWD_AXIS, tmpDir);
      tmpScale.set(1, 1, Math.min(BOLT_LENGTH, Math.max(travelled, BOLT_LENGTH * 0.25)));
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      boltFx.mesh.setMatrixAt(boltCount, tmpMatrix);
      boltFx.mesh.setColorAt(boltCount, BOLT_COLOR);
      boltCount += 1;
    }
    bolts = survivingBolts;
    boltFx.commit(boltCount);

    // Advance impact sparks; each is a brief outward-scattering burst of
    // small cubes (matching popup-marine-effect-meshes.ts's createSparkMesh
    // sizing), not a single large sphere.
    let impactParticleCount = 0;
    const survivingImpacts: Impact[] = [];
    for (const impact of impacts) {
      const age = nowMs - impact.startAt;
      if (age >= IMPACT_LIFETIME_MS) continue;
      survivingImpacts.push(impact);
      const t = age / IMPACT_LIFETIME_MS;
      for (let i = 0; i < IMPACT_PARTICLES_PER_HIT && impactParticleCount < MAX_IMPACT_PARTICLES; i += 1) {
        const seed = impact.seed + i * 7919;
        const angle = ((seed % 360) / 360) * Math.PI * 2;
        const tilt = (((seed >> 3) % 180) / 180) * Math.PI;
        const radius = t * SPARK_SPREAD_RADIUS * (0.6 + ((seed % 11) / 11) * 0.6);
        tmpPos.set(impact.x + Math.sin(tilt) * Math.cos(angle) * radius, impact.y + Math.cos(tilt) * radius, impact.z + Math.sin(tilt) * Math.sin(angle) * radius);
        tmpScale.setScalar((1 - t) * 0.6 + 0.1);
        tmpMatrix.compose(tmpPos, identityQuat, tmpScale);
        impactFx.mesh.setMatrixAt(impactParticleCount, tmpMatrix);
        impactFx.mesh.setColorAt(impactParticleCount, IMPACT_COLOR);
        impactParticleCount += 1;
      }
    }
    impacts = survivingImpacts;
    impactFx.commit(impactParticleCount);
  };

  const dispose = (): void => {
    disposed = true;
    for (const fight of fightsByKey.values()) endFight(fight);
    for (const marine of marinePool) {
      marine.mixer.stopAllAction();
      scene.remove(marine.root);
      marine.root.traverse((child) => {
        if (child instanceof SkinnedMesh) child.geometry.dispose();
      });
    }
    marinePool = [];
    boltFx.dispose();
    impactFx.dispose();
  };

  return { sync, tick, dispose };
};
