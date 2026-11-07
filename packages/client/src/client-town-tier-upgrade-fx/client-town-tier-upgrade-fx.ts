import type { Tile } from "../client-types.js";

// Growth transition for a town that just stepped up a population tier
// (UPGRADE_TOWN_TIER: Settlement -> Town -> City -> Great City -> Monumental
// City): the old town sinks into the ground and the new tier's buildings grow
// up out of it, centre first and rippling outward, with a springy overshoot,
// while dust billows round the base.
//
// Detection lives here, renderer-agnostic. Both renderers share the timeline
// below (and the true-3D vertex shader mirrors it in GLSL, see
// client-map-3d-town-overlay/town-growth-shader.ts):
//   - true-3D: client-map-3d.ts draws an upgrading town through
//     addTownInstanceWithGrowth (old tier sinking + new tier growing), and the
//     dust layer (client-map-3d-town-tier-upgrade-fx.ts) drains
//     townTierUpgradeFxQueue;
//   - 2D: drawTownOverlay (client-map-render.ts) draws the sprites through
//     drawTownGrowthSprites2D and the overlay pass adds the dust
//     (client-map-2d-town-tier-upgrade.ts), both reading townTierUpgradeFxByKey,
//     because the 3D drain empties the queue.
// startedAt is wall-clock (Date.now() ms).

export type TownPopulationTier = NonNullable<Tile["townPopulationTier"]>;

export type TownTierUpgradeFxEntry = { x: number; y: number; fromTier: TownPopulationTier; tier: TownPopulationTier; startedAt: number };

export type TownTierUpgradeFxState = {
  townTierUpgradeFxQueue: TownTierUpgradeFxEntry[];
  townTierUpgradeFxByKey: Map<string, TownTierUpgradeFxEntry>;
};

export const createInitialTownTierUpgradeFxState = (): TownTierUpgradeFxState => ({
  townTierUpgradeFxQueue: [],
  townTierUpgradeFxByKey: new Map()
});

const TIER_RANK: Record<TownPopulationTier, number> = { SETTLEMENT: 0, TOWN: 1, CITY: 2, GREAT_CITY: 3, METROPOLIS: 4 };

export const townTierRank = (tier: TownPopulationTier): number => TIER_RANK[tier];

// ---- Shared growth timeline (ms). Mirrored in town-growth-shader.ts. ----

/** The old town sinks into the ground over this long. */
export const TOWN_GROWTH_SINK_MS = 700;
/** When the first (central) new building starts to rise. */
export const TOWN_GROWTH_START_MS = 450;
/** Extra delay for a building at the plate's rim, so growth ripples outward. */
export const TOWN_GROWTH_SPREAD_MS = 1500;
/** How long one building takes to rise (with overshoot). */
export const TOWN_GROWTH_RISE_MS = 900;
/** The whole transition: by now every building stands at full height. */
export const TOWN_GROWTH_TRANSITION_MS = TOWN_GROWTH_START_MS + TOWN_GROWTH_SPREAD_MS + TOWN_GROWTH_RISE_MS;
/** Back-out overshoot strength: buildings spring a little past full height and settle. */
export const TOWN_GROWTH_OVERSHOOT = 1.0;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Ease with overshoot: 0 -> ~1.1 -> 1. */
export const townGrowthBackOut = (p: number): number => {
  const c1 = TOWN_GROWTH_OVERSHOOT;
  const c3 = c1 + 1;
  const q = clamp01(p) - 1;
  return 1 + c3 * q * q * q + c1 * q * q;
};

/** Height factor (0..~1.1) of a new building at normalised distance r (0 centre .. 1 rim) from the town centre. */
export const townGrowthRise = (ageMs: number, r: number): number => {
  const p = (ageMs - TOWN_GROWTH_START_MS - clamp01(r) * TOWN_GROWTH_SPREAD_MS) / TOWN_GROWTH_RISE_MS;
  if (p <= 0) return 0;
  return p >= 1 ? 1 : townGrowthBackOut(p);
};

/** Height factor (1..0) of the old town as it sinks. */
export const townGrowthSink = (ageMs: number): number => {
  const p = clamp01(ageMs / TOWN_GROWTH_SINK_MS);
  return 1 - p * p;
};

export const isTownGrowthActive = (entry: TownTierUpgradeFxEntry | undefined, nowEpochMs: number): entry is TownTierUpgradeFxEntry =>
  entry !== undefined && nowEpochMs - entry.startedAt >= 0 && nowEpochMs - entry.startedAt < TOWN_GROWTH_TRANSITION_MS;

/** Dust settles a little after the last building stands. */
export const TOWN_GROWTH_DUST_MS = TOWN_GROWTH_TRANSITION_MS + 600;
const FX_QUEUE_CAP = 16;

/** More dust for a bigger jump. */
export const townGrowthDustPuffs = (tier: TownPopulationTier): number => 8 + Math.max(1, townTierRank(tier)) * 5;

export const tileTownPopulationTier = (
  tile: { town?: Tile["town"] | undefined; townPopulationTier?: Tile["townPopulationTier"] | undefined } | undefined
): TownPopulationTier | undefined => tile?.town?.populationTier ?? tile?.townPopulationTier;

/**
 * The tier step `resolved` just took, when the same owner's town moved to a
 * strictly higher population tier. A capture (owner change), a first
 * sighting (no previous tier) or a downgrade is not a tier upgrade.
 */
export const townTierUpgradeStep = (
  previous: { ownerId?: string; town?: Tile["town"]; townPopulationTier?: Tile["townPopulationTier"] } | undefined,
  resolved: Tile | undefined,
  me: string
): { fromTier: TownPopulationTier; tier: TownPopulationTier } | undefined => {
  if (!previous || !resolved || !me) return undefined;
  if (resolved.ownerId !== me || previous.ownerId !== me) return undefined;
  const fromTier = tileTownPopulationTier(previous);
  const tier = tileTownPopulationTier(resolved);
  if (!fromTier || !tier) return undefined;
  return townTierRank(tier) > townTierRank(fromTier) ? { fromTier, tier } : undefined;
};

/** Starts a growth transition at `key`; prunes finished entries and bounds the 3D dust queue. */
export const recordTownTierUpgrade = (state: TownTierUpgradeFxState, key: string, entry: TownTierUpgradeFxEntry): void => {
  for (const [otherKey, other] of state.townTierUpgradeFxByKey) {
    if (entry.startedAt - other.startedAt >= TOWN_GROWTH_DUST_MS) state.townTierUpgradeFxByKey.delete(otherKey);
  }
  state.townTierUpgradeFxByKey.set(key, entry);
  state.townTierUpgradeFxQueue.push(entry);
  if (state.townTierUpgradeFxQueue.length > FX_QUEUE_CAP) state.townTierUpgradeFxQueue.shift();
};

export const townTierUpgradeFeedMessage = (townName: string | undefined, tierLabel: string): string =>
  townName ? `${townName} has grown into a ${tierLabel}!` : `Your town has grown into a ${tierLabel}!`;

/** Deterministic 0..1 noise so each dust puff keeps its own lane frame to frame (and 2D/3D agree). */
export const dustNoise = (seed: number, i: number): number => {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export type TownGrowthDustPuff = {
  /** Angle round the town. */
  readonly angle: number;
  /** Distance from the town centre (tiles). */
  readonly distance: number;
  /** Height above the ground (tiles). */
  readonly rise: number;
  /** Radius (tiles); 0 when the puff is not showing. */
  readonly radius: number;
  readonly alpha: number;
};

/** Dust puff i at ageMs: kicked up near the rim as the buildings round it rise, billowing out and fading. */
export const townGrowthDustPuffAt = (seed: number, i: number, ageMs: number): TownGrowthDustPuff => {
  const r = 0.25 + dustNoise(seed, i * 4) * 0.75;
  const born = TOWN_GROWTH_START_MS * 0.5 + r * TOWN_GROWTH_SPREAD_MS + dustNoise(seed, i * 4 + 1) * 300;
  const life = 1100 + dustNoise(seed, i * 4 + 2) * 700;
  const p = (ageMs - born) / life;
  const angle = dustNoise(seed, i * 4 + 3) * Math.PI * 2;
  if (p <= 0 || p >= 1) return { angle, distance: 0, rise: 0, radius: 0, alpha: 0 };
  const out = 1 - Math.pow(1 - p, 2);
  return {
    angle: angle + p * 0.4,
    distance: 0.2 + r * 0.3 + out * 0.2,
    rise: out * 0.16,
    radius: 0.03 + out * 0.055,
    alpha: (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85) * 0.5
  };
};
