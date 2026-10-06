import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  Scene,
  Vector3
} from "three";

// A parts pod arriving at a construction site (docs/construction-animation-plan.md): at each
// new phase the owner's AFC fabricates the next batch of parts and flies them out in a
// short cyan-trailed arc to the site's parts stack, where the restocked crates take over.
// Everything is fabricated at the AFC and carried over; nothing is built in orbit, so there
// is no drop-from-orbit variant. A site whose AFC is unknown simply gets no pod.
const MIN_FLIGHT_MS = 900;
const MS_PER_TILE = 170;
const MAX_FLIGHT_MS = 3200;
const LAUNCH_FLASH_MS = 320;
const LAND_FLASH_MS = 220;
const RING_MS = 600;
const MAX_PODS = 24;
const POD_SIZE = 0.11;
const TRAIL_LENGTH = 0.55;
// Height the pod leaves the AFC at, and the arc's peak above the straight line.
const LAUNCH_Y = 0.3;
const MIN_PEAK = 0.45;
const PEAK_PER_TILE = 0.16;
const MAX_PEAK = 2.4;

type PodEntry = {
  readonly group: Group;
  readonly pod: Mesh;
  readonly trail: Mesh;
  readonly launch: Mesh;
  readonly flash: Mesh;
  readonly ring: Mesh;
  readonly podMaterial: MeshStandardMaterial;
  readonly trailMaterial: MeshBasicMaterial;
  readonly launchMaterial: MeshBasicMaterial;
  readonly flashMaterial: MeshBasicMaterial;
  readonly ringMaterial: MeshBasicMaterial;
  readonly startedAt: number;
  // Launch point relative to the landing point (scene units on the ground plane).
  readonly fromX: number;
  readonly fromZ: number;
  readonly flightMs: number;
  readonly peak: number;
};

export type ConstructionPodFxLayer = {
  // `from` is where the pod launches relative to the landing point: the AFC's offset.
  readonly spawn: (landX: number, landZ: number, surfaceY: number, nowMs: number, from: { readonly dx: number; readonly dz: number }) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly activeCount: () => number;
  readonly dispose: () => void;
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeInOut = (t: number): number => t * t * (3 - 2 * t);

export const createConstructionPodFxLayer = (scene: Scene): ConstructionPodFxLayer => {
  const podGeometry = new BoxGeometry(POD_SIZE, POD_SIZE * 0.8, POD_SIZE);
  const trailGeometry = new CylinderGeometry(0.012, 0.03, 1, 8, 1, true); // thin end trails behind the pod
  const launchGeometry = new CylinderGeometry(0.2, 0.2, 0.02, 14);
  const flashGeometry = new CylinderGeometry(0.16, 0.16, 0.02, 14);
  const ringGeometry = new RingGeometry(0.06, 0.1, 24);
  ringGeometry.rotateX(-Math.PI / 2);
  const entries: PodEntry[] = [];
  const yAxis = new Vector3(0, 1, 0);
  const dir = new Vector3();
  const here = new Vector3();
  const before = new Vector3();
  const quat = new Quaternion();

  const additive = (opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color: "#4fd8ff", transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });

  const remove = (entry: PodEntry): void => {
    scene.remove(entry.group);
    entry.podMaterial.dispose();
    entry.trailMaterial.dispose();
    entry.launchMaterial.dispose();
    entry.flashMaterial.dispose();
    entry.ringMaterial.dispose();
  };

  const spawn: ConstructionPodFxLayer["spawn"] = (landX, landZ, surfaceY, nowMs, from) => {
    if (entries.length >= MAX_PODS) return;
    const distance = Math.hypot(from.dx, from.dz);
    const group = new Group();
    group.position.set(landX, surfaceY, landZ);
    const podMaterial = new MeshStandardMaterial({ color: "#46505c", emissive: "#4fd8ff", emissiveIntensity: 0.7, roughness: 0.5, metalness: 0.5, flatShading: true });
    const trailMaterial = additive(0.9);
    const launchMaterial = additive(0);
    const flashMaterial = additive(0);
    const ringMaterial = additive(0);
    const pod = new Mesh(podGeometry, podMaterial);
    const trail = new Mesh(trailGeometry, trailMaterial);
    const launch = new Mesh(launchGeometry, launchMaterial);
    const flash = new Mesh(flashGeometry, flashMaterial);
    const ring = new Mesh(ringGeometry, ringMaterial);
    launch.position.set(from.dx, 0.01, from.dz); // the flash where the AFC fabricates and launches it
    flash.position.y = 0.01;
    ring.position.y = 0.012;
    group.add(pod, trail, launch, flash, ring);
    scene.add(group);
    entries.push({
      group, pod, trail, launch, flash, ring,
      podMaterial, trailMaterial, launchMaterial, flashMaterial, ringMaterial,
      startedAt: nowMs,
      fromX: from.dx,
      fromZ: from.dz,
      flightMs: Math.min(MAX_FLIGHT_MS, MIN_FLIGHT_MS + MS_PER_TILE * distance),
      peak: Math.min(MAX_PEAK, MIN_PEAK + PEAK_PER_TILE * distance)
    });
  };

  // Pod position (local to the landing point) at flight progress t in 0..1.
  const podAt = (entry: PodEntry, t: number, out: Vector3): Vector3 => {
    const e = easeInOut(t);
    return out.set(entry.fromX * (1 - e), LAUNCH_Y * (1 - e) + POD_SIZE * 0.4 * e + entry.peak * 4 * e * (1 - e), entry.fromZ * (1 - e));
  };

  const update = (nowMs: number): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      const age = nowMs - entry.startedAt;
      if (age >= entry.flightMs + RING_MS + 50) {
        remove(entry);
        entries.splice(i, 1);
        continue;
      }
      entry.launchMaterial.opacity = 0.8 * (1 - clamp01(age / LAUNCH_FLASH_MS));
      if (age < entry.flightMs) {
        const t = age / entry.flightMs;
        podAt(entry, t, here);
        entry.pod.visible = true;
        entry.pod.position.copy(here);
        // The trail streams behind the pod, along its direction of travel.
        podAt(entry, Math.max(0, t - 0.04), before);
        dir.subVectors(before, here);
        if (dir.lengthSq() > 1e-8) {
          dir.normalize();
          quat.setFromUnitVectors(yAxis, dir);
          entry.trail.visible = true;
          entry.trail.quaternion.copy(quat);
          entry.trail.scale.set(1, TRAIL_LENGTH, 1);
          entry.trail.position.copy(here).addScaledVector(dir, TRAIL_LENGTH / 2);
          entry.trailMaterial.opacity = 0.85;
        }
      } else {
        // Touchdown: the pod is spent (the restocked crates take over) in a quick flash and an expanding ring.
        entry.pod.visible = false;
        entry.trail.visible = false;
        const since = age - entry.flightMs;
        entry.flashMaterial.opacity = 0.85 * (1 - clamp01(since / LAND_FLASH_MS));
        const ringT = clamp01(since / RING_MS);
        entry.ring.scale.setScalar(1 + ringT * 4);
        entry.ringMaterial.opacity = 0.7 * (1 - ringT);
      }
    }
  };

  const clear = (): void => {
    for (const entry of entries) remove(entry);
    entries.length = 0;
  };

  const dispose = (): void => {
    clear();
    podGeometry.dispose();
    trailGeometry.dispose();
    launchGeometry.dispose();
    flashGeometry.dispose();
    ringGeometry.dispose();
  };

  return { spawn, update, clear, activeCount: () => entries.length, dispose };
};
