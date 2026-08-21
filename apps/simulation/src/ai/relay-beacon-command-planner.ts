// RELAY_BEACON placement — split out of structure-command-planner.ts (which
// was already over the repo's 500-line file cap) once this section grew
// again for the reach-consideration work's siteValue field. Fort/siege/
// economic building selection stays in structure-command-planner.ts; this
// file owns only the beacon (fixed-borders-via-reach plan) concern, which is
// already self-contained enough to live on its own.
import { OUTPOST_REACH_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

import {
  canAffordStructure,
  EMPTY_OWNED_STRUCTURE_COUNTS,
  plannedOwnedStructureCount,
  playerTechSet,
  structureVisibleOnTile,
  tallyOwnedStructures,
  tileKeyOf,
  tileOpenForStructure,
  type StructurePlannerPlayer,
  type StructurePlannerTile,
  type TileLookup
} from "./structure-command-planner.js";

// Reach-frontier sample cap for chooseBestRelayBeaconBuild's new-area
// estimate below — keeps the per-candidate radius scan bounded regardless of
// OUTPOST_REACH_RADIUS, per AGENTS.md's AI CPU Guardrails (no O(owned tiles
// x world) scans from planner-static builders). At radius 5 the full box is
// 121 cells; this only matters if the radius constant grows later.
const RELAY_BEACON_REACH_SAMPLE_CAP = 150;

/**
 * Cheap approximation of "how much currently-unreachable land would a beacon
 * here newly cover" — scans unowned-by-this-player LAND tiles (neutral or
 * enemy frontier) within OUTPOST_REACH_RADIUS of the candidate, toroidally
 * wrapped, and weights them by strategic value: a tile carrying a town/
 * resource/dock/natural-wonder ("valuable", mirrors frontier-scoring.ts's
 * "economic" class) counts far more than plain land — a beacon exists to
 * reach the *next* prize once nearby valuables are claimed out, not to
 * blindly grow the border into empty land. This deliberately does NOT
 * consult the real reach map (not always available to this planner-static
 * builder) — it's a proxy for "is this candidate near something worth
 * claiming". Bounded to a fixed-size box scan per candidate, not a world scan.
 */
const VALUABLE_TARGET_COVERAGE_WEIGHT = 8;

const estimateNewReachCoverage = (
  playerId: string,
  tile: StructurePlannerTile,
  tilesByKey: TileLookup
): { score: number; hasValuable: boolean } => {
  let covered = 0;
  let hasValuable = false;
  let scanned = 0;
  outer: for (let dy = -OUTPOST_REACH_RADIUS; dy <= OUTPOST_REACH_RADIUS; dy += 1) {
    for (let dx = -OUTPOST_REACH_RADIUS; dx <= OUTPOST_REACH_RADIUS; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      scanned += 1;
      if (scanned > RELAY_BEACON_REACH_SAMPLE_CAP) break outer;
      const nx = wrapX(tile.x + dx, WORLD_WIDTH);
      const ny = wrapY(tile.y + dy, WORLD_HEIGHT);
      const neighbor = tilesByKey.get(tileKeyOf(nx, ny));
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      if (neighbor.ownerId === playerId) continue;
      const isValuable = Boolean(neighbor.town || neighbor.resource || neighbor.dockId || neighbor.naturalWonder);
      if (isValuable) hasValuable = true;
      covered += isValuable ? VALUABLE_TARGET_COVERAGE_WEIGHT : 1;
    }
  }
  return { score: covered, hasValuable };
};

/**
 * AI placement scoring for RELAY_BEACON (the reach-projection outpost —
 * fixed-borders-via-reach plan). RELAY_BEACON is an EconomicStructureType
 * that lives on `economicStructure` (Phase 1 debt, see
 * packages/shared/src/structure-registry-outpost.ts), so this mirrors
 * chooseBestEconomicBuild's candidate shape, not chooseBestSiegeOutpostBuild's
 * — but the *placement rule* (owned + SETTLED, no tech gate) and *scoring
 * approach* (score candidates by new-territory coverage near the reach
 * frontier) follow the plan's "build_siege_outpost-style action" template.
 *
 * Candidates may be owned+SETTLED **or** owned+FRONTIER. RELAY_BEACON_SPEC's
 * placement list requires SETTLED (tileIsSettled + ownerOwnsTile,
 * structure-registry-outpost.ts:67-94), so a FRONTIER site can't be built on
 * directly — the caller settles it first and builds on the next plan tick
 * (`needsSettle` on the returned plan says which). Including FRONTIER sites
 * is what unblocks a reach-locked AI: the AI has no standalone SETTLE
 * decision at all (deliberately — a general settle-everything policy would
 * change expansion balance everywhere), so before this its only legal beacon
 * sites were tiles inside the settled core it was already reaching from, and
 * a sprawling frontier could never be converted into new reach. Settling
 * here is purposeful: it happens only to place a beacon that extends reach
 * toward a real prize.
 */
export type RelayBeaconBuildPlan = {
  tile: StructurePlannerTile;
  /** FRONTIER site — SETTLE it first; the beacon build follows once it lands. */
  needsSettle: boolean;
  /**
   * The winning candidate's raw estimateNewReachCoverage score (pre dock-
   * bonus/frontier-penalty placement tie-breakers) — a magnitude of how much
   * newly-reachable value this specific beacon actually unlocks, not just
   * whether one exists. Consumed by scoreBuildBeacon (ai/utility/decisions.ts)
   * as a graduated consideration: a beacon reaching one empty tile should
   * score low, one reaching several towns/resources/docks should score high
   * — see that file's comment for why a flat "site exists" boolean isn't
   * enough. See docs/ai-structure-building-rewrite-plan.md's reach-consideration section.
   */
  siteValue: number;
};

// Tie-break penalty for a FRONTIER site over an equally-good SETTLED one: the
// frontier route costs an extra SETTLE (manpower + a development slot + build
// time) before the beacon can even start, so prefer ground already settled
// when both reach the same prize.
const FRONTIER_BEACON_SITE_PENALTY = 40;

export const chooseBestRelayBeaconBuild = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup,
  candidateTiles: readonly StructurePlannerTile[] = ownedTiles
): RelayBeaconBuildPlan | undefined => {
  const counts = player.ownedStructureCounts ? EMPTY_OWNED_STRUCTURE_COUNTS : tallyOwnedStructures(player.id, ownedTiles);
  const existingOwnedCount = plannedOwnedStructureCount(player, counts, "RELAY_BEACON");
  if (!canAffordStructure(player, playerTechSet(player), "RELAY_BEACON", existingOwnedCount)) return undefined;

  let best: { tile: StructurePlannerTile; score: number; needsSettle: boolean; siteValue: number } | undefined;
  for (const tile of candidateTiles) {
    if (tile.ownerId !== player.id || tile.terrain !== "LAND") continue;
    const isSettled = tile.ownershipState === "SETTLED";
    const needsSettle = tile.ownershipState === "FRONTIER";
    if (!isSettled && !needsSettle) continue;
    if (!tileOpenForStructure(tile)) continue;
    // A FRONTIER site is judged as the SETTLED tile it's about to become —
    // structureShowsOnTile keys off ownershipState, so checking it as-is
    // would reject every frontier candidate on the state we're about to change.
    if (!structureVisibleOnTile("RELAY_BEACON", player.id, needsSettle ? { ...tile, ownershipState: "SETTLED" } : tile, tilesByKey)) continue;
    const newCoverage = estimateNewReachCoverage(player.id, tile, tilesByKey);
    // Requiring a known valuable tile here created a dead end: EXPAND stops
    // once nothing adjacent+in-reach is worth claiming — but a beacon site
    // could only ever be proposed if a resource/town/dock/wonder was ALREADY
    // visible in its scan radius, and that scan only sees tiles already
    // synced locally (tilesByKey). Genuinely new ground just past current
    // vision was invisible to it, so an AI could get stuck on WAIT forever
    // even with real, unclaimed land plausibly one step further out
    // (confirmed live: multiple empires vetoed on every decision class
    // simultaneously with zero visible neutral candidates). A site just
    // needs to newly cover SOME unowned land to be worth proposing at all —
    // estimateNewReachCoverage's VALUABLE_TARGET_COVERAGE_WEIGHT already
    // makes a known prize win the ranking below when one exists; this just
    // stops requiring one to exist for a beacon to fire at all.
    if (newCoverage.score <= 0) continue;
    // Placement score: newCoverage.score plus dock/settle tie-breakers, used
    // only to pick the best candidate among several. siteValue (below, on the
    // returned plan) is deliberately the pre-tie-breaker newCoverage.score —
    // scoreBuildBeacon's graduated consideration cares about how much value
    // this beacon actually unlocks, not placement preference between two
    // similar sites.
    let score = newCoverage.score * 10;
    if (tile.dockId) score += 30; // cross-island reach floor per plan's DOCK_REACH_RADIUS note
    if (needsSettle) score -= FRONTIER_BEACON_SITE_PENALTY;
    if (!best || score > best.score) best = { tile, score, needsSettle, siteValue: newCoverage.score };
  }
  return best ? { tile: best.tile, needsSettle: best.needsSettle, siteValue: best.siteValue } : undefined;
};
