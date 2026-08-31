// Mercantile Charter helper split out of tile-detail-snapshot.ts to keep
// that file under the repo's 500-line cap.
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import {
  firstThreeTownKeysForPlayer,
  firstThreeTownMultipliersForTile
} from "../../../simulation/src/economy-network/economy-network-first-three-towns.js";

type SnapshotTile = PlayerSubscriptionSnapshot["tiles"][number];

/**
 * Recomputed fresh from the snapshot rather than trusted from the tile's
 * persisted townJson — toSharedVisibilityTownSummary's allowlist
 * (live-snapshot-view.ts) strips firstThreeTownGoldMult/
 * firstThreeTownPopGrowthMult before persisting, so this gateway-served
 * tile-detail path never surfaced Mercantile Charter's bonus at all before
 * this function existed (the sim's own authoritative goldPerMinute/
 * populationGrowthPerMinute, when present on the snapshot, already have the
 * multiplier folded in — see live-town-summary.ts). See
 * firstThreeTownMultipliersForTile's own doc comment: every consumer of this
 * bonus must go through that one function so the real math and the wire
 * display fields can't drift apart again.
 *
 * Caveat: the wire snapshot carries no settlement-order/timestamp field, so
 * unlike the sim's authoritative firstThreeTownKeysForPlayer callers (which
 * pass entries in real settlement order — see buildFirstThreeTownKeysByPlayer
 * / orderedTownTilesForPlayer), this path can only sort by tile key for a
 * stable, deterministic "first three" rather than the player's true first
 * three by settlement order. For a player with more than 3 towns, this can
 * occasionally select a different 3-town set than the live broadcast path —
 * still far better than never computing the bonus at all, and at least
 * consistent across repeated fetches (no more flicker).
 */
export const firstThreeTownMultipliersForSnapshotTile = (
  snapshot: PlayerSubscriptionSnapshot | undefined,
  playerId: string,
  keyFor: (x: number, y: number) => string,
  x: number,
  y: number
): { firstThreeTownGoldMult: number; firstThreeTownPopGrowthMult: number } => {
  const ownedSettledTownEntries: Array<readonly [string, string | undefined]> = (snapshot?.tiles ?? [])
    .filter((t: SnapshotTile) => t.ownerId === playerId && t.ownershipState === "SETTLED" && (t.townJson || t.townType))
    .sort((a: SnapshotTile, b: SnapshotTile) => (a.x - b.x) || (a.y - b.y))
    .map((t: SnapshotTile) => [keyFor(t.x, t.y), t.townPopulationTier] as const);
  const firstThreeTownKeys = firstThreeTownKeysForPlayer(playerId, ownedSettledTownEntries);
  const economyPlayer = {
    techIds: new Set(snapshot?.player?.techIds ?? []),
    domainIds: new Set(snapshot?.player?.domainIds ?? [])
  };
  const { goldMult: firstThreeTownGoldMult, popGrowthMult: firstThreeTownPopGrowthMult } =
    firstThreeTownMultipliersForTile(economyPlayer, firstThreeTownKeys, keyFor(x, y));
  return { firstThreeTownGoldMult, firstThreeTownPopGrowthMult };
};
