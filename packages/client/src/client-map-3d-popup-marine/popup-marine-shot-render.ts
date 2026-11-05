// Renders the two halves of a marine's shot — the laser bolt crossing to its
// target, and the spark burst where it lands — into their shared
// InstancedMeshes. Split out of popup-marine-overlay-fx.ts to keep that file
// under the repo's 500-line cap; this is a cohesive unit (everything that
// needs to know where the OPPOSING squad is standing) rather than an
// arbitrary slice.
//
// Why the two-pass shape: a bolt is drawn between two marines, so it cannot
// be written while the marines themselves are being placed — the target's
// position may not exist yet. The caller therefore gathers each side's world
// positions and shot data with `push` while it places marines, then calls
// `emit` once per battle to draw both directions. All of the timing is still
// a pure function of the frame's clock (see popup-marine-bolts.ts); nothing
// here holds state across frames beyond reused scratch objects.
//
// Umbrite rounds: a side whose empire runs an Umbrite Weapons Factory
// (popup-marine-gear.ts) fires heavier bolts -- a violet core inside an
// orange glow, thicker and longer than the standard team-coloured tracer --
// that burst into larger orange embers where they land. Same timing, same
// targets; only the look of the round changes.
import { Color, Matrix4, Quaternion, Vector3 } from "three";
import type { Scene } from "three";
import { SPARKS_PER_IMPACT, sparkShard } from "./popup-marine-bolts.js";
import type { LaserBolt, LaserImpact } from "./popup-marine-bolts.js";
import { createBoltMesh, createSparkMesh } from "./popup-marine-effect-meshes.js";

/** Bolts leave the rifle at roughly chest height rather than from the feet.
 * Impact sparks use the same height so a burst lands where the round hits. */
const MUZZLE_HEIGHT = 0.034;
// Laser bolt: a thin bar stretched along its own travel direction, so it
// reads as a tracer streak rather than a dot.
const BOLT_LENGTH = 0.02;
const BOLT_WIDTH = 0.0022;
// Impact sparks are sized well under the bolt's own footprint so a burst
// reads as a spray of specks rather than a second set of bars.
const SPARK_SIZE = 0.0026;
// How far one burst's shards travel from the hit point at full spread.
const SPARK_RADIUS = 0.016;

// Umbrite round, relative to the standard bolt: the glow is drawn first as
// a wide shell, then the narrower core inside it (both on the bolt mesh, so
// an Umbrite bolt costs two instances).
const UMBRITE_BOLT_LENGTH = 1.4;
const UMBRITE_GLOW_WIDTH = 2.8;
const UMBRITE_CORE_WIDTH = 1.5;
const UMBRITE_GLOW = new Color("#ff7a1f");
const UMBRITE_CORE = new Color("#c58cff");
// Share of the team colour mixed into the glow so the side still reads.
const UMBRITE_TEAM_TINT = 0.2;
// Ember burst: bigger shards thrown wider, burning orange rather than the
// team colour.
const UMBRITE_SPARK_SIZE = 1.8;
const UMBRITE_SPARK_RADIUS = 1.5;
const UMBRITE_EMBER = new Color("#ff8a2a");

/** Each side's round: standard tracer or Umbrite. */
export type ShotStyle = { umbrite?: boolean };
type ShotStyles = readonly [ShotStyle | undefined, ShotStyle | undefined];

const FWD_AXIS = new Vector3(0, 0, 1);
// Sparks are tiny cubes: orientation is not readable at their size, so they
// are written unrotated rather than paying for a per-shard quaternion.
const IDENTITY_QUAT = new Quaternion();
const WHITE = new Color("#ffffff");

/**
 * @param scale  MARINE_MODEL_SCALE — every length here is authored at the
 *   model's native size and scaled once, so bolts and sparks stay
 *   proportional to the marines if the model is resized.
 * @param maxBolts  Ceiling on simultaneously drawn bolts (one per in-flight
 *   fire pulse); the spark mesh gets the same ceiling times the shards a
 *   burst draws.
 */
export const createShotRenderer = (scene: Scene, scale: number, maxBolts: number) => {
  const muzzleHeight = MUZZLE_HEIGHT * scale;
  const boltLength = BOLT_LENGTH * scale;
  const sparkRadius = SPARK_RADIUS * scale;
  const maxSparks = maxBolts * SPARKS_PER_IMPACT;
  // An Umbrite bolt draws two instances (glow + core).
  const maxBoltInstances = maxBolts * 2;

  // Added in this order so the bolt mesh precedes the spark mesh in the
  // scene's children.
  const boltFx = createBoltMesh(scene, BOLT_WIDTH * scale, maxBoltInstances);
  const sparkFx = createSparkMesh(scene, SPARK_SIZE * scale, maxSparks);

  const boltFrom = new Vector3();
  const boltTo = new Vector3();
  const boltMid = new Vector3();
  const boltDir = new Vector3();
  const boltQuat = new Quaternion();
  const boltScale = new Vector3();
  const boltM = new Matrix4();
  const boltColor = new Color();
  const glowColor = new Color();
  const sparkPos = new Vector3();
  const sparkScale = new Vector3();
  const sparkM = new Matrix4();
  const sparkColor = new Color();

  // Per-battle scratch: each side's marine world positions (flat xyz triples)
  // and the shots they have in the air this frame.
  const sidePos: [number[], number[]] = [[], []];
  const sideBolts: [LaserBolt[][], LaserBolt[][]] = [[], []];
  const sideImpacts: [LaserImpact[][], LaserImpact[][]] = [[], []];

  let boltWrite = 0;
  let sparkWrite = 0;

  /** Starts a fresh battle; both sides' gathered data is discarded. */
  const beginSide = (side: 0 | 1): void => {
    sidePos[side].length = 0;
    sideBolts[side].length = 0;
    sideImpacts[side].length = 0;
  };

  /** Records one marine of `side`: where it stands, and what it has in the
   * air. Must be called in marine-index order — a bolt's targetIndex indexes
   * into the opposing side's gathered positions. */
  const push = (
    side: 0 | 1,
    x: number,
    y: number,
    z: number,
    bolts: LaserBolt[],
    impacts: LaserImpact[]
  ): void => {
    sidePos[side].push(x, y, z);
    sideBolts[side].push(bolts);
    sideImpacts[side].push(impacts);
  };

  /** Writes one bolt instance at boltMid/boltQuat. Transparent instances
   * draw in index order without depth writes, so a core written after its
   * glow shows through it. */
  const writeBolt = (width: number, streak: number, color: Color): void => {
    boltScale.set(width, width, streak);
    boltM.compose(boltMid, boltQuat, boltScale);
    boltFx.mesh.setMatrixAt(boltWrite, boltM);
    boltFx.mesh.setColorAt(boltWrite, color);
    boltWrite++;
  };

  /** Draws every in-flight bolt of one battle, both directions. Each bolt is
   * placed by lerping shooter -> target by its own progress. */
  const emitBolts = (attackerColor: string, defenderColor: string, styles: ShotStyles): void => {
    for (let side = 0 as 0 | 1; side < 2; side++) {
      const shooters = sidePos[side];
      const targets = sidePos[side === 0 ? 1 : 0];
      const bolts = sideBolts[side];
      if (targets.length === 0) continue;
      const umbrite = styles[side]?.umbrite === true;
      const length = umbrite ? boltLength * UMBRITE_BOLT_LENGTH : boltLength;
      boltColor.set(side === 0 ? attackerColor : defenderColor);
      if (umbrite) glowColor.copy(UMBRITE_GLOW).lerp(boltColor, UMBRITE_TEAM_TINT);
      for (let i = 0; i < bolts.length; i++) {
        const forMarine = bolts[i];
        if (!forMarine || forMarine.length === 0) continue;
        boltFrom.set(shooters[i * 3]!, shooters[i * 3 + 1]! + muzzleHeight, shooters[i * 3 + 2]!);
        for (const bolt of forMarine) {
          if (boltWrite + (umbrite ? 2 : 1) > maxBoltInstances) return;
          const t = Math.min(bolt.targetIndex, targets.length / 3 - 1);
          boltTo.set(targets[t * 3]!, targets[t * 3 + 1]! + muzzleHeight, targets[t * 3 + 2]!);
          boltDir.subVectors(boltTo, boltFrom);
          const dist = boltDir.length();
          if (dist < 1e-6) continue;
          boltDir.divideScalar(dist);
          // Stop the streak at the target rather than overshooting through it.
          const travelled = Math.min(bolt.progress * dist, dist);
          boltMid.copy(boltFrom).addScaledVector(boltDir, Math.max(travelled - length * 0.5, 0));
          boltQuat.setFromUnitVectors(FWD_AXIS, boltDir);
          const streak = Math.min(length, Math.max(travelled, length * 0.25));
          if (umbrite) {
            writeBolt(UMBRITE_GLOW_WIDTH, streak, glowColor);
            writeBolt(UMBRITE_CORE_WIDTH, streak, UMBRITE_CORE);
          } else {
            writeBolt(1, streak, boltColor);
          }
        }
      }
    }
  };

  /** Draws the spark burst for every bolt that has just landed. Sparks are
   * placed on the marine that was HIT, not the shooter, so a burst reads as
   * the round striking that soldier. Fading scales the instance color toward
   * black because the shards share one additive material (see
   * createSparkMesh). */
  const emitSparks = (seed: number, attackerColor: string, defenderColor: string, styles: ShotStyles): void => {
    for (let side = 0 as 0 | 1; side < 2; side++) {
      const targets = sidePos[side === 0 ? 1 : 0];
      const impacts = sideImpacts[side];
      if (targets.length === 0) continue;
      const umbrite = styles[side]?.umbrite === true;
      const radius = umbrite ? sparkRadius * UMBRITE_SPARK_RADIUS : sparkRadius;
      const size = umbrite ? UMBRITE_SPARK_SIZE : 1;
      for (let i = 0; i < impacts.length; i++) {
        const forMarine = impacts[i];
        if (!forMarine || forMarine.length === 0) continue;
        for (const impact of forMarine) {
          const t = Math.min(impact.targetIndex, targets.length / 3 - 1);
          for (let shard = 0; shard < SPARKS_PER_IMPACT; shard++) {
            if (sparkWrite >= maxSparks) return;
            const s = sparkShard(seed, side, i, impact, shard);
            sparkPos.set(
              targets[t * 3]! + s.x * radius,
              targets[t * 3 + 1]! + muzzleHeight + s.y * radius,
              targets[t * 3 + 2]! + s.z * radius
            );
            // Shards shrink as they fade so the burst settles instead of
            // popping out at full size.
            sparkScale.setScalar((0.5 + s.brightness * 0.5) * size);
            sparkM.compose(sparkPos, IDENTITY_QUAT, sparkScale);
            sparkFx.mesh.setMatrixAt(sparkWrite, sparkM);
            // Hot core: the firing side's colour pushed toward white (an
            // Umbrite ember stays orange), then dimmed by whatever brightness
            // the shard has left.
            if (umbrite) sparkColor.copy(UMBRITE_EMBER);
            else sparkColor.set(side === 0 ? attackerColor : defenderColor).lerp(WHITE, 0.6);
            sparkColor.multiplyScalar(s.brightness);
            sparkFx.mesh.setColorAt(sparkWrite, sparkColor);
            sparkWrite++;
          }
        }
      }
    }
  };

  /** Draws one battle's shots, both directions, from the gathered data.
   * `attackerStyle`/`defenderStyle` pick each side's round. */
  const emit = (
    seed: number,
    attackerColor: string,
    defenderColor: string,
    attackerStyle?: ShotStyle,
    defenderStyle?: ShotStyle
  ): void => {
    const styles = [attackerStyle, defenderStyle] as const;
    emitBolts(attackerColor, defenderColor, styles);
    emitSparks(seed, attackerColor, defenderColor, styles);
  };

  /** Starts a frame: nothing drawn until the next emit. */
  const beginFrame = (): void => {
    boltWrite = 0;
    sparkWrite = 0;
  };

  /** Publishes this frame's instances to the GPU. */
  const commit = (): void => {
    boltFx.commit(boltWrite);
    sparkFx.commit(sparkWrite);
  };

  const clear = (): void => {
    beginFrame();
    commit();
  };

  const dispose = (): void => {
    boltFx.dispose();
    sparkFx.dispose();
  };

  return { beginSide, push, emit, beginFrame, commit, clear, dispose };
};
