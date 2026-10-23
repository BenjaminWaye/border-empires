import type { DomainTileState } from "@border-empires/game-domain";

// Comeback shard rain: part of every scheduled rain is steered onto the own
// territory of human players who recently lost a large share of their land,
// so a beaten-down House has a realistic route to a Shard (and with it a
// SHARD_MOBILIZE manpower refill) instead of finding only rivals' rain sites.
//
// "Recently lost" is measured against a decaying peak: each player's peak
// territory halves every COMEBACK_PEAK_HALF_LIFE_MS unless current territory
// holds it up, so a loss stops counting as the empire settles at its new size.

export const COMEBACK_PEAK_HALF_LIFE_MS = 24 * 60 * 60_000;
// Below this peak an empire is too young for a "loss" to mean anything.
export const COMEBACK_MIN_PEAK_TILES = 20;
export const COMEBACK_MIN_LOSS_FRACTION = 0.4;
// At most this share of a rain's sites (rounded up) goes to comeback players.
export const COMEBACK_MAX_SITE_SHARE = 0.5;
const COMEBACK_TILE_PICK_ATTEMPTS = 40;

type PeakEntry = { peak: number; observedAt: number };

/**
 * Per-player decaying peak territory size. Bounded by the live player set
 * (prune() drops departed players every tick) and deliberately not
 * persisted: after a process restart the peaks rebuild from current
 * territory, which only means comeback weighting is off until the next loss.
 */
export class TerritoryPeakTracker {
  private readonly peaks = new Map<string, PeakEntry>();

  private decayedPeak(entry: PeakEntry, nowMs: number): number {
    const elapsed = Math.max(0, nowMs - entry.observedAt);
    return entry.peak * Math.pow(0.5, elapsed / COMEBACK_PEAK_HALF_LIFE_MS);
  }

  observe(playerId: string, tileCount: number, nowMs: number): void {
    const entry = this.peaks.get(playerId);
    const peak = entry ? Math.max(tileCount, this.decayedPeak(entry, nowMs)) : tileCount;
    this.peaks.set(playerId, { peak, observedAt: nowMs });
  }

  /** 0..1 share of the decayed peak the player no longer holds; 0 for empires that never reached COMEBACK_MIN_PEAK_TILES. */
  lossFraction(playerId: string, tileCount: number, nowMs: number): number {
    const entry = this.peaks.get(playerId);
    if (!entry) return 0;
    const peak = this.decayedPeak(entry, nowMs);
    if (peak < COMEBACK_MIN_PEAK_TILES || tileCount >= peak) return 0;
    return 1 - tileCount / peak;
  }

  prune(isLivePlayer: (playerId: string) => boolean): void {
    for (const playerId of this.peaks.keys()) {
      if (!isLivePlayer(playerId)) this.peaks.delete(playerId);
    }
  }

  get size(): number {
    return this.peaks.size;
  }
}

export const comebackSiteBudget = (totalSites: number): number => Math.ceil(Math.max(0, totalSites) * COMEBACK_MAX_SITE_SHARE);

/**
 * Weighted pick without replacement: each qualifying player (loss at or above
 * COMEBACK_MIN_LOSS_FRACTION) is drawn with probability proportional to how
 * much of their land they lost, at most once per rain.
 */
export const pickComebackPlayers = (
  candidates: readonly { playerId: string; lossFraction: number }[],
  budget: number,
  random: () => number = Math.random
): string[] => {
  const pool = candidates.filter((candidate) => candidate.lossFraction >= COMEBACK_MIN_LOSS_FRACTION);
  const picked: string[] = [];
  while (picked.length < budget && pool.length > 0) {
    const total = pool.reduce((sum, candidate) => sum + candidate.lossFraction, 0);
    let roll = random() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      roll -= pool[i]!.lossFraction;
      if (roll < 0) {
        index = i;
        break;
      }
    }
    picked.push(pool[index]!.playerId);
    pool.splice(index, 1);
  }
  return picked;
};

/** A random tile of the player's own land that can host a fall site, or undefined when none turns up. */
export const pickComebackTileKey = (
  playerId: string,
  territoryTileKeys: ReadonlySet<string>,
  tiles: ReadonlyMap<string, DomainTileState>,
  canHost: (tile: DomainTileState | undefined, tileKey: string) => boolean,
  random: () => number = Math.random
): string | undefined => {
  if (territoryTileKeys.size === 0) return undefined;
  const keys = [...territoryTileKeys];
  for (let attempt = 0; attempt < COMEBACK_TILE_PICK_ATTEMPTS; attempt += 1) {
    const tileKey = keys[Math.floor(random() * keys.length)]!;
    const tile = tiles.get(tileKey);
    if (tile?.ownerId !== playerId) continue;
    if (tile.ownershipState !== "FRONTIER" && tile.ownershipState !== "SETTLED") continue;
    if (canHost(tile, tileKey)) return tileKey;
  }
  return undefined;
};
