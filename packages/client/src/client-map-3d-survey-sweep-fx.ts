import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  Scene,
  TorusGeometry
} from "three";

const DURATION_MS = 2600;
const LOCK_END_MS = 360;
const SWEEP_END_MS = 1680;
const RESOLVE_END_MS = 2180;
const MARKER_COUNT = 10;

type SurveyMarker = {
  readonly mesh: Mesh;
  readonly angle: number;
  readonly radius: number;
  readonly delay: number;
};

type SurveySweepEntry = {
  readonly group: Group;
  readonly lockRing: Mesh;
  readonly compassA: Mesh;
  readonly compassB: Mesh;
  readonly revealDisc: Mesh;
  readonly sweepBeamA: Mesh;
  readonly sweepBeamB: Mesh;
  readonly waveA: Mesh;
  readonly waveB: Mesh;
  readonly tickMarks: Mesh[];
  readonly markers: SurveyMarker[];
  readonly startedAt: number;
  readonly surfaceY: number;
};

export type SurveySweepFxLayer = {
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

export const createSurveySweepFxLayer = (scene: Scene): SurveySweepFxLayer => {
  const group = new Group();
  group.name = "survey-sweep-fx";
  scene.add(group);

  const lockRingGeometry = new TorusGeometry(0.48, 0.012, 8, 48);
  const compassGeometry = new RingGeometry(0.22, 0.25, 48);
  const revealDiscGeometry = new CircleGeometry(0.54, 48);
  const sweepBeamGeometry = new PlaneGeometry(1.25, 0.08);
  const waveGeometry = new RingGeometry(0.18, 0.22, 54);
  const tickGeometry = new BoxGeometry(0.035, 0.018, 0.16);
  const markerGeometry = new BoxGeometry(0.055, 0.12, 0.055);

  const entries: SurveySweepEntry[] = [];

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

    const lockRing = new Mesh(lockRingGeometry, makeMaterial("#b8f8ff", 0));
    lockRing.rotation.x = Math.PI / 2;
    entryGroup.add(lockRing);

    const compassA = new Mesh(compassGeometry, makeMaterial("#88ecff", 0));
    compassA.rotation.x = -Math.PI / 2;
    compassA.position.y = 0.034;
    const compassB = new Mesh(compassGeometry, makeMaterial("#f2d26f", 0));
    compassB.rotation.x = -Math.PI / 2;
    compassB.position.y = 0.04;
    entryGroup.add(compassA, compassB);

    const revealDisc = new Mesh(revealDiscGeometry, makeMaterial("#1fb6d8", 0));
    revealDisc.rotation.x = -Math.PI / 2;
    revealDisc.position.y = 0.018;
    entryGroup.add(revealDisc);

    const sweepBeamA = new Mesh(sweepBeamGeometry, makeMaterial("#cbfbff", 0));
    sweepBeamA.rotation.x = -Math.PI / 2;
    sweepBeamA.position.y = 0.052;
    const sweepBeamB = new Mesh(sweepBeamGeometry, makeMaterial("#f5d778", 0));
    sweepBeamB.rotation.x = -Math.PI / 2;
    sweepBeamB.position.y = 0.058;
    entryGroup.add(sweepBeamA, sweepBeamB);

    const waveA = new Mesh(waveGeometry, makeMaterial("#92f1ff", 0));
    waveA.rotation.x = -Math.PI / 2;
    waveA.position.y = 0.046;
    const waveB = new Mesh(waveGeometry, makeMaterial("#f4d06d", 0));
    waveB.rotation.x = -Math.PI / 2;
    waveB.position.y = 0.05;
    entryGroup.add(waveA, waveB);

    const tickMarks: Mesh[] = [];
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const tick = new Mesh(tickGeometry, makeMaterial(i % 2 === 0 ? "#dffcff" : "#f5d778", 0));
      tick.position.set(Math.cos(angle) * 0.43, 0.07, Math.sin(angle) * 0.43);
      tick.rotation.y = -angle;
      entryGroup.add(tick);
      tickMarks.push(tick);
    }

    const markers: SurveyMarker[] = [];
    for (let i = 0; i < MARKER_COUNT; i += 1) {
      const angle = (i / MARKER_COUNT) * Math.PI * 2 + (i % 2) * 0.18;
      const marker = new Mesh(markerGeometry, makeMaterial(i % 3 === 0 ? "#f5d778" : "#8ff1ff", 0));
      entryGroup.add(marker);
      markers.push({
        mesh: marker,
        angle,
        radius: 0.26 + (i % 4) * 0.08,
        delay: i * 58
      });
    }

    group.add(entryGroup);
    entries.push({
      group: entryGroup,
      lockRing,
      compassA,
      compassB,
      revealDisc,
      sweepBeamA,
      sweepBeamB,
      waveA,
      waveB,
      tickMarks,
      markers,
      startedAt: performance.now(),
      surfaceY
    });
  };

  const disposeEntry = (entry: SurveySweepEntry): void => {
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
      const sweepT = clamp01((age - LOCK_END_MS) / (SWEEP_END_MS - LOCK_END_MS));
      const resolveT = clamp01((age - SWEEP_END_MS) / (RESOLVE_END_MS - SWEEP_END_MS));
      const fadeT = clamp01((age - RESOLVE_END_MS) / (DURATION_MS - RESOLVE_END_MS));
      const sweepEase = easeOut(sweepT);

      entry.lockRing.scale.setScalar(1.22 - easeOut(lockT) * 0.22);
      entry.lockRing.rotation.z = age / 520;
      setOpacity(entry.lockRing.material, age < SWEEP_END_MS ? 0.86 * (1 - sweepT * 0.18) : 0.52 * (1 - fadeT));

      entry.compassA.rotation.z = age / 460;
      entry.compassB.rotation.z = -age / 640;
      entry.compassA.scale.setScalar(0.72 + sweepEase * 1.55);
      entry.compassB.scale.setScalar(0.56 + easeOut(clamp01(sweepT - 0.15)) * 1.65);
      setOpacity(entry.compassA.material, age >= LOCK_END_MS ? 0.52 * (1 - resolveT * 0.5) : 0);
      setOpacity(entry.compassB.material, age >= LOCK_END_MS + 120 ? 0.42 * (1 - resolveT * 0.5) : 0);

      entry.revealDisc.scale.setScalar(0.35 + sweepEase * 2.75);
      setOpacity(entry.revealDisc.material, age >= LOCK_END_MS ? 0.18 * (1 - fadeT) : 0);

      const beamSpin = age / 310;
      entry.sweepBeamA.rotation.z = beamSpin;
      entry.sweepBeamB.rotation.z = beamSpin + Math.PI / 2;
      entry.sweepBeamA.scale.x = 0.55 + sweepEase * 1.65;
      entry.sweepBeamB.scale.x = 0.42 + sweepEase * 1.3;
      setOpacity(entry.sweepBeamA.material, age >= LOCK_END_MS && age < RESOLVE_END_MS ? 0.68 * (1 - resolveT * 0.4) : 0);
      setOpacity(entry.sweepBeamB.material, age >= LOCK_END_MS + 180 && age < RESOLVE_END_MS ? 0.42 * (1 - resolveT * 0.3) : 0);

      entry.waveA.scale.setScalar(0.55 + sweepEase * 4.1);
      entry.waveB.scale.setScalar(0.34 + easeOut(clamp01(sweepT - 0.28)) * 4.25);
      setOpacity(entry.waveA.material, age >= LOCK_END_MS ? 0.48 * (1 - sweepT) : 0);
      setOpacity(entry.waveB.material, age >= LOCK_END_MS + 260 ? 0.36 * (1 - sweepT) : 0);

      for (let tickIndex = 0; tickIndex < entry.tickMarks.length; tickIndex += 1) {
        const tick = entry.tickMarks[tickIndex]!;
        const tickT = clamp01((age - tickIndex * 35) / 520);
        tick.scale.y = 0.65 + Math.sin(age / 90 + tickIndex) * 0.22;
        setOpacity(tick.material, tickT * 0.72 * (1 - fadeT));
      }

      for (const marker of entry.markers) {
        const markerT = clamp01((age - LOCK_END_MS - marker.delay) / 920);
        const markerEase = easeOut(markerT);
        const radius = marker.radius + markerEase * 0.58;
        const orbit = marker.angle + age / 1200;
        marker.mesh.position.set(Math.cos(orbit) * radius, 0.08 + markerEase * 0.34, Math.sin(orbit) * radius);
        marker.mesh.rotation.y = -orbit;
        marker.mesh.rotation.x += 0.05;
        setOpacity(marker.mesh.material, age >= LOCK_END_MS + marker.delay ? 0.82 * (1 - fadeT) : 0);
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
    lockRingGeometry.dispose();
    compassGeometry.dispose();
    revealDiscGeometry.dispose();
    sweepBeamGeometry.dispose();
    waveGeometry.dispose();
    tickGeometry.dispose();
    markerGeometry.dispose();
  };

  return { group, spawn, update, clear, dispose };
};
