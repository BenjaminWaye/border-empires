import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Scene
} from "three";

// A parts pod arriving at a construction site (docs/construction-animation-plan.md):
// at each build phase the AFC's fabricated materials come down from orbit in a
// short cyan streak and land on the site's parts stack, where the freshly
// restocked crates take over. Much smaller than the module-delivery effect,
// which is sized for the AFC's 3x3 footprint, not a single tile.
const DROP_HEIGHT = 3;
const DESCEND_MS = 900;
const FLASH_MS = 220;
const RING_MS = 600;
const TOTAL_MS = DESCEND_MS + RING_MS + 50;
const MAX_PODS = 24;
const POD_SIZE = 0.11;
const STREAK_LENGTH = 1.3;

type PodEntry = {
  readonly group: Group;
  readonly pod: Mesh;
  readonly streak: Mesh;
  readonly flash: Mesh;
  readonly ring: Mesh;
  readonly podMaterial: MeshStandardMaterial;
  readonly streakMaterial: MeshBasicMaterial;
  readonly flashMaterial: MeshBasicMaterial;
  readonly ringMaterial: MeshBasicMaterial;
  readonly startedAt: number;
};

export type ConstructionPodFxLayer = {
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number, nowMs: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly activeCount: () => number;
  readonly dispose: () => void;
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export const createConstructionPodFxLayer = (scene: Scene): ConstructionPodFxLayer => {
  const podGeometry = new BoxGeometry(POD_SIZE, POD_SIZE * 0.8, POD_SIZE);
  const streakGeometry = new CylinderGeometry(0.03, 0.012, 1, 8, 1, true);
  const flashGeometry = new CylinderGeometry(0.16, 0.16, 0.02, 14);
  const ringGeometry = new RingGeometry(0.06, 0.1, 24);
  ringGeometry.rotateX(-Math.PI / 2);
  const entries: PodEntry[] = [];

  const additive = (opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color: "#4fd8ff", transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });

  const remove = (entry: PodEntry): void => {
    scene.remove(entry.group);
    entry.podMaterial.dispose();
    entry.streakMaterial.dispose();
    entry.flashMaterial.dispose();
    entry.ringMaterial.dispose();
  };

  const spawn: ConstructionPodFxLayer["spawn"] = (sceneX, sceneZ, surfaceY, nowMs) => {
    if (entries.length >= MAX_PODS) return;
    const group = new Group();
    group.position.set(sceneX, surfaceY, sceneZ);
    const podMaterial = new MeshStandardMaterial({ color: "#46505c", emissive: "#4fd8ff", emissiveIntensity: 0.7, roughness: 0.5, metalness: 0.5, flatShading: true });
    const streakMaterial = additive(0.9);
    const flashMaterial = additive(0);
    const ringMaterial = additive(0);
    const pod = new Mesh(podGeometry, podMaterial);
    const streak = new Mesh(streakGeometry, streakMaterial);
    const flash = new Mesh(flashGeometry, flashMaterial);
    const ring = new Mesh(ringGeometry, ringMaterial);
    flash.position.y = 0.01;
    ring.position.y = 0.012;
    group.add(pod, streak, flash, ring);
    scene.add(group);
    entries.push({ group, pod, streak, flash, ring, podMaterial, streakMaterial, flashMaterial, ringMaterial, startedAt: nowMs });
  };

  const update = (nowMs: number): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      const age = nowMs - entry.startedAt;
      if (age >= TOTAL_MS) {
        remove(entry);
        entries.splice(i, 1);
        continue;
      }
      if (age < DESCEND_MS) {
        const t = age / DESCEND_MS;
        const y = POD_SIZE * 0.4 + (1 - t * t) * DROP_HEIGHT; // accelerates toward the stack
        entry.pod.visible = true;
        entry.pod.position.y = y;
        const length = STREAK_LENGTH * (1 - t * 0.4);
        entry.streak.visible = true;
        entry.streak.scale.set(1, length, 1);
        entry.streak.position.y = y + length / 2 + POD_SIZE * 0.4;
        entry.streakMaterial.opacity = 0.9 - t * 0.4;
      } else {
        // Touchdown: the pod is spent (the restocked crates take over) in a
        // quick flash and an expanding ring.
        entry.pod.visible = false;
        entry.streak.visible = false;
        const since = age - DESCEND_MS;
        entry.flashMaterial.opacity = 0.85 * (1 - clamp01(since / FLASH_MS));
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
    streakGeometry.dispose();
    flashGeometry.dispose();
    ringGeometry.dispose();
  };

  return { spawn, update, clear, activeCount: () => entries.length, dispose };
};
