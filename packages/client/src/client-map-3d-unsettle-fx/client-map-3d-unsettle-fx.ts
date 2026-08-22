import { AdditiveBlending, ConeGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, Scene } from "three";

// Total lifetime of one unsettle effect: a quick amber warning flash, then the
// border ring collapses inward (mirroring grantAnchorToBorder's expanding
// pulse in reverse) while a pylon shape sinks and fades into the ground.
const DURATION_MS = 1600;
const FLASH_END_MS = 260;
const SINK_DEPTH = 0.9;

type UnsettleEntry = {
  readonly group: Group;
  readonly ring: Mesh;
  readonly pylon: Mesh;
  readonly startedAt: number;
};

export type UnsettleFxLayer = {
  readonly group: Group;
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeIn = (value: number): number => value * value;
const easeOut = (value: number): number => 1 - (1 - value) * (1 - value);

const setOpacity = (material: Mesh["material"], opacity: number): void => {
  if (Array.isArray(material)) return;
  (material as MeshBasicMaterial).opacity = clamp01(opacity);
};

/**
 * One-shot "unsettle" collapse effect: plays at a tile the instant it flips
 * SETTLED -> FRONTIER because a rival's reach overtook it (see
 * runtime-reach-border-apply.ts's "unsettle transition"). Distinct from
 * createMonumentPulseFxLayer's outward activation pulse -- this reads as loss:
 * a warning ring that collapses inward while a pylon shape sinks and dims,
 * rather than an expanding burst.
 */
export const createUnsettleFxLayer = (scene: Scene): UnsettleFxLayer => {
  const group = new Group();
  group.name = "unsettle-fx";
  scene.add(group);

  const ringGeometry = new RingGeometry(0.1, 0.42, 32);
  const pylonGeometry = new ConeGeometry(0.28, 0.7, 6);

  const entries: UnsettleEntry[] = [];

  const makeMaterial = (color: string, opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number): void => {
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY + 0.02, sceneZ);

    const ring = new Mesh(ringGeometry, makeMaterial("#ffb347", 0));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    entryGroup.add(ring);

    const pylon = new Mesh(pylonGeometry, makeMaterial("#ff5533", 0));
    pylon.position.y = 0.45;
    entryGroup.add(pylon);

    group.add(entryGroup);
    entries.push({ group: entryGroup, ring, pylon, startedAt: performance.now() });
  };

  const disposeEntry = (entry: UnsettleEntry): void => {
    group.remove(entry.group);
    entry.group.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      if (Array.isArray(child.material)) {
        for (const material of child.material) material.dispose();
      } else {
        child.material.dispose();
      }
    });
  };

  const update = (nowMs: number): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      const age = nowMs - entry.startedAt;
      if (age >= DURATION_MS) {
        disposeEntry(entry);
        entries.splice(i, 1);
        continue;
      }

      const flashT = clamp01(age / FLASH_END_MS);
      const collapseT = clamp01((age - FLASH_END_MS) / (DURATION_MS - FLASH_END_MS));

      // Ring: flashes up to full size, then shrinks inward to nothing.
      const ringScale = Math.max(0.02, 1 - easeIn(collapseT));
      entry.ring.scale.set(ringScale, ringScale, ringScale);
      const ringOpacity = age < FLASH_END_MS ? 0.9 * flashT : 0.9 * (1 - collapseT);
      setOpacity(entry.ring.material, ringOpacity);

      // Pylon: sinks straight down into the ground while dimming out.
      entry.pylon.position.y = 0.45 - easeOut(collapseT) * SINK_DEPTH;
      const pylonOpacity = age < FLASH_END_MS ? 0.85 * flashT : 0.85 * (1 - collapseT);
      setOpacity(entry.pylon.material, pylonOpacity);
    }
  };

  const clear = (): void => {
    while (entries.length > 0) {
      disposeEntry(entries.pop()!);
    }
  };

  const dispose = (): void => {
    clear();
    scene.remove(group);
    ringGeometry.dispose();
    pylonGeometry.dispose();
  };

  return { group, spawn, update, clear, dispose };
};
