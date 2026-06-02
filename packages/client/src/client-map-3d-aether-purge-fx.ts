import {
  AdditiveBlending,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  Scene,
  TorusGeometry
} from "three";

const DURATION_MS = 2300;
const TARGET_LOCK_MS = 280;
const CHARGE_END_MS = 720;
const IMPACT_END_MS = 980;
const AFTERGLOW_END_MS = DURATION_MS;
const BEAM_HEIGHT = 6.2;
const MOTE_COUNT = 12;

type ControlMote = {
  readonly mesh: Mesh;
  readonly dx: number;
  readonly dz: number;
  readonly speed: number;
  readonly lift: number;
};

type PurgeEntry = {
  readonly group: Group;
  readonly targetRing: Mesh;
  readonly arcA: Mesh;
  readonly arcB: Mesh;
  readonly chargeColumn: Mesh;
  readonly beam: Mesh;
  readonly neutralRing: Mesh;
  readonly afterglow: Mesh;
  readonly motes: ControlMote[];
  readonly startedAt: number;
  readonly surfaceY: number;
};

export type AetherPurgeFxLayer = {
  readonly group: Group;
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

const setOpacity = (material: Mesh["material"], opacity: number): void => {
  if (Array.isArray(material)) return;
  (material as MeshBasicMaterial).opacity = Math.max(0, Math.min(1, opacity));
};

export const createAetherPurgeFxLayer = (scene: Scene): AetherPurgeFxLayer => {
  const group = new Group();
  group.name = "aether-purge-fx";
  scene.add(group);

  const targetRingGeometry = new TorusGeometry(0.44, 0.012, 8, 36);
  const arcGeometry = new TorusGeometry(0.54, 0.01, 6, 18, Math.PI * 1.25);
  const chargeGeometry = new CylinderGeometry(0.12, 0.05, BEAM_HEIGHT, 10, 1, true);
  const beamGeometry = new CylinderGeometry(0.035, 0.026, BEAM_HEIGHT, 8, 1, true);
  const neutralGeometry = new TorusGeometry(0.18, 0.018, 8, 32);
  const afterglowGeometry = new RingGeometry(0.14, 0.38, 24);
  const moteGeometry = new OctahedronGeometry(0.045, 0);

  const entries: PurgeEntry[] = [];

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
    entryGroup.position.set(sceneX, surfaceY + 0.02, sceneZ);

    const targetRing = new Mesh(targetRingGeometry, makeMaterial("#95edff", 0.95));
    targetRing.rotation.x = Math.PI / 2;
    entryGroup.add(targetRing);

    const arcA = new Mesh(arcGeometry, makeMaterial("#bdf7ff", 0.9));
    arcA.rotation.x = Math.PI / 2;
    const arcB = new Mesh(arcGeometry, makeMaterial("#73dcff", 0.8));
    arcB.rotation.x = Math.PI / 2;
    arcB.rotation.z = Math.PI;
    entryGroup.add(arcA, arcB);

    const chargeColumn = new Mesh(chargeGeometry, makeMaterial("#78e7ff", 0));
    chargeColumn.position.y = BEAM_HEIGHT / 2;
    entryGroup.add(chargeColumn);

    const beam = new Mesh(beamGeometry, makeMaterial("#f3fdff", 0));
    beam.position.y = BEAM_HEIGHT / 2;
    entryGroup.add(beam);

    const neutralRing = new Mesh(neutralGeometry, makeMaterial("#f4fbff", 0));
    neutralRing.rotation.x = Math.PI / 2;
    neutralRing.position.y = 0.05;
    entryGroup.add(neutralRing);

    const afterglow = new Mesh(afterglowGeometry, makeMaterial("#4fd3e9", 0));
    afterglow.rotation.x = -Math.PI / 2;
    afterglow.position.y = 0.035;
    entryGroup.add(afterglow);

    const motes: ControlMote[] = [];
    for (let i = 0; i < MOTE_COUNT; i += 1) {
      const angle = (i / MOTE_COUNT) * Math.PI * 2 + (i % 3) * 0.17;
      const mesh = new Mesh(moteGeometry, makeMaterial(i % 2 === 0 ? "#7ee8ff" : "#f6d27a", 0));
      mesh.position.set(Math.cos(angle) * 0.34, 0.08, Math.sin(angle) * 0.34);
      entryGroup.add(mesh);
      motes.push({
        mesh,
        dx: Math.cos(angle),
        dz: Math.sin(angle),
        speed: 0.28 + (i % 4) * 0.045,
        lift: 0.18 + (i % 5) * 0.035
      });
    }

    group.add(entryGroup);
    entries.push({
      group: entryGroup,
      targetRing,
      arcA,
      arcB,
      chargeColumn,
      beam,
      neutralRing,
      afterglow,
      motes,
      startedAt: performance.now(),
      surfaceY
    });
  };

  const disposeEntry = (entry: PurgeEntry): void => {
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

      const lockT = Math.min(1, age / TARGET_LOCK_MS);
      const chargeT = Math.min(1, Math.max(0, (age - TARGET_LOCK_MS) / (CHARGE_END_MS - TARGET_LOCK_MS)));
      const impactT = Math.min(1, Math.max(0, (age - CHARGE_END_MS) / (IMPACT_END_MS - CHARGE_END_MS)));
      const fadeT = Math.min(1, Math.max(0, (age - IMPACT_END_MS) / (AFTERGLOW_END_MS - IMPACT_END_MS)));

      entry.targetRing.scale.setScalar(1.15 - lockT * 0.15);
      entry.arcA.rotation.z = age / 260;
      entry.arcB.rotation.z = Math.PI - age / 310;
      setOpacity(entry.targetRing.material, age < IMPACT_END_MS ? 0.95 * (1 - impactT) : 0);
      setOpacity(entry.arcA.material, age < CHARGE_END_MS ? 0.85 : 0.85 * (1 - impactT));
      setOpacity(entry.arcB.material, age < CHARGE_END_MS ? 0.75 : 0.75 * (1 - impactT));

      const chargeScale = 0.35 + chargeT * 0.65;
      entry.chargeColumn.scale.set(chargeScale, 1, chargeScale);
      setOpacity(entry.chargeColumn.material, age < CHARGE_END_MS ? chargeT * 0.32 : 0.32 * (1 - impactT));

      const beamOpacity = age >= CHARGE_END_MS && age <= IMPACT_END_MS ? Math.sin(impactT * Math.PI) : 0;
      entry.beam.scale.set(1 + beamOpacity * 0.6, 1, 1 + beamOpacity * 0.6);
      setOpacity(entry.beam.material, beamOpacity);

      const neutralScale = 0.65 + impactT * 2.7;
      entry.neutralRing.scale.set(neutralScale, neutralScale, neutralScale);
      setOpacity(entry.neutralRing.material, age >= CHARGE_END_MS ? 0.78 * (1 - impactT) : 0);

      entry.afterglow.scale.setScalar(1 + fadeT * 0.22);
      setOpacity(entry.afterglow.material, age >= CHARGE_END_MS ? 0.32 * (1 - fadeT) : 0);

      const moteT = Math.min(1, Math.max(0, (age - CHARGE_END_MS) / 900));
      for (const shard of entry.motes) {
        const pull = 0.34 * (1 - moteT * 0.82);
        shard.mesh.position.set(shard.dx * pull, 0.08 + shard.lift * moteT + shard.speed * moteT, shard.dz * pull);
        shard.mesh.rotation.x += 0.08;
        shard.mesh.rotation.y += 0.11;
        setOpacity(shard.mesh.material, age >= CHARGE_END_MS ? 0.75 * (1 - moteT) : 0);
      }
      entry.group.position.y = entry.surfaceY + 0.02;
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
    arcGeometry.dispose();
    chargeGeometry.dispose();
    beamGeometry.dispose();
    neutralGeometry.dispose();
    afterglowGeometry.dispose();
    moteGeometry.dispose();
  };

  return { group, spawn, update, clear, dispose };
};
