import type { Tile } from "../client-types.js";

// Cosmetic celebration for a town that just stepped up a population tier
// (UPGRADE_TOWN_TIER: Settlement -> Town -> City -> Great City -> Monumental
// City). Detection lives here, renderer-agnostic; the true-3D layer
// (client-map-3d-town-tier-upgrade-fx.ts) drains townTierUpgradeFxQueue, and
// the 2D canvas painter (client-map-2d-town-tier-upgrade.ts) reads
// townTierUpgradeFxByKey directly, because the 3D drain empties the queue.
// Both share one wall-clock timeline (startedAt, Date.now() ms) and one
// per-tier profile, so the two renderers stay in step and in scale.

export type TownPopulationTier = NonNullable<Tile["townPopulationTier"]>;

export type TownTierUpgradeFxEntry = { x: number; y: number; tier: TownPopulationTier; startedAt: number };

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

export type TownTierCelebrationProfile = {
  /** 1 (Town) .. 4 (Monumental City): drives how big the celebration gets. */
  readonly rank: number;
  readonly durationMs: number;
  /** Staggered ground shockwaves. */
  readonly rings: number;
  /** Max shockwave radius in tiles. */
  readonly ringRadiusTiles: number;
  /** Rising sparks / confetti. */
  readonly sparks: number;
  /** Height of the light column in tiles (3D) / tile-sizes (2D). */
  readonly pillarHeightTiles: number;
  readonly color: string;
  readonly accent: string;
};

const TIER_COLORS: Record<TownPopulationTier, { color: string; accent: string }> = {
  SETTLEMENT: { color: "#ffe9a8", accent: "#ffffff" },
  TOWN: { color: "#ffe08a", accent: "#fff6d8" },
  CITY: { color: "#ffd166", accent: "#fff1c2" },
  GREAT_CITY: { color: "#ffb347", accent: "#ffe7b0" },
  METROPOLIS: { color: "#ff9ad5", accent: "#ffe2f4" }
};

export const townTierCelebrationProfile = (tier: TownPopulationTier): TownTierCelebrationProfile => {
  const rank = Math.max(1, townTierRank(tier));
  return {
    rank,
    durationMs: 2400 + rank * 400,
    rings: 1 + rank,
    ringRadiusTiles: 1.6 + rank * 0.55,
    sparks: 10 + rank * 8,
    pillarHeightTiles: 1.8 + rank * 0.7,
    ...TIER_COLORS[tier]
  };
};

/** Longest celebration, used to prune the 2D map without knowing each entry's tier. */
export const TOWN_TIER_CELEBRATION_MAX_MS = townTierCelebrationProfile("METROPOLIS").durationMs;
const FX_QUEUE_CAP = 16;

export const tileTownPopulationTier = (tile: { town?: Tile["town"] | undefined; townPopulationTier?: Tile["townPopulationTier"] | undefined } | undefined): TownPopulationTier | undefined =>
  tile?.town?.populationTier ?? tile?.townPopulationTier;

/**
 * The tier `resolved` stepped up to, when the same owner's town moved to a
 * strictly higher population tier. A capture (owner change), a first
 * sighting (no previous tier) or a downgrade is not a tier upgrade.
 */
export const townTierUpgradedTo = (
  previous: { ownerId?: string; town?: Tile["town"]; townPopulationTier?: Tile["townPopulationTier"] } | undefined,
  resolved: Tile | undefined,
  me: string
): TownPopulationTier | undefined => {
  if (!previous || !resolved || !me) return undefined;
  if (resolved.ownerId !== me || previous.ownerId !== me) return undefined;
  const before = tileTownPopulationTier(previous);
  const after = tileTownPopulationTier(resolved);
  if (!before || !after) return undefined;
  return townTierRank(after) > townTierRank(before) ? after : undefined;
};

/** Starts a celebration at (x, y); prunes finished 2D entries and bounds the 3D queue. */
export const recordTownTierUpgrade = (state: TownTierUpgradeFxState, key: string, entry: TownTierUpgradeFxEntry): void => {
  for (const [otherKey, other] of state.townTierUpgradeFxByKey) {
    if (entry.startedAt - other.startedAt >= TOWN_TIER_CELEBRATION_MAX_MS) state.townTierUpgradeFxByKey.delete(otherKey);
  }
  state.townTierUpgradeFxByKey.set(key, entry);
  state.townTierUpgradeFxQueue.push(entry);
  if (state.townTierUpgradeFxQueue.length > FX_QUEUE_CAP) state.townTierUpgradeFxQueue.shift();
};

export const townTierUpgradeFeedMessage = (townName: string | undefined, tierLabel: string): string =>
  townName ? `${townName} has grown into a ${tierLabel}!` : `Your town has grown into a ${tierLabel}!`;

// ---- Shared timeline: both renderers sample these so they read the same. ----

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);

export type TownTierCelebrationFrame = {
  /** 0..1 overall progress. */
  readonly t: number;
  /** Bright core flash, peaks right away. */
  readonly flash: number;
  /** Light column opacity and its 0..1 height growth. */
  readonly pillarAlpha: number;
  readonly pillarGrow: number;
  /** Per ring: radius 0..1 of max, and opacity. Rings not started yet have alpha 0. */
  readonly rings: ReadonlyArray<{ readonly radius: number; readonly alpha: number }>;
  /** Spark rise 0..1 and opacity (sparks share one curve, each offset by its own phase). */
  readonly sparkAlpha: number;
};

const RING_STAGGER = 0.14;
const RING_LIFE = 0.5;

export const townTierCelebrationFrame = (profile: TownTierCelebrationProfile, ageMs: number): TownTierCelebrationFrame | undefined => {
  if (ageMs < 0 || ageMs >= profile.durationMs) return undefined;
  const t = ageMs / profile.durationMs;
  const flash = t < 0.06 ? t / 0.06 : Math.max(0, 1 - (t - 0.06) / 0.2);
  const pillarGrow = easeOutCubic(t / 0.25);
  const pillarAlpha = t < 0.08 ? t / 0.08 : t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
  const rings: Array<{ radius: number; alpha: number }> = [];
  for (let i = 0; i < profile.rings; i += 1) {
    const local = (t - i * RING_STAGGER) / RING_LIFE;
    if (local <= 0 || local >= 1) {
      rings.push({ radius: 0, alpha: 0 });
      continue;
    }
    rings.push({ radius: easeOutCubic(local), alpha: (1 - local) * (i === 0 ? 1 : 0.8) });
  }
  const sparkAlpha = t < 0.1 ? t / 0.1 : t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
  return { t, flash, pillarAlpha, pillarGrow, rings, sparkAlpha };
};

/** Deterministic 0..1 noise so each spark keeps its own lane frame to frame (and 2D/3D agree). */
export const sparkNoise = (seed: number, i: number): number => {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export type TownTierSpark = { readonly angle: number; readonly drift: number; readonly rise: number; readonly size: number };

/** Spark i at progress t: angle around the town, outward drift (tiles), height (tiles), relative size. */
export const townTierSparkAt = (profile: TownTierCelebrationProfile, seed: number, i: number, t: number): TownTierSpark => {
  const delay = sparkNoise(seed, i * 3) * 0.3;
  const local = clamp01((t - delay) / (1 - delay));
  const angle = sparkNoise(seed, i * 3 + 1) * Math.PI * 2;
  const reach = 0.25 + sparkNoise(seed, i * 3 + 2) * (0.35 + profile.rank * 0.12);
  return {
    angle: angle + local * 1.2,
    drift: reach * easeOutCubic(local),
    rise: local * profile.pillarHeightTiles * (0.55 + sparkNoise(seed, i * 5 + 7) * 0.6),
    size: local > 0 && local < 1 ? 0.6 + sparkNoise(seed, i * 7 + 3) * 0.8 : 0
  };
};
