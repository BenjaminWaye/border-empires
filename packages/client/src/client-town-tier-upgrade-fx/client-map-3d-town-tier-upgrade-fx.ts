import { AdditiveBlending, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, OctahedronGeometry, RingGeometry, type Object3D } from "three";
import {
  sparkNoise,
  townTierCelebrationFrame,
  townTierCelebrationProfile,
  townTierSparkAt,
  type TownPopulationTier,
  type TownTierCelebrationProfile
} from "./client-town-tier-upgrade-fx.js";

// True-3D celebration when a town steps up a population tier: a bright core
// flash, a light column rising from the town, staggered golden shockwaves
// rolling out over the ground and sparks spiralling upward. Every element
// scales with the new tier (see townTierCelebrationProfile), so a Monumental
// City lands much harder than a fresh Town. 2D counterpart:
// client-map-2d-town-tier-upgrade.ts.

type Entry = {
  readonly group: Group;
  readonly profile: TownTierCelebrationProfile;
  readonly seed: number;
  readonly rings: Mesh[];
  readonly flash: Mesh;
  readonly pillar: Mesh;
  readonly pillarCore: Mesh;
  readonly sparks: Mesh[];
  readonly materials: MeshBasicMaterial[];
  readonly startedAt: number;
};

export type TownTierUpgradeFxLayer = {
  readonly group: Group;
  /** startedAt is performance.now() ms of when the celebration began (may be in the past). */
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number, tier: TownPopulationTier, startedAt: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

const MAX_ACTIVE = 8;

export const createTownTierUpgradeFxLayer = (scene: Object3D): TownTierUpgradeFxLayer => {
  const group = new Group();
  group.name = "town-tier-upgrade-fx";
  scene.add(group);

  const ringGeometry = new RingGeometry(0.86, 1, 48);
  const flashGeometry = new CylinderGeometry(0.55, 0.55, 0.03, 24);
  const pillarGeometry = new CylinderGeometry(0.32, 0.42, 1, 24, 1, true);
  pillarGeometry.translate(0, 0.5, 0);
  const pillarCoreGeometry = new CylinderGeometry(0.1, 0.16, 1, 12, 1, true);
  pillarCoreGeometry.translate(0, 0.5, 0);
  const sparkGeometry = new OctahedronGeometry(0.05, 0);

  const entries: Entry[] = [];

  const material = (color: string): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });

  const disposeEntry = (entry: Entry): void => {
    group.remove(entry.group);
    for (const mat of entry.materials) mat.dispose();
  };

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number, tier: TownPopulationTier, startedAt: number): void => {
    const profile = townTierCelebrationProfile(tier);
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY + 0.02, sceneZ);
    const materials: MeshBasicMaterial[] = [];
    const track = (mat: MeshBasicMaterial): MeshBasicMaterial => (materials.push(mat), mat);

    const rings: Mesh[] = [];
    for (let i = 0; i < profile.rings; i += 1) {
      const ring = new Mesh(ringGeometry, track(material(i % 2 === 0 ? profile.color : profile.accent)));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.015 + i * 0.002;
      ring.visible = false;
      entryGroup.add(ring);
      rings.push(ring);
    }
    const flash = new Mesh(flashGeometry, track(material(profile.accent)));
    flash.position.y = 0.03;
    entryGroup.add(flash);
    const pillar = new Mesh(pillarGeometry, track(material(profile.color)));
    entryGroup.add(pillar);
    const pillarCore = new Mesh(pillarCoreGeometry, track(material(profile.accent)));
    entryGroup.add(pillarCore);
    const sparkMaterials = [track(material(profile.color)), track(material(profile.accent))];
    const sparks: Mesh[] = [];
    for (let i = 0; i < profile.sparks; i += 1) {
      const spark = new Mesh(sparkGeometry, sparkMaterials[i % 2]!);
      spark.visible = false;
      entryGroup.add(spark);
      sparks.push(spark);
    }
    entryGroup.renderOrder = 20;
    group.add(entryGroup);
    entries.push({ group: entryGroup, profile, seed: Math.round(sceneX * 131 + sceneZ * 17) + tier.length, rings, flash, pillar, pillarCore, sparks, materials, startedAt });
    while (entries.length > MAX_ACTIVE) disposeEntry(entries.shift()!);
  };

  const update = (nowMs: number): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      const { profile } = entry;
      const frame = townTierCelebrationFrame(profile, nowMs - entry.startedAt);
      if (!frame) {
        disposeEntry(entry);
        entries.splice(i, 1);
        continue;
      }
      frame.rings.forEach((ring, index) => {
        const mesh = entry.rings[index]!;
        mesh.visible = ring.alpha > 0;
        const radius = 0.2 + ring.radius * profile.ringRadiusTiles;
        mesh.scale.set(radius, radius, 1);
        (mesh.material as MeshBasicMaterial).opacity = ring.alpha * 0.85;
      });
      const flashScale = 0.6 + (1 - frame.flash) * 1.4;
      entry.flash.scale.set(flashScale, 1, flashScale);
      (entry.flash.material as MeshBasicMaterial).opacity = frame.flash * 0.9;
      const height = Math.max(0.001, frame.pillarGrow * profile.pillarHeightTiles);
      const breathe = 1 + Math.sin(frame.t * Math.PI * 6) * 0.06;
      entry.pillar.scale.set(breathe, height, breathe);
      entry.pillarCore.scale.set(1, height * 1.08, 1);
      (entry.pillar.material as MeshBasicMaterial).opacity = frame.pillarAlpha * 0.32;
      (entry.pillarCore.material as MeshBasicMaterial).opacity = frame.pillarAlpha * 0.7;
      for (const mat of [entry.sparks[0]?.material, entry.sparks[1]?.material]) {
        if (mat) (mat as MeshBasicMaterial).opacity = frame.sparkAlpha;
      }
      entry.sparks.forEach((spark, index) => {
        const s = townTierSparkAt(profile, entry.seed, index, frame.t);
        spark.visible = s.size > 0;
        spark.position.set(Math.cos(s.angle) * s.drift, 0.1 + s.rise, Math.sin(s.angle) * s.drift);
        const twinkle = 0.7 + 0.3 * Math.sin(nowMs * 0.02 + sparkNoise(entry.seed, index) * 10);
        spark.scale.setScalar(s.size * twinkle);
        spark.rotation.y = nowMs * 0.004 + index;
      });
    }
  };

  const clear = (): void => {
    for (const entry of entries) disposeEntry(entry);
    entries.length = 0;
  };

  const dispose = (): void => {
    clear();
    ringGeometry.dispose();
    flashGeometry.dispose();
    pillarGeometry.dispose();
    pillarCoreGeometry.dispose();
    sparkGeometry.dispose();
    scene.remove(group);
  };

  return { group, spawn, update, clear, dispose };
};
