// Alliance blocs and the Diplomatic Dominance victory: a bloc that controls
// enough land wins for its LARGEST member (season-victory-objectives.ts). So
// an AI won't help a bloc it doesn't lead get close to that win: once the
// merged bloc would hold ALLIANCE_LEAD_REQUIRED_LAND_SHARE of the world's land
// it only joins if it would lead, and it walks out of a bloc it doesn't lead
// once that bloc reaches ALLIANCE_LEAVE_LAND_SHARE. Smaller blocs are far from
// any win, so an AI joins those as a junior partner too.
//
// "Leads" compares leaderboard tile counts. "How close to winning" uses the
// victory check's own numbers from the season summary: each member's weighted
// controlled tiles against the world's LAND tiles. When those are missing (a
// summary saved before they existed) the AI always demands to lead.

/** Joining needs a clear lead, so alliances don't flip back and forth on small swings. */
export const ALLIANCE_LEAD_MARGIN = 1.1;
/** Below this share of the world's land the merged bloc is no Dominance threat: the AI needn't lead it. */
export const ALLIANCE_LEAD_REQUIRED_LAND_SHARE = 0.4;
/** A bloc the AI doesn't lead that grows to this share makes it leave (above the join line, so it doesn't flip-flop). */
export const ALLIANCE_LEAVE_LAND_SHARE = 0.45;

export type AllyLookup = (playerId: string) => readonly string[];
export type TileLookup = (playerId: string) => number;
export type LeaderboardTiles = ReadonlyArray<{ id: string; tiles: number }>;
/** The season summary's Dominance numbers (see CurrentSeasonSummary.landTileCount / dominanceTilesByPlayerId). */
export type DominanceTotals = { landTileCount?: number; dominanceTilesByPlayerId?: Readonly<Record<string, number>> };
/** Leaderboard sizes plus the Dominance numbers (absent: unknown, so blocs are always judged strictly). */
export type SeasonSizes = DominanceTotals & { tiles: LeaderboardTiles };
/** How the victory check sizes a bloc: members' weighted controlled tiles against the world's land. */
export type DominanceSizing = { landTileCount: number; dominanceTilesOf: TileLookup };

/** undefined when the summary lacks either number: callers then judge every bloc strictly. */
export const dominanceSizingFor = (totals: DominanceTotals | undefined): DominanceSizing | undefined => {
  const landTileCount = totals?.landTileCount;
  const byPlayer = totals?.dominanceTilesByPlayerId;
  if (!byPlayer || landTileCount === undefined || !(landTileCount > 0)) return undefined;
  return { landTileCount, dominanceTilesOf: (playerId) => byPlayer[playerId] ?? 0 };
};

/** True when the bloc holds at least `share` of the world's land, or its size can't be judged. */
const nearDominance = (members: Iterable<string>, dominance: DominanceSizing | undefined, share: number): boolean => {
  if (!dominance) return true;
  let total = 0;
  for (const playerId of members) total += dominance.dominanceTilesOf(playerId);
  return total >= dominance.landTileCount * share;
};

/**
 * Tile counts from the leaderboard, or undefined when it can't vouch for the
 * AI's own size (empty, or the AI isn't on it): callers then neither join nor
 * leave an alliance on a guess. Players missing from a populated leaderboard
 * are inactive and genuinely hold no land.
 */
export const tileLookupFor = (entries: LeaderboardTiles, aiPlayerId: string): TileLookup | undefined => {
  const tiles = new Map<string, number>();
  for (const entry of entries) tiles.set(entry.id, entry.tiles);
  if (!tiles.has(aiPlayerId)) return undefined;
  return (playerId) => tiles.get(playerId) ?? 0;
};

/** Every player reachable through alliances from `startId`, never passing through `excludeId`. */
export const allianceBloc = (startId: string, alliesOf: AllyLookup, excludeId?: string): Set<string> => {
  const bloc = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const ally of alliesOf(current)) {
      if (ally === excludeId || bloc.has(ally)) continue;
      bloc.add(ally);
      queue.push(ally);
    }
  }
  return bloc;
};

/** The biggest other member of the bloc the AI would be in after allying with the requester. */
export const largestOtherMember = (
  aiPlayerId: string,
  requesterId: string,
  alliesOf: AllyLookup,
  tilesOf: TileLookup
): { playerId: string; tiles: number } | undefined => {
  const members = new Set([...allianceBloc(requesterId, alliesOf, aiPlayerId), ...allianceBloc(aiPlayerId, alliesOf)]);
  members.delete(aiPlayerId);
  let largest: { playerId: string; tiles: number } | undefined;
  for (const playerId of members) {
    const tiles = tilesOf(playerId);
    if (!largest || tiles > largest.tiles) largest = { playerId, tiles };
  }
  return largest;
};

/** Whether the AI would join the merged bloc on size grounds: it is small enough to be no Dominance threat, or the AI leads it. */
export const aiWouldLeadAlliance = (
  aiPlayerId: string,
  requesterId: string,
  alliesOf: AllyLookup,
  tilesOf: TileLookup,
  dominance?: DominanceSizing
): boolean => {
  const merged = new Set([...allianceBloc(requesterId, alliesOf, aiPlayerId), ...allianceBloc(aiPlayerId, alliesOf)]);
  if (!nearDominance(merged, dominance, ALLIANCE_LEAD_REQUIRED_LAND_SHARE)) return true;
  const largest = largestOtherMember(aiPlayerId, requesterId, alliesOf, tilesOf);
  // Small epsilon: 100 x 1.1 is 110.00000000000001 in floating point.
  return !largest || tilesOf(aiPlayerId) >= largest.tiles * ALLIANCE_LEAD_MARGIN - 1e-9;
};

/**
 * Direct allies the AI should leave because its bloc nears Dominance size and,
 * through them, contains someone at least as large as the AI. Leaving them is
 * enough to make the AI the largest member of whatever remains.
 */
export const alliancesAiShouldLeave = (aiPlayerId: string, alliesOf: AllyLookup, tilesOf: TileLookup, dominance?: DominanceSizing): string[] => {
  if (!nearDominance(allianceBloc(aiPlayerId, alliesOf), dominance, ALLIANCE_LEAVE_LAND_SHARE)) return [];
  const aiTiles = tilesOf(aiPlayerId);
  return alliesOf(aiPlayerId).filter((allyId) => {
    for (const memberId of allianceBloc(allyId, alliesOf, aiPlayerId)) {
      if (tilesOf(memberId) >= aiTiles) return true;
    }
    return false;
  });
};
