import {
  AdditiveBlending,
  CircleGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry
} from "three";

const DURATION_MS = 2400;
const LOCK_END_MS = 430;
const DRAIN_END_MS = 1600;
const RELEASE_END_MS = DURATION_MS;
const MOTE_COUNT = 12;

type SiphonMote = {
  readonly mesh: Mesh;
  readonly angle: number;
  readonly radius: number;
  readonly delay: number;
};

type SiphonEntry = {
  readonly group: Group;
  readonly targetRing: Mesh;
  readonly drainRing: Mesh;
  readonly shadowPool: Mesh;
  readonly sinkCore: Mesh;
  readonly hooks: Mesh[];
  readonly motes: SiphonMote[];
  readonly startedAt: number;
  readonly surfaceY: number;
};

export type SiphonFxLayer = {
  readonly group: Group;
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOut = (value: number): number => 1 - (1 - value) * (1 - value);
const easeIn = (value: number): number => value * value;

const setOpacity = (material: Mesh["material"], opacity: number): void => {
  if (Array.isArray(material)) return;
  (material as MeshBasicMaterial).opacity = clamp01(opacity);
};

export const createSiphonFxLayer = (scene: Scene): SiphonFxLayer => {
  const group = new Group();
  group.name = "siphon-fx";
  scene.add(group);

  const targetRingGeometry = new TorusGeometry(0.48, 0.012, 8, 44);
  const drainRingGeometry = new RingGeometry(0.18, 0.44, 36);
  const shadowPoolGeometry = new CircleGeometry(0.5, 36);
  const sinkCoreGeometry = new SphereGeometry(0.09, 12, 8);
  const hookGeometry = new ConeGeometry(0.045, 0.22, 3);
  const moteGeometry = new SphereGeometry(0.026, 8, 6);

  const entries: SiphonEntry[] = [];

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
    entryGroup.position.set(sceneX, surfaceY + 0.024, sceneZ);

    const targetRing = new Mesh(targetRingGeometry, makeMaterial("#ff6d73", 0));
    targetRing.rotation.x = Math.PI / 2;
    entryGroup.add(targetRing);

    const drainRing = new Mesh(drainRingGeometry, makeMaterial("#46f0d2", 0));
    drainRing.rotation.x = -Math.PI / 2;
    drainRing.position.y = 0.018;
    entryGroup.add(drainRing);

    const shadowPool = new Mesh(shadowPoolGeometry, makeMaterial("#2a0711", 0));
    shadowPool.rotation.x = -Math.PI / 2;
    shadowPool.position.y = 0.01;
    entryGroup.add(shadowPool);

    const sinkCore = new Mesh(sinkCoreGeometry, makeMaterial("#f7d38a", 0));
    sinkCore.position.y = 0.46;
    entryGroup.add(sinkCore);

    const hooks: Mesh[] = [];
    for (let i = 0; i < 6; i += 1) {
      const hook = new Mesh(hookGeometry, makeMaterial(i % 2 === 0 ? "#ff5d68" : "#44e4cd", 0));
      hook.rotation.x = Math.PI / 2;
      entryGroup.add(hook);
      hooks.push(hook);
    }

    const motes: SiphonMote[] = [];
    for (let i = 0; i < MOTE_COUNT; i += 1) {
      const mesh = new Mesh(moteGeometry, makeMaterial(i % 3 === 0 ? "#f7d38a" : "#84fff0", 0));
      entryGroup.add(mesh);
      motes.push({
        mesh,
        angle: (i / MOTE_COUNT) * Math.PI * 2,
        radius: 0.28 + (i % 4) * 0.055,
        delay: i * 34
      });
    }

    group.add(entryGroup);
    entries.push({
      group: entryGroup,
      targetRing,
      drainRing,
      shadowPool,
      sinkCore,
      hooks,
      motes,
      startedAt: performance.now(),
      surfaceY
    });
  };

  const disposeEntry = (entry: SiphonEntry): void => {
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
      const drainT = clamp01((age - LOCK_END_MS) / (DRAIN_END_MS - LOCK_END_MS));
      const releaseT = clamp01((age - DRAIN_END_MS) / (RELEASE_END_MS - DRAIN_END_MS));
      const lockEase = easeOut(lockT);
      const drainEase = easeIn(drainT);

      entry.targetRing.scale.setScalar(1.28 - lockEase * 0.28 + Math.sin(age / 95) * 0.035);
      entry.targetRing.rotation.z = -age / 520;
      setOpacity(entry.targetRing.material, age < DRAIN_END_MS ? 0.88 : 0.88 * (1 - releaseT));

      entry.drainRing.scale.setScalar(1.05 - drainEase * 0.34);
      entry.drainRing.rotation.z = age / 360;
      setOpacity(entry.drainRing.material, age >= LOCK_END_MS ? 0.56 * (1 - releaseT * 0.7) : 0);

      entry.shadowPool.scale.setScalar(0.45 + lockEase * 0.8);
      setOpacity(entry.shadowPool.material, 0.5 * lockT * (1 - releaseT));

      entry.sinkCore.position.y = 0.26 + Math.sin(age / 115) * 0.035 + drainT * 0.2;
      entry.sinkCore.scale.setScalar(0.45 + drainT * 1.1 + Math.sin(age / 85) * 0.06);
      setOpacity(entry.sinkCore.material, age >= LOCK_END_MS ? 0.9 * (1 - releaseT) : 0);

      for (let hookIndex = 0; hookIndex < entry.hooks.length; hookIndex += 1) {
        const hook = entry.hooks[hookIndex]!;
        const angle = (hookIndex / entry.hooks.length) * Math.PI * 2 - age / 520;
        const radius = 0.44 - drainT * 0.16;
        hook.position.set(Math.cos(angle) * radius, 0.08 + drainT * 0.08, Math.sin(angle) * radius);
        hook.rotation.z = -angle + Math.PI / 2;
        hook.scale.setScalar(0.55 + lockT * 0.45);
        setOpacity(hook.material, age >= LOCK_END_MS ? 0.7 * (1 - releaseT) : 0);
      }

      for (const mote of entry.motes) {
        const moteT = clamp01((age - LOCK_END_MS - mote.delay) / 920);
        const angle = mote.angle + age / 260;
        const radius = mote.radius * (1 - moteT * 0.82);
        const lift = 0.06 + easeOut(moteT) * 0.56;
        mote.mesh.position.set(Math.cos(angle) * radius, lift, Math.sin(angle) * radius);
        mote.mesh.scale.setScalar(0.55 + moteT * 0.8);
        setOpacity(mote.mesh.material, age >= LOCK_END_MS + mote.delay ? 0.82 * (1 - releaseT) : 0);
      }

      entry.group.position.y = entry.surfaceY + 0.024;
    }
  };

  const clear = (): void => {
    for (const entry of entries.splice(0)) disposeEntry(entry);
  };

  const dispose = (): void => {
    clear();
    scene.remove(group);
    targetRingGeometry.dispose();
    drainRingGeometry.dispose();
    shadowPoolGeometry.dispose();
    sinkCoreGeometry.dispose();
    hookGeometry.dispose();
    moteGeometry.dispose();
  };

  return { group, spawn, update, clear, dispose };
};
