import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  Scene,
  TorusGeometry
} from "three";

const DURATION_MS = 2200;
const LOCK_END_MS = 420;
const SCAN_END_MS = 1250;
const DOSSIER_END_MS = 1680;
const SHARD_COUNT = 7;

type DataShard = {
  readonly mesh: Mesh;
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly delay: number;
};

type RevealStatsEntry = {
  readonly group: Group;
  readonly targetRing: Mesh;
  readonly scanA: Mesh;
  readonly scanB: Mesh;
  readonly scanComb: Mesh;
  readonly dossierBack: Mesh;
  readonly dossierLineA: Mesh;
  readonly dossierLineB: Mesh;
  readonly dossierLineC: Mesh;
  readonly flash: Mesh;
  readonly shards: DataShard[];
  readonly startedAt: number;
  readonly surfaceY: number;
};

export type RevealEmpireStatsFxLayer = {
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

export const createRevealEmpireStatsFxLayer = (scene: Scene): RevealEmpireStatsFxLayer => {
  const group = new Group();
  group.name = "reveal-empire-stats-fx";
  scene.add(group);

  const targetRingGeometry = new TorusGeometry(0.48, 0.011, 8, 42);
  const scanRingGeometry = new RingGeometry(0.16, 0.22, 36);
  const combGeometry = new PlaneGeometry(0.8, 0.04);
  const dossierBackGeometry = new PlaneGeometry(0.36, 0.48);
  const dossierLineGeometry = new PlaneGeometry(0.22, 0.018);
  const flashGeometry = new RingGeometry(0.12, 0.46, 36);
  const shardGeometry = new BoxGeometry(0.035, 0.18, 0.01);

  const entries: RevealStatsEntry[] = [];

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

    const targetRing = new Mesh(targetRingGeometry, makeMaterial("#a7f3ff", 0));
    targetRing.rotation.x = Math.PI / 2;
    entryGroup.add(targetRing);

    const scanA = new Mesh(scanRingGeometry, makeMaterial("#72e8ff", 0));
    scanA.rotation.x = -Math.PI / 2;
    scanA.position.y = 0.018;
    const scanB = new Mesh(scanRingGeometry, makeMaterial("#f7cf75", 0));
    scanB.rotation.x = -Math.PI / 2;
    scanB.position.y = 0.024;
    entryGroup.add(scanA, scanB);

    const scanComb = new Mesh(combGeometry, makeMaterial("#bff8ff", 0));
    scanComb.rotation.x = -Math.PI / 2;
    scanComb.position.y = 0.05;
    entryGroup.add(scanComb);

    const dossierBack = new Mesh(dossierBackGeometry, makeMaterial("#dffbff", 0));
    dossierBack.position.y = 0.78;
    dossierBack.rotation.x = -0.15;
    entryGroup.add(dossierBack);

    const dossierLineA = new Mesh(dossierLineGeometry, makeMaterial("#0e2b35", 0));
    const dossierLineB = new Mesh(dossierLineGeometry, makeMaterial("#0e2b35", 0));
    const dossierLineC = new Mesh(dossierLineGeometry, makeMaterial("#0e2b35", 0));
    dossierLineA.position.set(0, 0.88, 0.006);
    dossierLineB.position.set(0, 0.78, 0.006);
    dossierLineC.position.set(0, 0.68, 0.006);
    dossierLineA.scale.x = 0.75;
    dossierLineB.scale.x = 0.92;
    dossierLineC.scale.x = 0.55;
    for (const line of [dossierLineA, dossierLineB, dossierLineC]) {
      line.rotation.x = -0.15;
      entryGroup.add(line);
    }

    const flash = new Mesh(flashGeometry, makeMaterial("#f6d27a", 0));
    flash.rotation.x = -Math.PI / 2;
    flash.position.y = 0.04;
    entryGroup.add(flash);

    const shards: DataShard[] = [];
    for (let i = 0; i < SHARD_COUNT; i += 1) {
      const t = i / Math.max(1, SHARD_COUNT - 1);
      const mesh = new Mesh(shardGeometry, makeMaterial(i % 2 === 0 ? "#9df3ff" : "#f5d27a", 0));
      mesh.position.set(-0.28 + t * 0.56, 0.1, (i % 3 - 1) * 0.05);
      entryGroup.add(mesh);
      shards.push({
        mesh,
        offsetX: -0.28 + t * 0.56,
        offsetZ: (i % 3 - 1) * 0.05,
        delay: i * 42
      });
    }

    group.add(entryGroup);
    entries.push({
      group: entryGroup,
      targetRing,
      scanA,
      scanB,
      scanComb,
      dossierBack,
      dossierLineA,
      dossierLineB,
      dossierLineC,
      flash,
      shards,
      startedAt: performance.now(),
      surfaceY
    });
  };

  const disposeEntry = (entry: RevealStatsEntry): void => {
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
      const scanT = clamp01((age - LOCK_END_MS) / (SCAN_END_MS - LOCK_END_MS));
      const dossierT = clamp01((age - SCAN_END_MS) / (DOSSIER_END_MS - SCAN_END_MS));
      const fadeT = clamp01((age - DOSSIER_END_MS) / (DURATION_MS - DOSSIER_END_MS));

      entry.targetRing.scale.setScalar(1.2 - easeOut(lockT) * 0.2);
      entry.targetRing.rotation.z = age / 520;
      setOpacity(entry.targetRing.material, age < DOSSIER_END_MS ? 0.88 * (1 - dossierT * 0.45) : 0.45 * (1 - fadeT));

      entry.scanA.scale.setScalar(0.7 + easeOut(scanT) * 2.2);
      entry.scanB.scale.setScalar(0.45 + easeOut(clamp01(scanT - 0.2)) * 2.4);
      setOpacity(entry.scanA.material, age >= LOCK_END_MS ? 0.42 * (1 - scanT) : 0);
      setOpacity(entry.scanB.material, age >= LOCK_END_MS + 160 ? 0.36 * (1 - scanT) : 0);

      entry.scanComb.position.z = -0.42 + scanT * 0.84;
      entry.scanComb.scale.x = 0.65 + Math.sin(age / 80) * 0.08;
      setOpacity(entry.scanComb.material, age >= LOCK_END_MS && age < SCAN_END_MS ? 0.7 : 0);

      const dossierOpacity = age >= SCAN_END_MS ? 0.86 * (1 - fadeT) : 0;
      entry.dossierBack.position.y = 0.64 + easeOut(dossierT) * 0.18;
      entry.dossierBack.scale.setScalar(0.75 + easeOut(dossierT) * 0.25);
      setOpacity(entry.dossierBack.material, dossierOpacity);
      setOpacity(entry.dossierLineA.material, dossierOpacity * 0.9);
      setOpacity(entry.dossierLineB.material, dossierOpacity * 0.9);
      setOpacity(entry.dossierLineC.material, dossierOpacity * 0.9);

      entry.flash.scale.setScalar(0.8 + dossierT * 1.9);
      setOpacity(entry.flash.material, age >= SCAN_END_MS ? 0.5 * (1 - dossierT) : 0);

      for (const shard of entry.shards) {
        const shardT = clamp01((age - LOCK_END_MS - shard.delay) / 760);
        const lift = easeOut(shardT);
        shard.mesh.position.set(shard.offsetX * (1 - dossierT * 0.55), 0.1 + lift * 0.68, shard.offsetZ * (1 - dossierT));
        shard.mesh.rotation.y += 0.07;
        shard.mesh.rotation.x = 0.25 + shardT * 0.55;
        setOpacity(shard.mesh.material, age >= LOCK_END_MS + shard.delay ? 0.78 * (1 - fadeT) : 0);
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
    scanRingGeometry.dispose();
    combGeometry.dispose();
    dossierBackGeometry.dispose();
    dossierLineGeometry.dispose();
    flashGeometry.dispose();
    shardGeometry.dispose();
  };

  return { group, spawn, update, clear, dispose };
};
