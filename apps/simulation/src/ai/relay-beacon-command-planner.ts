// RELAY_BEACON placement — split out of structure-command-planner.ts (which
// was already over the repo's 500-line file cap) once this section grew
// again for the reach-consideration work's siteValue field. Fort/siege/
// economic building selection stays in structure-command-planner.ts; this
// file owns only the beacon (fixed-borders-via-reach plan) concern, which is
// already self-contained enough to live on its own.
import { OUTPOST_REACH_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, tileKeysInReach, wrapX, wrapY, type ReachAnchor } from "@border-empires/shared";

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

// Weight for a tile the scan can't classify at all — absent from tilesByKey,
// i.e. never delivered to this player (still fogged). Confirmed live: AIs
// were scoring beacon sites purely on what they could already see, so a
// beacon that would push vision 5 tiles into unexplored territory (and might
// reveal several more valuables once built) scored identically to one that
// revealed nothing, because unknown tiles contributed 0. Weighted between
// plain-waste LAND (1) and a confirmed valuable (8): revealing fog has real
// strategic value (it's how new valuables get discovered at all — see
// VALUABLE_TARGET_COVERAGE_WEIGHT's doc above) but shouldn't outrank a
// prize that's already confirmed to exist. Terrain is unknown for these
// tiles by definition, so unlike the LAND branch below this can't (and
// doesn't need to) check `terrain === "LAND"` first.
const UNEXPLORED_TILE_COVERAGE_WEIGHT = 4;

// Ceiling on how many unexplored cells' worth of score a single candidate
// can bank. Without this, raw tile count dominates: a candidate whose whole
// 121-cell scan box is fog (the common case for any frontier-adjacent site,
// or any young empire whose delivered-tile area is still small) scores
// 120 * 4 = 480 — dwarfing even several confirmed valuables (8 each) or an
// urgent BUILD_ECONOMY need (scoreBuildEconomy's logistic term alone is
// ~0.86 under real economic pressure — decisions.ts's scoreBuildEconomy),
// and would make the AI build beacons ahead of a starving economy purely
// because there happens to be a lot of fog nearby, every time.
//
// Capped at 4 so a purely-fogged site (no confirmed valuable anywhere in
// range) tops out at relayBeaconSiteValue 16 — linear(16, 1, 24) ≈ 0.65,
// comfortably below scoreBuildEconomy's ~0.86 under genuine need, so an
// urgently-needed economic build still wins the tick. It still clears the
// RELAY_BEACON_SITE_VALUE_FLOOR by a wide margin, so pure exploration is a
// real, competitive option once nothing more urgent is going on — just not
// a trump card over an empire's actual economic survival.
const UNEXPLORED_TILE_SAMPLE_CAP = 4;

// Cap on how many of the player's existing RELAY_BEACON tiles feed
// existingBeaconOverlapTileKeys below. Each anchor's box is a fixed ~121
// cells (radius 5), so even this generous a cap is cheap (a few tens of
// thousands of Set insertions, once per chooseBestRelayBeaconBuild call) —
// it exists as a defensive ceiling per AGENTS.md's AI CPU guardrails, not
// because real beacon counts are expected to approach it.
const RELAY_BEACON_OVERLAP_ANCHOR_CAP = 256;

// Statuses under which an owned RELAY_BEACON should count as "claiming" its
// reach box. "under_construction" is included deliberately — that's the
// entire point of this exclusion (see doc comment below): a beacon that
// hasn't gone active yet still WILL claim this ground shortly, and a second
// candidate shouldn't get credit for land the first is already about to
// cover. "removing" (queued for demolition) and "inactive" are excluded:
// neither is defending or about to defend anything, so land in their radius
// is genuinely still open for a new candidate to claim.
const BEACON_OVERLAP_CLAIMING_STATUSES: ReadonlySet<string> = new Set(["active", "under_construction"]);

/**
 * Tiles already within OUTPOST_REACH_RADIUS of a RELAY_BEACON this player
 * already owns — including one still under construction. gatherReachAnchors
 * (runtime.ts) only grants real reach once a beacon's status flips to
 * "active", but a player can have up to DEVELOPMENT_PROCESS_LIMIT (3, more
 * with some tech/wonders) builds in flight at once. Without this, two beacon
 * candidates proposed a few ticks apart — before the first one finishes and
 * actually grants reach — would each see the same unclaimed land as "new"
 * coverage, since estimateNewReachCoverage only excludes tiles already
 * OWNED, not tiles a sibling beacon is already about to cover. Computed once
 * per chooseBestRelayBeaconBuild call and reused across every candidate, not
 * per-candidate. Reuses tileKeysInReach (packages/shared/src/reach/reach.ts)
 * — the same wrapped-box computation the real reach border is built from —
 * rather than a second hand-rolled scan.
 */
const existingBeaconOverlapTileKeys = (
  playerId: string,
  ownedTiles: readonly StructurePlannerTile[]
): ReadonlySet<string> => {
  const claimed = new Set<string>();
  let anchorsScanned = 0;
  for (const tile of ownedTiles) {
    if (anchorsScanned >= RELAY_BEACON_OVERLAP_ANCHOR_CAP) break;
    const structure = tile.economicStructure;
    if (structure?.ownerId !== playerId || structure.type !== "RELAY_BEACON") continue;
    if (!structure.status || !BEACON_OVERLAP_CLAIMING_STATUSES.has(structure.status)) continue;
    anchorsScanned += 1;
    const anchor: ReachAnchor = { x: tile.x, y: tile.y, ownerId: playerId, activatedAt: 0, kind: "OUTPOST" };
    for (const key of tileKeysInReach(anchor)) claimed.add(key);
  }
  return claimed;
};

// Bounds ordinaryExpandReachTileKeys' scan of ownedTiles below. Real empires
// observed live top out around 1,667 owned tiles (docs/agents/topics/
// ai-planner.md) — this is a generous defensive ceiling per AGENTS.md's AI
// CPU guardrails, not a realistic limit; it exists so a synthetic/edge-case
// empire (e.g. tens of thousands of tiles) can't turn this into an unbounded
// scan.
const ORDINARY_REACH_SCAN_CAP = 4000;

/**
 * Every tile within Chebyshev distance 1 of any currently-owned tile —
 * ground plain EXPAND already reaches for free, no beacon required.
 * Computed once per chooseBestRelayBeaconBuild call (not per-candidate) and
 * reused across every candidate, same pattern as
 * existingBeaconOverlapTileKeys above. Deliberately keyed off ALL owned
 * tiles, not just the candidate itself: a prize sitting next to a
 * *different* owned tile than the one being evaluated as a beacon site is
 * just as EXPAND-reachable as one next to the candidate, and crediting it to
 * the beacon's coverage score would let BUILD_BEACON (which costs a dev slot
 * and, for a FRONTIER site, a SETTLE first) outscore and preempt a plain
 * EXPAND that would've claimed the same tile for free next tick.
 */
const ordinaryExpandReachTileKeys = (playerId: string, ownedTiles: readonly StructurePlannerTile[]): ReadonlySet<string> => {
  const reachable = new Set<string>();
  let scanned = 0;
  for (const tile of ownedTiles) {
    if (scanned >= ORDINARY_REACH_SCAN_CAP) break;
    if (tile.ownerId !== playerId) continue;
    scanned += 1;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        reachable.add(tileKeyOf(wrapX(tile.x + dx, WORLD_WIDTH), wrapY(tile.y + dy, WORLD_HEIGHT)));
      }
    }
  }
  return reachable;
};

const estimateNewReachCoverage = (
  playerId: string,
  tile: StructurePlannerTile,
  tilesByKey: TileLookup,
  alreadyClaimedTileKeys: ReadonlySet<string>,
  ordinaryReachTileKeys: ReadonlySet<string>
): { score: number; hasValuable: boolean } => {
  let covered = 0;
  let unexplored = 0;
  let hasValuable = false;
  let scanned = 0;
  outer: for (let dy = -OUTPOST_REACH_RADIUS; dy <= OUTPOST_REACH_RADIUS; dy += 1) {
    for (let dx = -OUTPOST_REACH_RADIUS; dx <= OUTPOST_REACH_RADIUS; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      scanned += 1;
      if (scanned > RELAY_BEACON_REACH_SAMPLE_CAP) break outer;
      const nx = wrapX(tile.x + dx, WORLD_WIDTH);
      const ny = wrapY(tile.y + dy, WORLD_HEIGHT);
      const neighborKey = tileKeyOf(nx, ny);
      // Already reachable via plain EXPAND from some owned tile (not
      // necessarily this candidate) — no beacon needed, so it doesn't count
      // as "new" coverage. Checked before the fog branch too: an unexplored
      // tile immediately next to owned land is still ordinary EXPAND range,
      // known or not.
      if (ordinaryReachTileKeys.has(neighborKey)) continue;
      const neighbor = tilesByKey.get(neighborKey);
      // Never delivered to this player at all — still fogged. Can't be
      // owned/claimed (both require having seen it), so it's tallied
      // separately and added, capped, after the loop — see
      // UNEXPLORED_TILE_SAMPLE_CAP's doc for why this can't just add
      // UNEXPLORED_TILE_COVERAGE_WEIGHT per tile like the branches below.
      if (!neighbor) {
        unexplored += 1;
        continue;
      }
      if (neighbor.terrain !== "LAND") continue;
      if (neighbor.ownerId === playerId) continue;
      if (alreadyClaimedTileKeys.has(neighborKey)) continue;
      const isValuable = Boolean(neighbor.town || neighbor.resource || neighbor.dockId || neighbor.naturalWonder);
      if (isValuable) hasValuable = true;
      covered += isValuable ? VALUABLE_TARGET_COVERAGE_WEIGHT : 1;
    }
  }
  covered += Math.min(unexplored, UNEXPLORED_TILE_SAMPLE_CAP) * UNEXPLORED_TILE_COVERAGE_WEIGHT;
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

  const alreadyClaimedTileKeys = existingBeaconOverlapTileKeys(player.id, ownedTiles);
  const ordinaryReachTileKeys = ordinaryExpandReachTileKeys(player.id, ownedTiles);

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
    const newCoverage = estimateNewReachCoverage(player.id, tile, tilesByKey, alreadyClaimedTileKeys, ordinaryReachTileKeys);
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
