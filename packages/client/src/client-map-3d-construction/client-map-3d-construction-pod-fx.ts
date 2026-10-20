import { Color, Euler, Matrix4, Quaternion, Scene, Vector3, type InstancedMesh } from "three";
import {
  POD_FLAMES,
  POD_FRAME_LAYOUT,
  POD_HALF,
  POD_HEIGHT,
  POD_LAND_SPARKS,
  POD_LAUNCH_SPARKS,
  POD_PANEL,
  POD_PANELS,
  POD_PLATE,
  POD_TRAIL_PUFFS,
  POD_DUST,
  createPodFxAssets,
  type PodMeshKey
} from "./client-map-3d-construction-pod-assets.js";
import {
  POD_AFC_CAP_Y,
  POD_CHAMBER_Y,
  bump,
  easeOutBack,
  easeOutCubic,
  planPodFlight,
  podCratesDelivered,
  podLeanAt,
  podPositionAt,
  podPrintedAt,
  podStageAt,
  podThrottleAt,
  smoothstep,
  window01,
  type PodFlightPlan,
  type PodStage
} from "./client-map-3d-construction-pod-flight.js";

// A parts pod arriving at a construction site (docs/construction-animation-plan.md): at each new
// phase the owner's AFC fabricates the next batch of parts and flies them to the site's parts
// stack. The beats (timeline in client-map-3d-construction-pod-flight.ts):
//   - the AFC prints the pod inside its glass chamber, a scan ring climbing it as the core flares;
//   - the pod is kicked out through the AFC's crown with a flash, a shockwave and a spray of sparks;
//   - it flies like a thrust-vectored lander: it hangs, pitches into the trip, leans at speed and
//     flares nose-up to brake, a cyan exhaust trail and a ground shadow following it;
//   - it retro-burns down onto the stack, its engine lighting the ground and kicking up dust, and
//     lands with a squash, a flash, a ring and skidding sparks;
//   - the lid pops, the walls fold open and the empty frame collapses, leaving the crates (which
//     the stack keeps hidden until the pod is down: see awaitingDelivery).
// Everything is fabricated at the AFC and carried over at low altitude; nothing is built in orbit,
// so there is no drop-from-orbit variant. A site whose AFC is unknown simply gets no pod.
const MAX_PODS = 24;

type PodEntry = {
  // The site the pod is delivering to, so a rebuild can follow it (see relocate).
  readonly siteKey: string;
  landX: number;
  landY: number;
  landZ: number;
  readonly startedAt: number;
  readonly plan: PodFlightPlan;
  // Per-pod variation (spark directions, flicker, wobble), fixed at spawn.
  readonly seed: number;
};

export type ConstructionPodSnapshot = {
  readonly siteKey: string;
  readonly stage: PodStage;
  // The pod's bottom centre, scene coordinates.
  readonly x: number;
  readonly y: number;
  readonly z: number;
  // Pitch along the heading (radians, positive = leaning into the trip).
  readonly lean: number;
};

export type ConstructionPodFxLayer = {
  // `from` is where the pod launches relative to the landing point: the AFC's offset.
  readonly spawn: (siteKey: string, landX: number, landZ: number, surfaceY: number, nowMs: number, from: { readonly dx: number; readonly dz: number }) => void;
  // A rebuild re-anchors the scene, so the same site lands somewhere else in scene units: move its
  // pods (still in flight or landing) to the new landing point.
  readonly relocate: (siteKey: string, landX: number, landZ: number, surfaceY: number) => void;
  // Drop the pods of every site the last rebuild did not lay out (scrolled away, or finished).
  readonly retainOnly: (siteKeys: ReadonlySet<string>) => void;
  // True while a pod bound for `siteKey` has not yet set its crates down: the stack shows empty.
  readonly awaitingDelivery: (siteKey: string, nowMs: number) => boolean;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly activeCount: () => number;
  readonly snapshot: (nowMs: number) => readonly ConstructionPodSnapshot[];
  readonly dispose: () => void;
};

const CYAN = new Color(0.31, 0.85, 1);
const HOT_CYAN = new Color(0.75, 0.97, 1);
const DEEP_CYAN = new Color(0.08, 0.42, 0.85);
const WHITE = new Color(1, 1, 1);
const SPARK = new Color(1, 0.8, 0.48);
const TRAIL_SPACING_MS = 24;
const GRAVITY = 4.2e-6; // tiles per ms^2: the sparks fall, they do not drift
const yAxis = new Vector3(0, 1, 0);
const xAxis = new Vector3(1, 0, 0);

export const createConstructionPodFxLayer = (scene: Scene): ConstructionPodFxLayer => {
  const { meshes, dispose: disposeAssets } = createPodFxAssets(scene, MAX_PODS);
  const entries: PodEntry[] = [];
  const counts: Record<PodMeshKey, number> = { frame: 0, panel: 0, beacon: 0, flame: 0, puff: 0, glow: 0, ring: 0, shadow: 0, dust: 0 };
  let drewLastFrame = false;

  const pod = new Matrix4();
  const local = new Matrix4();
  const world = new Matrix4();
  const hinge = new Matrix4();
  const quat = new Quaternion();
  const partQuat = new Quaternion();
  const euler = new Euler(0, 0, 0, "YXZ");
  const pos = new Vector3();
  const scl = new Vector3();
  const tint = new Color();
  const trailTint = new Color();
  const at = { x: 0, y: 0, z: 0 };
  const past = { x: 0, y: 0, z: 0 };

  const put = (key: PodMeshKey, matrix: Matrix4, color?: Color): void => {
    const mesh = meshes[key];
    if (counts[key] >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(counts[key], matrix);
    if (color) mesh.setColorAt(counts[key], color);
    counts[key] += 1;
  };
  // An unrotated instance at a local-to-landing point, uniformly scaled.
  const putAt = (key: PodMeshKey, entry: PodEntry, x: number, y: number, z: number, size: number, color: Color, strength: number): void => {
    if (strength <= 0.003 || size <= 0) return;
    world.compose(pos.set(entry.landX + x, entry.landY + y, entry.landZ + z), partQuat.identity(), scl.set(size, size, size));
    put(key, world, tint.copy(color).multiplyScalar(Math.min(1, strength)));
  };

  const spawn: ConstructionPodFxLayer["spawn"] = (siteKey, landX, landZ, surfaceY, nowMs, from) => {
    if (entries.length >= MAX_PODS) return;
    entries.push({ siteKey, landX, landY: surfaceY, landZ, startedAt: nowMs, plan: planPodFlight(from.dx, from.dz), seed: Math.random() * 1_000 });
  };

  // The pod body: brass frame, four steel walls hinged at the base, the beacon on the lid.
  const drawBody = (entry: PodEntry, age: number, since: number): void => {
    const { plan, seed } = entry;
    podPositionAt(plan, age, at);
    const printed = podPrintedAt(plan, age);
    const squash = 0.2 * bump(since / 150);
    const wobble = age >= plan.cruiseAtMs && since < 0 ? 0.035 * Math.sin(age * 0.011 + seed) : 0;
    euler.set(podLeanAt(plan, age), plan.heading, wobble);
    quat.setFromEuler(euler);
    pod.compose(pos.set(entry.landX + at.x, entry.landY + at.y, entry.landZ + at.z), quat, scl.set(1 + 0.4 * squash, (1 - squash) * printed, 1 + 0.4 * squash));

    const lidOff = window01(since, 60, 300);
    const postsDown = smoothstep(window01(since, 300, 260));
    const collapse = smoothstep(window01(since, 560, 320));
    for (let part = 0; part < POD_FRAME_LAYOUT.length; part += 1) {
      const [px, y, pz, sx, sy, sz] = POD_FRAME_LAYOUT[part]!;
      let py = y, k = 1, ky = 1;
      partQuat.identity();
      if (part === 1) {
        // The lid pops off, spinning, and shrinks away.
        py += 0.17 * easeOutCubic(lidOff);
        partQuat.setFromAxisAngle(yAxis, 1.3 * lidOff);
        k = 1 - smoothstep(window01(since, 180, 180));
      } else if (part >= 2) {
        // Corner posts retract into the base.
        ky = 1 - postsDown;
        py = POD_PLATE + (sy * ky) / 2;
      } else k = 1 - collapse;
      if (k <= 0 || ky <= 0) continue;
      local.compose(pos.set(px, py, pz), partQuat, scl.set(sx * k, sy * ky * (part === 0 ? 1 : k), sz * k));
      put("frame", world.multiplyMatrices(pod, local));
    }

    const open = 1.52 * easeOutBack(window01(since, 120, 380));
    const panelScale = 1 - collapse;
    if (panelScale > 0) {
      for (let j = 0; j < POD_PANELS; j += 1) {
        // Hinged along the base plate's edge, the wall swings out and down about its bottom edge.
        hinge.makeRotationY((j * Math.PI) / 2);
        local.compose(pos.set(0, POD_PLATE, POD_HALF - POD_PANEL.thickness / 2), partQuat.setFromAxisAngle(xAxis, open), scl.set(panelScale, panelScale, panelScale));
        put("panel", world.multiplyMatrices(pod, hinge.multiply(local)));
      }
    }

    const blink = (age + seed) % 480 < 170;
    if (blink && since < 60 && printed > 0.98) {
      local.makeTranslation(0, POD_HEIGHT + 0.008, 0);
      put("beacon", world.multiplyMatrices(pod, local));
    }

    // The main engine, under the base: a white core in a cyan sheath, flickering, never longer than
    // the gap to the ground on the way down.
    const throttle = podThrottleAt(plan, age);
    if (throttle > 0) {
      const flicker = 1 + 0.12 * Math.sin(age * 0.09 + seed) + 0.08 * Math.sin(age * 0.23 + seed * 2);
      const length = Math.min((0.05 + 0.17 * throttle) * flicker, Math.max(0.02, at.y + 0.015));
      const width = 0.028 + 0.014 * throttle;
      for (let f = 0; f < POD_FLAMES; f += 1) {
        const core = f === 1;
        local.compose(pos.set(0, 0.004, 0), partQuat.identity(), scl.set(width * (core ? 0.45 : 1), length * (core ? 0.62 : 1), width * (core ? 0.45 : 1)));
        put("flame", world.multiplyMatrices(pod, local), tint.copy(core ? WHITE : CYAN).multiplyScalar(core ? throttle : 0.85 * throttle));
      }
    }
  };

  // Everything around the pod: the AFC's fabrication and launch, the trail, the shadow, the landing.
  const drawEffects = (entry: PodEntry, age: number, since: number): void => {
    const { plan, seed } = entry;
    const printed = podPrintedAt(plan, age);
    const sinceLaunch = age - plan.liftAtMs;

    // Fabrication: the chamber's core flares as the pod is printed, a scan ring climbing the pod;
    // it peaks as the pod is fired.
    const flare = sinceLaunch < 0 ? 0.15 + 0.5 * printed : 0.9 * (1 - window01(sinceLaunch, 0, 300));
    putAt("puff", entry, plan.fromX, 0.46, plan.fromZ, 0.1 + 0.06 * printed, CYAN, flare);
    if (sinceLaunch < 0) putAt("ring", entry, plan.fromX, POD_CHAMBER_Y + printed * POD_HEIGHT, plan.fromZ, POD_HALF * 1.6, HOT_CYAN, 0.9 * Math.min(1, printed * 8));

    // Launch, at the AFC's crown: flash, shockwave and sparks thrown clear of the arms.
    if (sinceLaunch >= 0) {
      const flash = window01(sinceLaunch, 0, 240);
      putAt("glow", entry, plan.fromX, POD_AFC_CAP_Y + 0.01, plan.fromZ, 0.55 + 0.4 * flash, HOT_CYAN, 1 - flash);
      const shock = window01(sinceLaunch, 0, 480);
      putAt("ring", entry, plan.fromX, POD_AFC_CAP_Y, plan.fromZ, 0.12 + 0.75 * easeOutCubic(shock), CYAN, 0.8 * (1 - shock) ** 1.5);
      for (let i = 0; i < POD_LAUNCH_SPARKS && sinceLaunch < 440; i += 1) {
        const angle = (i / POD_LAUNCH_SPARKS) * Math.PI * 2 + seed;
        const speed = 0.0011 + 0.0004 * ((i * 7) % 3);
        const y = POD_AFC_CAP_Y + 0.0009 * sinceLaunch - 0.5 * GRAVITY * sinceLaunch * sinceLaunch;
        putAt("puff", entry, plan.fromX + Math.cos(angle) * speed * sinceLaunch, y, plan.fromZ + Math.sin(angle) * speed * sinceLaunch, 0.011, HOT_CYAN, 1 - sinceLaunch / 440);
      }
    }

    // The exhaust trail: the pod's own recent path, sampled back in time (no history to keep),
    // hot near the engine and cooling to deep blue, widening and rising as it disperses.
    for (let k = 0; k < POD_TRAIL_PUFFS; k += 1) {
      const sampleAge = age - (k + 1) * TRAIL_SPACING_MS;
      if (sampleAge < plan.liftAtMs || sampleAge >= plan.touchdownAtMs) continue;
      podPositionAt(plan, sampleAge, past);
      const fade = (1 - k / POD_TRAIL_PUFFS) ** 1.6;
      // On the way straight down the trail would stack into a column over the pod: keep it thin there.
      const settling = sampleAge >= plan.descentAtMs ? 0.3 : 1;
      const strength = fade * settling * (0.25 + 0.75 * podThrottleAt(plan, sampleAge)) * 0.8;
      trailTint.copy(HOT_CYAN).lerp(DEEP_CYAN, k / (POD_TRAIL_PUFFS - 1));
      putAt("puff", entry, past.x, past.y - 0.01 + k * 0.004, past.z, 0.013 + 0.0022 * k, trailTint, strength);
    }

    // The shadow: tight and dark near the ground, broad and faint high up, hidden under the AFC itself.
    podPositionAt(plan, age, at);
    const clearOfAfc = Math.min(1, Math.hypot(at.x - plan.fromX, at.z - plan.fromZ) / 0.9);
    const shadow = 0.55 * Math.max(0, 1 - at.y / 2.6) * clearOfAfc * (1 - smoothstep(window01(since, 560, 300)));
    putAt("shadow", entry, at.x, 0.011, at.z, POD_HALF * 2.8 * (1 + 0.5 * at.y), WHITE, shadow);

    // Retro-burn: the engine lights the ground under it as it comes down.
    const throttle = podThrottleAt(plan, age);
    const groundLight = since < 0 ? throttle * Math.max(0, 1 - at.y / 0.75) : 0.9 * (1 - window01(since, 0, 180));
    if (age >= plan.descentAtMs) putAt("glow", entry, 0, 0.012, 0, 0.28 + 0.3 * Math.min(1, at.y / 0.75), CYAN, 0.9 * groundLight);

    // Dust kicked up by the burn just before contact, billowing out and settling.
    const dustAge = since + 180;
    if (dustAge > 0 && dustAge < 1_000) {
      const w = dustAge / 1_000;
      const spread = easeOutCubic(w);
      for (let i = 0; i < POD_DUST; i += 1) {
        const angle = (i / POD_DUST) * Math.PI * 2 + seed * 0.7;
        const r = 0.06 + (0.26 + 0.07 * (i % 3)) * spread;
        const size = 0.05 * (0.5 + w) * (1 - w) ** 1.2;
        world.compose(pos.set(entry.landX + Math.cos(angle) * r, entry.landY + 0.02 + 0.06 * spread, entry.landZ + Math.sin(angle) * r), partQuat.identity(), scl.set(size, size * 0.7, size));
        put("dust", world);
      }
    }

    // Touchdown: flash, ring, and sparks skidding out from under the base.
    if (since >= 0) {
      const flash = window01(since, 0, 240);
      putAt("glow", entry, 0, 0.014, 0, 0.36 + 0.3 * flash, HOT_CYAN, 0.95 * (1 - flash));
      const ring = window01(since, 0, 700);
      putAt("ring", entry, 0, 0.013, 0, 0.1 + 0.5 * easeOutCubic(ring), CYAN, 0.45 * (1 - ring) ** 1.6);
      for (let i = 0; i < POD_LAND_SPARKS && since < 460; i += 1) {
        const angle = (i / POD_LAND_SPARKS) * Math.PI * 2 + seed * 3;
        const speed = 0.0008 + 0.0006 * (((i * 5) % 4) / 3);
        const y = 0.02 + 0.0011 * since - 0.5 * GRAVITY * since * since;
        if (y < 0.004) continue;
        putAt("puff", entry, Math.cos(angle) * speed * since, y, Math.sin(angle) * speed * since, 0.009, SPARK, 1 - since / 460);
      }
    }
  };

  const upload = (): void => {
    for (const key of Object.keys(counts) as PodMeshKey[]) {
      const mesh: InstancedMesh = meshes[key];
      mesh.count = counts[key];
      mesh.visible = counts[key] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  const update = (nowMs: number): void => {
    // The common case is no pod at all: skip the buffer syncs.
    if (entries.length === 0 && !drewLastFrame) return;
    for (const key of Object.keys(counts) as PodMeshKey[]) counts[key] = 0;
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      // The frame's timestamp can precede the spawn time by a few ms: never run the flight backwards.
      const age = Math.max(0, nowMs - entry.startedAt);
      if (age >= entry.plan.endAtMs) {
        entries.splice(i, 1);
        continue;
      }
      const since = age - entry.plan.touchdownAtMs;
      drawBody(entry, age, since);
      drawEffects(entry, age, since);
    }
    upload();
    drewLastFrame = entries.length > 0;
  };

  const relocate: ConstructionPodFxLayer["relocate"] = (siteKey, landX, landZ, surfaceY) => {
    for (const entry of entries) {
      if (entry.siteKey !== siteKey) continue;
      entry.landX = landX;
      entry.landY = surfaceY;
      entry.landZ = landZ;
    }
  };

  const retainOnly: ConstructionPodFxLayer["retainOnly"] = (siteKeys) => {
    for (let i = entries.length - 1; i >= 0; i -= 1) if (!siteKeys.has(entries[i]!.siteKey)) entries.splice(i, 1);
  };

  const awaitingDelivery: ConstructionPodFxLayer["awaitingDelivery"] = (siteKey, nowMs) =>
    entries.some((entry) => entry.siteKey === siteKey && !podCratesDelivered(entry.plan, nowMs - entry.startedAt));

  const snapshot: ConstructionPodFxLayer["snapshot"] = (nowMs) =>
    entries.map((entry) => {
      const age = Math.max(0, nowMs - entry.startedAt);
      podPositionAt(entry.plan, age, at);
      return { siteKey: entry.siteKey, stage: podStageAt(entry.plan, age), x: entry.landX + at.x, y: entry.landY + at.y, z: entry.landZ + at.z, lean: podLeanAt(entry.plan, age) };
    });

  const clear = (): void => {
    entries.length = 0;
  };

  const dispose = (): void => {
    clear();
    disposeAssets();
  };

  return { spawn, relocate, retainOnly, awaitingDelivery, update, clear, activeCount: () => entries.length, snapshot, dispose };
};
