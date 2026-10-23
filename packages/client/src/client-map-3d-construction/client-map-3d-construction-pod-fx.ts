import { Color, Euler, Matrix4, Quaternion, Scene, Vector3 } from "three";
import { POD_FRAME_LAYOUT, POD_HALF, POD_HEIGHT, POD_PANEL, POD_PANELS, POD_PLATE, createPodFxAssets } from "./client-map-3d-construction-pod-assets.js";
import { createDroneDrawer, type DeliveryAnchor } from "./client-map-3d-construction-drone-draw.js";
import {
  POD_CHAMBER_Y,
  POD_UNPACK_MS,
  bump,
  dronePositionAt,
  droneStageAt,
  easeOutBack,
  easeOutCubic,
  planPodFlight,
  podCratesDelivered,
  podPositionAt,
  podPrintedAt,
  podStageAt,
  podSwingAt,
  smoothstep,
  window01,
  type DroneStage,
  type PodStage
} from "./client-map-3d-construction-pod-flight.js";
import { createPodInstanceWriter } from "./client-map-3d-construction-pod-writer.js";

// A parts delivery arriving at a construction site (docs/construction-animation-plan.md): at each
// new phase the owner's AFC fabricates the next batch of parts and its courier drone flies them to
// the site's parts stack. The beats (timeline in client-map-3d-construction-pod-flight.ts):
//   - the drone spools up on the AFC's crown and drops its winch line into the glass chamber,
//     where the AFC prints the pod, a scan ring climbing it as the core flares;
//   - the winch draws the pod up out of the glowing crown until it hangs under the drone;
//   - the drone flies a banked arc like a quadcopter, the pod swinging on its line as it speeds
//     up and brakes, a shadow following both;
//   - over the site it holds a hover, its landing light on the stack and its rotor wash swirling
//     dust, and winches the pod down onto the stack;
//   - the line lets go and reels in, the drone turns for home and docks in the AFC's crown; the
//     pod's lid pops, its walls fold open and the empty frame collapses, leaving the crates (which
//     the stack keeps hidden until the pod is down: see awaitingDelivery).
// Everything is fabricated at the AFC and carried over at low altitude; nothing is built in orbit.
// A site whose AFC is unknown simply gets no delivery.
const MAX_PODS = 24;

type PodEntry = DeliveryAnchor & {
  // The site the pod is delivering to, so a rebuild can follow it (see relocate).
  readonly siteKey: string;
  landX: number;
  landY: number;
  landZ: number;
  readonly startedAt: number;
};

export type ConstructionPodSnapshot = {
  readonly siteKey: string;
  readonly stage: PodStage;
  readonly droneStage: DroneStage;
  // The pod's bottom centre, scene coordinates.
  readonly x: number;
  readonly y: number;
  readonly z: number;
  // The drone's hull centre, scene coordinates.
  readonly drone: { readonly x: number; readonly y: number; readonly z: number };
};

export type PodSpawnOptions = {
  // Longest the outbound trip may take (podTransitBudgetMs of the site's phase); unlimited when omitted.
  readonly maxTransitMs?: number;
  // Fixes the per-delivery variation (blade angles, blinks, dust); random when omitted. Storybook
  // re-spawns every frame to scrub, so it must pin this or everything flickers.
  readonly seed?: number;
};

export type ConstructionPodFxLayer = {
  // `from` is where the delivery starts relative to the landing point: the AFC's offset.
  readonly spawn: (siteKey: string, landX: number, landZ: number, surfaceY: number, nowMs: number, from: { readonly dx: number; readonly dz: number }, options?: PodSpawnOptions) => void;
  // A rebuild re-anchors the scene, so the same site lands somewhere else in scene units: move its
  // deliveries (still in flight or landing) to the new landing point.
  readonly relocate: (siteKey: string, landX: number, landZ: number, surfaceY: number) => void;
  // Drop the deliveries of every site the last rebuild did not lay out (scrolled away, or finished).
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
const WHITE = new Color(1, 1, 1);
const xAxis = new Vector3(1, 0, 0);
const yAxis = new Vector3(0, 1, 0);

export const createConstructionPodFxLayer = (scene: Scene): ConstructionPodFxLayer => {
  const { meshes, dispose: disposeAssets } = createPodFxAssets(scene, MAX_PODS);
  const writer = createPodInstanceWriter(meshes);
  const drawDrone = createDroneDrawer();
  const entries: PodEntry[] = [];
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
  const at = { x: 0, y: 0, z: 0 };
  const droneAt = { x: 0, y: 0, z: 0 };

  const spawn: ConstructionPodFxLayer["spawn"] = (siteKey, landX, landZ, surfaceY, nowMs, from, options) => {
    if (entries.length >= MAX_PODS) return;
    const plan = planPodFlight(from.dx, from.dz, options?.maxTransitMs);
    entries.push({ siteKey, landX, landY: surfaceY, landZ, startedAt: nowMs, plan, seed: options?.seed ?? Math.random() * 1_000 });
  };

  // The pod: brass frame, four steel walls hinged at the base, the beacon on the lid. It hangs from
  // the drone's line (tilted by its swing) until it is set down, then opens.
  const drawPod = (entry: PodEntry, age: number, since: number): void => {
    const { plan, seed } = entry;
    podPositionAt(plan, age, at);
    const printed = podPrintedAt(plan, age);
    const squash = 0.08 * bump(since / 160);
    euler.set(podSwingAt(plan, age), plan.heading, 0);
    quat.setFromEuler(euler);
    pod.compose(pos.set(entry.landX + at.x, entry.landY + at.y, entry.landZ + at.z), quat, scl.set(1 + 0.4 * squash, (1 - squash) * printed, 1 + 0.4 * squash));

    // Unpacking waits for the line to let go of the lid.
    const lidOff = window01(since, 200, 280);
    const postsDown = smoothstep(window01(since, 460, 260));
    const collapse = smoothstep(window01(since, 720, 320));
    for (let part = 0; part < POD_FRAME_LAYOUT.length; part += 1) {
      const [px, y, pz, sx, sy, sz] = POD_FRAME_LAYOUT[part]!;
      let py = y, k = 1, ky = 1;
      partQuat.identity();
      if (part === 1) {
        // The lid pops off, spinning, and shrinks away.
        py += 0.17 * easeOutCubic(lidOff);
        partQuat.setFromAxisAngle(yAxis, 1.3 * lidOff);
        k = 1 - smoothstep(window01(since, 320, 180));
      } else if (part >= 2) {
        // Corner posts retract into the base.
        ky = 1 - postsDown;
        py = POD_PLATE + (sy * ky) / 2;
      } else k = 1 - collapse;
      if (k <= 0 || ky <= 0) continue;
      local.compose(pos.set(px, py, pz), partQuat, scl.set(sx * k, sy * ky * (part === 0 ? 1 : k), sz * k));
      writer.put("frame", world.multiplyMatrices(pod, local));
    }

    const open = 1.52 * easeOutBack(window01(since, 260, 380));
    const panelScale = 1 - collapse;
    if (panelScale > 0) {
      for (let j = 0; j < POD_PANELS; j += 1) {
        // Hinged along the base plate's edge, the wall swings out and down about its bottom edge.
        hinge.makeRotationY((j * Math.PI) / 2);
        local.compose(pos.set(0, POD_PLATE, POD_HALF - POD_PANEL.thickness / 2), partQuat.setFromAxisAngle(xAxis, open), scl.set(panelScale, panelScale, panelScale));
        writer.put("panel", world.multiplyMatrices(pod, hinge.multiply(local)));
      }
    }

    if ((age + seed) % 480 < 170 && since < 200 && printed > 0.98) {
      local.makeTranslation(0, POD_HEIGHT + 0.008, 0);
      writer.put("beacon", world.multiplyMatrices(pod, local));
    }
  };

  // Around the pod: the AFC printing it, its shadow, and the touchdown.
  const drawPodEffects = (entry: PodEntry, age: number, since: number): void => {
    const { plan, landX, landY, landZ } = entry;
    const printed = podPrintedAt(plan, age);
    const sinceHoist = age - plan.hoistAtMs;

    // Fabrication: the chamber's core flares as the pod is printed, a scan ring climbing the pod,
    // and fades as the winch draws it out.
    const flare = sinceHoist < 0 ? 0.15 + 0.5 * printed : 0.65 * (1 - window01(sinceHoist, 0, 360));
    writer.putAt("puff", landX + plan.fromX, landY + 0.46, landZ + plan.fromZ, 0.1 + 0.06 * printed, CYAN, flare);
    if (sinceHoist < 0) writer.putAt("ring", landX + plan.fromX, landY + POD_CHAMBER_Y + printed * POD_HEIGHT, landZ + plan.fromZ, POD_HALF * 1.6, HOT_CYAN, 0.9 * Math.min(1, printed * 8));

    // The pod's own small shadow, once it is out from under the AFC.
    podPositionAt(plan, age, at);
    const clearOfAfc = Math.min(1, Math.hypot(at.x - plan.fromX, at.z - plan.fromZ) / 1.1);
    const shadow = 0.5 * Math.max(0, 1 - at.y / 2.4) * clearOfAfc * (1 - smoothstep(window01(since, 720, 300)));
    writer.putAt("shadow", landX + at.x, landY + 0.011, landZ + at.z, POD_HALF * 2.6 * (1 + 0.5 * at.y), WHITE, shadow);

    // Touchdown: a soft flash and a ring.
    if (since >= 0) {
      const flash = window01(since, 0, 260);
      writer.putAt("glow", landX, landY + 0.014, landZ, 0.36 + 0.24 * flash, HOT_CYAN, 0.5 * (1 - flash));
      const ring = window01(since, 0, 700);
      writer.putAt("ring", landX, landY + 0.013, landZ, 0.1 + 0.45 * easeOutCubic(ring), CYAN, 0.4 * (1 - ring) ** 1.6);
    }
  };

  const update = (nowMs: number): void => {
    // The common case is no delivery at all: skip the buffer syncs.
    if (entries.length === 0 && !drewLastFrame) return;
    writer.begin();
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      // The frame's timestamp can precede the spawn time by a few ms: never run the delivery backwards.
      const age = Math.max(0, nowMs - entry.startedAt);
      if (age >= entry.plan.endAtMs) {
        entries.splice(i, 1);
        continue;
      }
      const since = age - entry.plan.touchdownAtMs;
      if (since < POD_UNPACK_MS) {
        drawPod(entry, age, since);
        drawPodEffects(entry, age, since);
      }
      drawDrone(writer, entry, age);
    }
    writer.end();
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
      dronePositionAt(entry.plan, age, droneAt);
      return {
        siteKey: entry.siteKey,
        stage: podStageAt(entry.plan, age),
        droneStage: droneStageAt(entry.plan, age),
        x: entry.landX + at.x,
        y: entry.landY + at.y,
        z: entry.landZ + at.z,
        drone: { x: entry.landX + droneAt.x, y: entry.landY + droneAt.y, z: entry.landZ + droneAt.z }
      };
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
