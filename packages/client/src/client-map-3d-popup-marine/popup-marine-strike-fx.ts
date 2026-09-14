// Opening "warning shot" for the pop-up-marine battle overlay: a vivid
// blue-to-violet lance strikes down onto the battle tile in the last beat of
// the approach march, landing right as the firefight (CLASH_MS) begins — the
// visual beat between a squad closing on the target and the clash actually
// starting. Purely cosmetic and, like the rest of this system, a pure
// function of elapsed time: `update(nowMs)` derives every value from age
// alone, so scrubbing the timeline or rejoining a siege mid-approach
// reproduces the same strike instead of replaying a stateful emitter.
//
// True-3D renderer only — see popup-marine-overlay-fx.ts's own note on why
// the 2D canvas renderer has no equivalent battle animation.
import { AdditiveBlending, CylinderGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, Scene } from "three";

/** How long before the firefight starts the beam begins its descent. */
export const STRIKE_LEAD_MS = 650;
const IMPACT_FLASH_MS = 140;
const IMPACT_TAIL_MS = 260;
/** Total lifetime of one strike — timed so the impact lands exactly at the
 * moment CLASH_MS begins (see STRIKE_LEAD_MS usage in popup-marine-overlay-fx.ts). */
export const STRIKE_TOTAL_MS = STRIKE_LEAD_MS + IMPACT_FLASH_MS + IMPACT_TAIL_MS;

const BEAM_DROP_HEIGHT = 2.4;

type StrikeEntry = {
  readonly group: Group;
  readonly beam: Mesh;
  readonly beamCore: Mesh;
  readonly ring: Mesh;
  readonly flash: Mesh;
  readonly startedAt: number;
};

export type BattleStrikeFxLayer = {
  readonly group: Group;
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number, nowMs: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeIn = (t: number): number => t * t;
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

const setOpacity = (material: Mesh["material"], opacity: number): void => {
  if (Array.isArray(material)) return;
  (material as MeshBasicMaterial).opacity = clamp01(opacity);
};

/**
 * A single-shot vertical lance (violet sheath + cyan-blue core, matching the
 * siege-tower overlay's own beam palette) that races down onto a tile and
 * ends in a bright impact flash + expanding ring — the "shot that kicks off
 * the battle" beat, distinct from the empire-colored bolts marines trade
 * once the firefight itself is underway (popup-marine-bolts.ts).
 */
export const createBattleStrikeFxLayer = (scene: Scene): BattleStrikeFxLayer => {
  const group = new Group();
  group.name = "battle-strike-fx";
  scene.add(group);

  const beamGeometry = new CylinderGeometry(0.05, 0.05, 1, 8, 1, true);
  const beamCoreGeometry = new CylinderGeometry(0.022, 0.022, 1, 8, 1, true);
  const ringGeometry = new RingGeometry(0.08, 0.34, 24);
  const flashGeometry = new CylinderGeometry(0.4, 0.4, 0.04, 16);

  const entries: StrikeEntry[] = [];

  const makeMat = (color: string): MeshBasicMaterial =>
    new MeshBasicMaterial({ toneMapped: false, color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number, nowMs: number): void => {
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY, sceneZ);

    const beam = new Mesh(beamGeometry, makeMat("#7a3bff"));
    entryGroup.add(beam);
    const beamCore = new Mesh(beamCoreGeometry, makeMat("#4de2ff"));
    entryGroup.add(beamCore);

    const ring = new Mesh(ringGeometry, makeMat("#8b5cff"));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    entryGroup.add(ring);

    const flash = new Mesh(flashGeometry, makeMat("#c9b8ff"));
    flash.position.y = 0.02;
    entryGroup.add(flash);

    group.add(entryGroup);
    entries.push({ group: entryGroup, beam, beamCore, ring, flash, startedAt: nowMs });
  };

  const disposeEntry = (entry: StrikeEntry): void => {
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
      if (age >= STRIKE_TOTAL_MS) {
        disposeEntry(entry);
        entries.splice(i, 1);
        continue;
      }

      // Descent: the beam's bottom races from BEAM_DROP_HEIGHT down to the
      // tile surface, easing in so the final approach reads fast/sudden.
      const descendT = clamp01(age / STRIKE_LEAD_MS);
      const bottomY = BEAM_DROP_HEIGHT * (1 - easeIn(descendT));
      const height = Math.max(0.02, BEAM_DROP_HEIGHT - bottomY);
      const midY = (BEAM_DROP_HEIGHT + bottomY) / 2;
      entry.beam.position.y = midY;
      entry.beam.scale.set(1, height, 1);
      entry.beamCore.position.y = midY;
      entry.beamCore.scale.set(1, height, 1);

      const impactAge = age - STRIKE_LEAD_MS;
      const beamFadeT = impactAge < 0 ? 0 : clamp01(impactAge / IMPACT_FLASH_MS);
      setOpacity(entry.beam.material, 0.55 * (1 - beamFadeT));
      setOpacity(entry.beamCore.material, 0.9 * (1 - beamFadeT));

      if (impactAge < 0) {
        setOpacity(entry.flash.material, 0);
        setOpacity(entry.ring.material, 0);
        continue;
      }
      const flashT = clamp01(impactAge / IMPACT_FLASH_MS);
      const tailT = clamp01((impactAge - IMPACT_FLASH_MS) / IMPACT_TAIL_MS);
      setOpacity(entry.flash.material, impactAge < IMPACT_FLASH_MS ? 0.9 * (1 - flashT) : 0);
      const ringScale = 1 + easeOut(tailT) * 2;
      entry.ring.scale.set(ringScale, ringScale, ringScale);
      setOpacity(entry.ring.material, impactAge < IMPACT_FLASH_MS ? 0.9 : 0.9 * (1 - tailT));
    }
  };

  const clear = (): void => {
    while (entries.length > 0) disposeEntry(entries.pop()!);
  };

  const dispose = (): void => {
    clear();
    scene.remove(group);
    beamGeometry.dispose();
    beamCoreGeometry.dispose();
    ringGeometry.dispose();
    flashGeometry.dispose();
  };

  return { group, spawn, update, clear, dispose };
};
