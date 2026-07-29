import { WORLD_HEIGHT, WORLD_WIDTH ,
  isSeaTerrain,
  FORT_TIER_LADDER,
  TOWN_GARRISON_BONUS,
  garrisonBonusForFortDefenseMult,
  localSupportRatioForTile
} from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";

const wrap = (value: number, size: number): number => {
  const remainder = value % size;
  return remainder < 0 ? remainder + size : remainder;
};

const wrapX = (x: number): number => wrap(x, WORLD_WIDTH);
const wrapY = (y: number): number => wrap(y, WORLD_HEIGHT);

const ownedTile = (tile: DomainTileState | undefined, playerId: string, settledOnly: boolean): boolean => {
  if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") return false;
  return settledOnly ? tile.ownershipState === "SETTLED" : tile.ownershipState === "SETTLED" || tile.ownershipState === "FRONTIER";
};

const exposedEdgesFor = (
  tile: DomainTileState,
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  settledOnly: boolean
): number => {
  const neighbors = [
    { x: wrapX(tile.x), y: wrapY(tile.y - 1) },
    { x: wrapX(tile.x + 1), y: wrapY(tile.y) },
    { x: wrapX(tile.x), y: wrapY(tile.y + 1) },
    { x: wrapX(tile.x - 1), y: wrapY(tile.y) }
  ];
  let exposed = 0;
  for (const neighbor of neighbors) {
    const next = tiles.get(`${neighbor.x},${neighbor.y}`);
    if (ownedTile(next, playerId, settledOnly)) continue;
    const terrain = next?.terrain ?? "LAND";
    if (isSeaTerrain(terrain) || terrain === "MOUNTAIN") continue;
    exposed += 1;
  }
  return exposed;
};

/**
 * Garrison contribution for one settled tile, additive on top of
 * neighbour-support (docs/defense-consolidation-exploration.md §3.1:
 * "Towns/forts contribute via garrison"). A tile can have both a town and an
 * active fort at once, so both bonuses stack; localSupportRatioForTile
 * clamps the final ratio at 1 regardless.
 */
const garrisonBonusForTile = (tile: DomainTileState, playerId: string): number => {
  let bonus = 0;
  if (tile.town && tile.ownerId === playerId) bonus += TOWN_GARRISON_BONUS;
  if (tile.fort && tile.fort.ownerId === playerId && tile.fort.status === "active") {
    const variant = tile.fort.variant ?? "FORT";
    bonus += garrisonBonusForFortDefenseMult(FORT_TIER_LADDER[variant].defenseMult);
  }
  return bonus;
};

export type PlayerDefensibilityMetrics = {
  T: number;
  E: number;
  Ts: number;
  Es: number;
  /**
   * Local-support empire integrity score in [0,1]: the average, across all
   * of the player's settled tiles, of that tile's support ratio (friendly
   * settled neighbours + garrison, out of 4 — see localSupportRatioForTile).
   * Feeds empireIntegrity() → integrityEconomyMult/integrityGrowthMult,
   * replacing the old global defensibilityScore(Ts,Es) alias that parked
   * near ~50% for any realistically-shaped empire regardless of actual
   * shape (docs/manpower-economy-rewrite-plan.md §7.2,
   * docs/defense-consolidation-exploration.md §2).
   */
  localSupportScore: number;
};

export const buildPlayerDefensibilityMetrics = (
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  ownedTileKeys?: ReadonlySet<string>,
  // 2026-07-29 login-stall investigation: T/E (all-owned exposed-edge count)
  // is sent to the client for HUD display ONLY — every gameplay consumer
  // (integrityEconomyMult, integrityGrowthMult) reads Ts/Es (settled-only).
  // AI players have no client ever subscribed to read T/E, so for them the
  // exposedEdgesFor(..., false) call below — the dominant per-tile cost — is
  // pure waste across every FRONTIER tile, which is the majority of a
  // sprawling AI empire's owned tiles. skipAllOwnedStats lets callers who
  // know nothing reads T/E for this player skip it; T/Ts still count so the
  // Math.max(1, ...) floors stay meaningful, but E is left at 0 (never read
  // in that case).
  skipAllOwnedStats = false
): PlayerDefensibilityMetrics => {
  let T = 0;
  let E = 0;
  let Ts = 0;
  let Es = 0;
  let settledCount = 0;
  let supportScoreSum = 0;

  // Same traversal as before — reuses the settled tile's exposedEdgesFor
  // result (already computed for Es) to derive supportedSides, so this adds
  // zero extra tile scans (respects the AI CPU guardrails, AGENTS.md /
  // docs/game-mechanics.md §13).
  const accumulateSettled = (tile: DomainTileState, exposedSettled: number): void => {
    Ts += 1;
    Es += exposedSettled;
    settledCount += 1;
    const supportedSides = 4 - exposedSettled;
    supportScoreSum += localSupportRatioForTile(supportedSides, garrisonBonusForTile(tile, playerId));
  };

  const accumulate = (tile: DomainTileState): void => {
    T += 1;
    if (!skipAllOwnedStats) E += exposedEdgesFor(tile, playerId, tiles, false);
    if (!ownedTile(tile, playerId, true)) return;
    accumulateSettled(tile, exposedEdgesFor(tile, playerId, tiles, true));
  };
  // Iterate the player's owned tiles only when the caller provides the
  // index — O(owned-tiles) instead of O(all-map-tiles). The summary's
  // territoryTileKeys is maintained incrementally as ownership changes, so
  // this is the same data as filtering tiles.values() but ~10-30x cheaper
  // for typical empires. Falls back to the full scan for callers that
  // don't have the index handy.
  if (ownedTileKeys) {
    for (const tileKey of ownedTileKeys) {
      const tile = tiles.get(tileKey);
      if (!tile || !ownedTile(tile, playerId, false)) continue;
      accumulate(tile);
    }
  } else {
    for (const tile of tiles.values()) {
      if (!ownedTile(tile, playerId, false)) continue;
      accumulate(tile);
    }
  }
  return {
    T: Math.max(1, T),
    E,
    Ts: Math.max(1, Ts),
    Es,
    // A player with zero settled tiles defaults to full integrity (1)
    // rather than 0 — this is a "no data yet" state (shouldn't occur once a
    // starting capital exists), not a state that should be penalized.
    localSupportScore: settledCount > 0 ? supportScoreSum / settledCount : 1
  };
};
