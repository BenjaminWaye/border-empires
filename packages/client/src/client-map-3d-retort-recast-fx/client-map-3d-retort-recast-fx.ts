import {
  AdditiveBlending,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry
} from "three";

export type RetortRecastFxResource = "FARM" | "WOOD" | "IRON" | "GEMS";

const DURATION_MS = 2600;
const CIRCLE_LOCK_MS = 520;
const TRANSMUTE_END_MS = 1500;
const SETTLE_END_MS = DURATION_MS;
const ORB_COUNT = 8;

const RESOURCE_COLORS: Record<RetortRecastFxResource, { primary: string; secondary: string; dark: string }> = {
  FARM: { primary: "#74f28a", secondary: "#f5d76a", dark: "#1d3c25" },
  WOOD: { primary: "#d2a45f", secondary: "#78e0a0", dark: "#3a2a18" },
  IRON: { primary: "#c7d2dc", secondary: "#6f89a2", dark: "#27303a" },
  GEMS: { primary: "#71e9ff", secondary: "#cc8cff", dark: "#172d3a" }
};

type Orb = {
  readonly mesh: Mesh;
  readonly angle: number;
  readonly radius: number;
  readonly height: number;
};

type RetortEntry = {
  readonly group: Group;
  readonly outerRing: Mesh;
  readonly innerRing: Mesh;
  readonly wash: Mesh;
  readonly retortStem: Mesh;
  readonly retortBulb: Mesh;
  readonly catalyst: Mesh;
  readonly resourceCore: Mesh;
  readonly shards: Mesh[];
  readonly orbs: Orb[];
  readonly startedAt: number;
  readonly surfaceY: number;
};

export type RetortRecastFxLayer = {
  readonly group: Group;
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number, targetResource: RetortRecastFxResource) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOut = (value: number): number => 1 - (1 - value) * (1 - value);

const setOpacity = (material: Mesh["material"], opacity: number): void => {
  if (Array.isArray(material)) return;
  (material as MeshBasicMaterial).opacity = clamp01(opacity);
};

export const createRetortRecastFxLayer = (scene: Scene): RetortRecastFxLayer => {
  const group = new Group();
  group.name = "retort-recast-fx";
  scene.add(group);

  const outerRingGeometry = new TorusGeometry(0.5, 0.012, 8, 48);
  const innerRingGeometry = new RingGeometry(0.18, 0.42, 36);
  const washGeometry = new CircleGeometry(0.52, 36);
  const stemGeometry = new CylinderGeometry(0.035, 0.05, 0.62, 10, 1, true);
  const bulbGeometry = new SphereGeometry(0.16, 12, 8);
  const catalystGeometry = new TorusGeometry(0.17, 0.012, 8, 24);
  const coreGeometry = new OctahedronGeometry(0.09, 0);
  const shardGeometry = new OctahedronGeometry(0.035, 0);
  const orbGeometry = new SphereGeometry(0.025, 8, 6);

  const entries: RetortEntry[] = [];

  const makeMaterial = (color: string, opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthWrite: false
    });

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number, targetResource: RetortRecastFxResource): void => {
    const palette = RESOURCE_COLORS[targetResource];
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY + 0.025, sceneZ);

    const outerRing = new Mesh(outerRingGeometry, makeMaterial(palette.secondary, 0));
    outerRing.rotation.x = Math.PI / 2;
    entryGroup.add(outerRing);

    const innerRing = new Mesh(innerRingGeometry, makeMaterial(palette.primary, 0));
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.012;
    entryGroup.add(innerRing);

    const wash = new Mesh(washGeometry, makeMaterial(palette.dark, 0));
    wash.rotation.x = -Math.PI / 2;
    wash.position.y = 0.01;
    entryGroup.add(wash);

    const retortStem = new Mesh(stemGeometry, makeMaterial("#dffaff", 0));
    retortStem.position.y = 0.45;
    retortStem.rotation.z = -0.22;
    entryGroup.add(retortStem);

    const retortBulb = new Mesh(bulbGeometry, makeMaterial("#f3feff", 0));
    retortBulb.position.set(0.1, 0.77, 0);
    entryGroup.add(retortBulb);

    const catalyst = new Mesh(catalystGeometry, makeMaterial(palette.primary, 0));
    catalyst.position.y = 0.78;
    catalyst.rotation.x = Math.PI / 2;
    entryGroup.add(catalyst);

    const resourceCore = new Mesh(coreGeometry, makeMaterial(palette.primary, 0));
    resourceCore.position.y = 0.78;
    entryGroup.add(resourceCore);

    const shards: Mesh[] = [];
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      const shard = new Mesh(shardGeometry, makeMaterial(i % 2 === 0 ? palette.primary : palette.secondary, 0));
      shard.position.set(Math.cos(angle) * 0.16, 0.09, Math.sin(angle) * 0.16);
      entryGroup.add(shard);
      shards.push(shard);
    }

    const orbs: Orb[] = [];
    for (let i = 0; i < ORB_COUNT; i += 1) {
      const orb = new Mesh(orbGeometry, makeMaterial(i % 2 === 0 ? palette.primary : palette.secondary, 0));
      entryGroup.add(orb);
      orbs.push({
        mesh: orb,
        angle: (i / ORB_COUNT) * Math.PI * 2,
        radius: 0.26 + (i % 2) * 0.05,
        height: 0.55 + (i % 3) * 0.08
      });
    }

    group.add(entryGroup);
    entries.push({
      group: entryGroup,
      outerRing,
      innerRing,
      wash,
      retortStem,
      retortBulb,
      catalyst,
      resourceCore,
      shards,
      orbs,
      startedAt: performance.now(),
      surfaceY
    });
  };

  const disposeEntry = (entry: RetortEntry): void => {
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

      const circleT = clamp01(age / CIRCLE_LOCK_MS);
      const transmuteT = clamp01((age - CIRCLE_LOCK_MS) / (TRANSMUTE_END_MS - CIRCLE_LOCK_MS));
      const settleT = clamp01((age - TRANSMUTE_END_MS) / (SETTLE_END_MS - TRANSMUTE_END_MS));
      const circleEase = easeOut(circleT);
      const transmuteEase = easeOut(transmuteT);

      entry.outerRing.scale.setScalar(0.55 + circleEase * 0.65);
      entry.outerRing.rotation.z = age / 900;
      setOpacity(entry.outerRing.material, age < TRANSMUTE_END_MS ? 0.9 : 0.9 * (1 - settleT));

      entry.innerRing.scale.setScalar(0.7 + transmuteEase * 0.35);
      entry.innerRing.rotation.z = -age / 720;
      setOpacity(entry.innerRing.material, age < TRANSMUTE_END_MS ? 0.34 + transmuteT * 0.28 : 0.5 * (1 - settleT));

      entry.wash.scale.setScalar(0.35 + transmuteEase * 1.3);
      setOpacity(entry.wash.material, age >= CIRCLE_LOCK_MS ? 0.42 * (1 - settleT) : 0);

      const glassOpacity = age < TRANSMUTE_END_MS ? circleT * 0.42 : 0.42 * (1 - settleT);
      entry.retortStem.scale.set(1 + transmuteT * 0.18, 1, 1 + transmuteT * 0.18);
      setOpacity(entry.retortStem.material, glassOpacity);
      entry.retortBulb.scale.setScalar(0.65 + circleT * 0.35 + Math.sin(age / 90) * 0.035);
      setOpacity(entry.retortBulb.material, glassOpacity);

      entry.catalyst.rotation.z = age / 180;
      entry.catalyst.scale.setScalar(0.7 + Math.sin(age / 110) * 0.08 + transmuteT * 0.35);
      setOpacity(entry.catalyst.material, age < TRANSMUTE_END_MS ? transmuteT : 0.8 * (1 - settleT));

      entry.resourceCore.rotation.x += 0.08;
      entry.resourceCore.rotation.y += 0.12;
      entry.resourceCore.scale.setScalar(0.4 + transmuteEase * 1.2);
      setOpacity(entry.resourceCore.material, age >= CIRCLE_LOCK_MS ? 0.95 * (1 - settleT * 0.35) : 0);

      for (let shardIndex = 0; shardIndex < entry.shards.length; shardIndex += 1) {
        const shard = entry.shards[shardIndex]!;
        const angle = (shardIndex / entry.shards.length) * Math.PI * 2 + age / 360;
        const radius = 0.18 + transmuteEase * 0.36;
        shard.position.set(Math.cos(angle) * radius, 0.08 + Math.sin(transmuteT * Math.PI) * 0.16, Math.sin(angle) * radius);
        shard.rotation.x += 0.09;
        shard.rotation.y += 0.07;
        setOpacity(shard.material, age >= CIRCLE_LOCK_MS ? 0.85 * (1 - settleT) : 0);
      }

      for (const orb of entry.orbs) {
        const angle = orb.angle + age / 330;
        const lift = Math.sin(age / 170 + orb.angle) * 0.05;
        orb.mesh.position.set(Math.cos(angle) * orb.radius, orb.height + lift, Math.sin(angle) * orb.radius);
        setOpacity(orb.mesh.material, age < TRANSMUTE_END_MS ? transmuteT * 0.75 : 0.75 * (1 - settleT));
      }

      entry.group.position.y = entry.surfaceY + 0.025;
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
    outerRingGeometry.dispose();
    innerRingGeometry.dispose();
    washGeometry.dispose();
    stemGeometry.dispose();
    bulbGeometry.dispose();
    catalystGeometry.dispose();
    coreGeometry.dispose();
    shardGeometry.dispose();
    orbGeometry.dispose();
  };

  return { group, spawn, update, clear, dispose };
};
