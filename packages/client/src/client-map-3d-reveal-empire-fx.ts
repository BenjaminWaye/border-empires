import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry
} from "three";

const DURATION_MS = 2600;
const LOCK_END_MS = 280;
const BEACON_END_MS = 1540;
const REVEAL_END_MS = 2120;
const FRAGMENT_COUNT = 8;

type MapFragment = {
  readonly mesh: Mesh;
  readonly angle: number;
  readonly radius: number;
  readonly delay: number;
};

type RevealEmpireEntry = {
  readonly group: Group;
  readonly targetRing: Mesh;
  readonly beaconTrail: Mesh;
  readonly beaconCore: Mesh;
  readonly beaconGlow: Mesh;
  readonly haloA: Mesh;
  readonly haloB: Mesh;
  readonly revealRingA: Mesh;
  readonly revealRingB: Mesh;
  readonly mapBand: Mesh;
  readonly fragments: MapFragment[];
  readonly startedAt: number;
  readonly surfaceY: number;
};

export type RevealEmpireFxLayer = {
  readonly group: Group;
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number) => void;
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

export const createRevealEmpireFxLayer = (scene: Scene): RevealEmpireFxLayer => {
  const group = new Group();
  group.name = "reveal-empire-fx";
  scene.add(group);

  const targetRingGeometry = new TorusGeometry(0.46, 0.012, 8, 42);
  const beaconTrailGeometry = new CylinderGeometry(0.025, 0.09, 1, 10, 1, true);
  const beaconCoreGeometry = new SphereGeometry(0.095, 16, 10);
  const beaconGlowGeometry = new SphereGeometry(0.18, 16, 10);
  const haloGeometry = new TorusGeometry(0.34, 0.012, 8, 36);
  const revealRingGeometry = new RingGeometry(0.18, 0.23, 42);
  const mapBandGeometry = new PlaneGeometry(0.74, 0.06);
  const fragmentGeometry = new BoxGeometry(0.08, 0.012, 0.06);

  const entries: RevealEmpireEntry[] = [];

  const makeMaterial = (color: string, opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthWrite: false
    });

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number): void => {
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY + 0.025, sceneZ);

    const targetRing = new Mesh(targetRingGeometry, makeMaterial("#9df3ff", 0));
    targetRing.rotation.x = Math.PI / 2;
    entryGroup.add(targetRing);

    const beaconTrail = new Mesh(beaconTrailGeometry, makeMaterial("#79e9ff", 0));
    beaconTrail.position.y = 0.5;
    entryGroup.add(beaconTrail);

    const beaconCore = new Mesh(beaconCoreGeometry, makeMaterial("#d8fbff", 0));
    beaconCore.position.y = 0.24;
    entryGroup.add(beaconCore);

    const beaconGlow = new Mesh(beaconGlowGeometry, makeMaterial("#6be8ff", 0));
    beaconGlow.position.y = 0.24;
    entryGroup.add(beaconGlow);

    const haloA = new Mesh(haloGeometry, makeMaterial("#d8fbff", 0));
    haloA.position.y = 0.24;
    haloA.rotation.x = Math.PI / 2;
    const haloB = new Mesh(haloGeometry, makeMaterial("#f4ca6a", 0));
    haloB.position.y = 0.24;
    haloB.rotation.x = Math.PI / 2;
    entryGroup.add(haloA, haloB);

    const revealRingA = new Mesh(revealRingGeometry, makeMaterial("#8af1ff", 0));
    revealRingA.rotation.x = -Math.PI / 2;
    revealRingA.position.y = 0.045;
    const revealRingB = new Mesh(revealRingGeometry, makeMaterial("#f2cc72", 0));
    revealRingB.rotation.x = -Math.PI / 2;
    revealRingB.position.y = 0.052;
    entryGroup.add(revealRingA, revealRingB);

    const mapBand = new Mesh(mapBandGeometry, makeMaterial("#c8f8ff", 0));
    mapBand.rotation.x = -Math.PI / 2;
    mapBand.position.y = 0.07;
    entryGroup.add(mapBand);

    const fragments: MapFragment[] = [];
    for (let i = 0; i < FRAGMENT_COUNT; i += 1) {
      const angle = (i / FRAGMENT_COUNT) * Math.PI * 2;
      const mesh = new Mesh(fragmentGeometry, makeMaterial(i % 2 === 0 ? "#9af3ff" : "#f0c86d", 0));
      mesh.position.y = 0.1;
      entryGroup.add(mesh);
      fragments.push({ mesh, angle, radius: 0.24 + (i % 3) * 0.08, delay: i * 48 });
    }

    group.add(entryGroup);
    entries.push({
      group: entryGroup,
      targetRing,
      beaconTrail,
      beaconCore,
      beaconGlow,
      haloA,
      haloB,
      revealRingA,
      revealRingB,
      mapBand,
      fragments,
      startedAt: performance.now(),
      surfaceY
    });
  };

  const disposeEntry = (entry: RevealEmpireEntry): void => {
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

      const lockT = clamp01(age / LOCK_END_MS);
      const beaconT = clamp01((age - LOCK_END_MS) / (BEACON_END_MS - LOCK_END_MS));
      const revealT = clamp01((age - BEACON_END_MS) / (REVEAL_END_MS - BEACON_END_MS));
      const fadeT = clamp01((age - REVEAL_END_MS) / (DURATION_MS - REVEAL_END_MS));

      entry.targetRing.scale.setScalar(1.18 - easeOut(lockT) * 0.18);
      entry.targetRing.rotation.z = age / 420;
      setOpacity(entry.targetRing.material, age < REVEAL_END_MS ? 0.82 * (1 - revealT * 0.25) : 0.42 * (1 - fadeT));

      const beaconLift = easeOut(beaconT);
      const beaconY = 0.22 + beaconLift * 3.05;
      const beaconFade = age < REVEAL_END_MS ? 1 : 1 - fadeT;
      const beaconOpacity = age >= LOCK_END_MS ? Math.sin(beaconT * Math.PI * 0.86) * 0.92 * beaconFade : 0;
      entry.beaconTrail.position.y = beaconY / 2;
      entry.beaconTrail.scale.set(0.72 + beaconT * 0.55, Math.max(0.08, beaconY), 0.72 + beaconT * 0.55);
      setOpacity(entry.beaconTrail.material, beaconOpacity * 0.62);

      entry.beaconCore.position.y = beaconY;
      entry.beaconCore.scale.setScalar(0.82 + Math.sin(age / 78) * 0.18);
      setOpacity(entry.beaconCore.material, beaconOpacity);

      entry.beaconGlow.position.y = beaconY;
      entry.beaconGlow.scale.setScalar(0.85 + beaconLift * 1.35 + Math.sin(age / 96) * 0.16);
      setOpacity(entry.beaconGlow.material, beaconOpacity * 0.36);

      entry.haloA.rotation.z = age / 360;
      entry.haloB.rotation.z = -age / 480;
      entry.haloA.scale.setScalar(0.74 + easeOut(beaconT) * 0.3);
      entry.haloB.scale.setScalar(0.58 + easeOut(beaconT) * 0.42);
      entry.haloA.position.y = beaconY - 0.035;
      entry.haloB.position.y = beaconY + 0.05;
      setOpacity(entry.haloA.material, age >= LOCK_END_MS ? 0.68 * (1 - fadeT) : 0);
      setOpacity(entry.haloB.material, age >= LOCK_END_MS + 120 ? 0.48 * (1 - fadeT) : 0);

      entry.revealRingA.scale.setScalar(0.7 + easeOut(revealT) * 3.3);
      entry.revealRingB.scale.setScalar(0.42 + easeOut(clamp01(revealT - 0.18)) * 3.4);
      setOpacity(entry.revealRingA.material, age >= BEACON_END_MS ? 0.52 * (1 - revealT) : 0);
      setOpacity(entry.revealRingB.material, age >= BEACON_END_MS + 160 ? 0.38 * (1 - revealT) : 0);

      entry.mapBand.position.z = -0.39 + revealT * 0.78;
      entry.mapBand.scale.x = 0.75 + Math.sin(age / 70) * 0.08;
      setOpacity(entry.mapBand.material, age >= LOCK_END_MS && age < REVEAL_END_MS ? 0.58 * (1 - fadeT * 0.35) : 0);

      for (const fragment of entry.fragments) {
        const fragmentT = clamp01((age - LOCK_END_MS - fragment.delay) / 980);
        const orbit = fragment.angle + age / 900;
        const fragmentLift = easeOut(fragmentT);
        const radius = fragment.radius + fragmentLift * 0.34;
        fragment.mesh.position.set(Math.cos(orbit) * radius, 0.12 + fragmentLift * 1.62, Math.sin(orbit) * radius);
        fragment.mesh.rotation.y = -orbit;
        fragment.mesh.rotation.x += 0.04;
        setOpacity(fragment.mesh.material, age >= LOCK_END_MS + fragment.delay ? 0.72 * (1 - fadeT) : 0);
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
    targetRingGeometry.dispose();
    beaconTrailGeometry.dispose();
    beaconCoreGeometry.dispose();
    beaconGlowGeometry.dispose();
    haloGeometry.dispose();
    revealRingGeometry.dispose();
    mapBandGeometry.dispose();
    fragmentGeometry.dispose();
  };

  return { group, spawn, update, clear, dispose };
};
