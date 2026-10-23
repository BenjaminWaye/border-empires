// Capture-hold garrison (shared capture-hold.ts): after a tile is taken, the
// squad that took it stays standing on it for the hold window instead of
// vanishing, and if the tile is attacked during that window those same
// marines are the defenders in the fight. Pure pose math only -- no three.js
// import -- so it is unit-tested in node like popup-marine-timeline.ts.
import type { MarineArmor } from "./popup-marine-armor.js";
import {
  clamp01,
  deathKitFor,
  dyingIndicesFor,
  hiddenMarinePose,
  marineKitFor,
  type MarinePose,
  type MarineStance
} from "./popup-marine-timeline.js";

// Fade-out over the last moments of the hold rather than blinking out.
export const GARRISON_FADE_MS = 600;
// Where the garrison stands: the same spot the winning squad's rout push
// ends at in computeBattlePose (routT * 0.3 forward, own formation slot
// sideways), so the marines who just took the tile simply stop there.
const GARRISON_FWD_OFFSET = 0.3;

/** Unit direction (scene X/Z) the capturing squad advanced in. */
export type GarrisonFacing = { fwdX: number; fwdZ: number };

export type GarrisonRenderEntry = GarrisonFacing & {
  tgtWorldX: number;
  tgtWorldZ: number;
  tgtSurfaceY: number;
  color: string;
  // Same per-tile seed as the battle/skirmish on this tile (x * 92821 + y),
  // so the garrison is exactly the capturing squad's survivors.
  hashSeed: number;
  /** End of the hold window, on the overlay's nowMs (performance.now()) clock. */
  endsAt: number;
  /** The holding empire's squad armour; absent = standard. */
  armor?: MarineArmor;
};

/** Where garrison marine `i` stands, or absent if it fell taking the tile. */
export type GarrisonStart = { absent: true } | { absent: false; localX: number; localZ: number; stance: MarineStance };

// The capturing (attacker, side 0) squad's own casualties in the battle it
// won -- they stay down instead of rejoining the garrison.
const fellTakingTile = (seed: number, i: number): boolean =>
  dyingIndicesFor((s, j) => deathKitFor(seed, s, j), 0, true).has(i);

export const garrisonStartFor = (facing: GarrisonFacing | undefined, seed: number, i: number): GarrisonStart | undefined => {
  if (!facing) return undefined;
  if (fellTakingTile(seed, i)) return { absent: true };
  const kit = marineKitFor(seed, 0, i);
  const perpX = -facing.fwdZ;
  const perpZ = facing.fwdX;
  return {
    absent: false,
    localX: facing.fwdX * GARRISON_FWD_OFFSET + perpX * kit.perpPos,
    localZ: facing.fwdZ * GARRISON_FWD_OFFSET + perpZ * kit.perpPos,
    stance: kit.kneels ? "kneel" : "stand"
  };
};

/** One garrison marine's pose while the tile is held and not under attack. */
export const computeGarrisonPose = (g: GarrisonRenderEntry, i: number, nowMs: number): MarinePose => {
  const yaw = Math.atan2(g.fwdX, g.fwdZ);
  const start = garrisonStartFor(g, g.hashSeed, i);
  if (!start || start.absent) return hiddenMarinePose(yaw);
  return {
    stance: start.stance,
    localX: start.localX,
    localZ: start.localZ,
    yaw,
    scale: clamp01((g.endsAt - nowMs) / GARRISON_FADE_MS),
    crouchT: 1,
    fallT: 0,
    flash: 0
  };
};
