// Alliance blocs and the Diplomatic Dominance victory: a bloc that controls
// enough land wins for its LARGEST member (season-victory-objectives.ts). So
// an AI won't help a bloc it doesn't lead get close to that win: once the
// merged bloc would hold ALLIANCE_LEAD_REQUIRED_LAND_SHARE of the world's land
// it only joins if it would lead, and it walks out of a bloc it doesn't lead
// once that bloc reaches ALLIANCE_LEAVE_LAND_SHARE. Smaller blocs are far from
// any win, so an AI joins those as a junior partner too.
//
// Size is the leaderboard tile count, the gateway's closest view of the
// controlled-tile count the victory check uses. When the world's land count is
// unknown (an older simulation summary) the AI always demands to lead.

/** Joining needs a clear lead, so alliances don't flip back and forth on small swings. */
export const ALLIANCE_LEAD_MARGIN = 1.1;
/** Below this share of the world's land the merged bloc is no Dominance threat: the AI needn't lead it. */
export const ALLIANCE_LEAD_REQUIRED_LAND_SHARE = 0.4;
/** A bloc the AI doesn't lead that grows to this share makes it leave (above the join line, so it doesn't flip-flop). */
export const ALLIANCE_LEAVE_LAND_SHARE = 0.45;

export type AllyLookup = (playerId: string) => readonly string[];
export type TileLookup = (playerId: string) => number;
export type LeaderboardTiles = ReadonlyArray<{ id: string; tiles: number }>;
/** Leaderboard sizes plus the world's land tile count (undefined: unknown, so blocs are always judged strictly). */
export type SeasonSizes = { tiles: LeaderboardTiles; landTileCount?: number };

const blocTiles = (members: Iterable<string>, tilesOf: TileLookup): number => {
  let total = 0;
  for (const playerId of members) total += tilesOf(playerId);
  return total;
};

/** True when a bloc this size holds at least `share` of the world's land, or the land count is unknown. */
const nearDominance = (tiles: number, landTileCount: number | undefined, share: number): boolean =>
  landTileCount === undefined || !(landTileCount > 0) || tiles >= landTileCount * share;

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
  landTileCount?: number
): boolean => {
  const merged = new Set([...allianceBloc(requesterId, alliesOf, aiPlayerId), ...allianceBloc(aiPlayerId, alliesOf)]);
  if (!nearDominance(blocTiles(merged, tilesOf), landTileCount, ALLIANCE_LEAD_REQUIRED_LAND_SHARE)) return true;
  const largest = largestOtherMember(aiPlayerId, requesterId, alliesOf, tilesOf);
  // Small epsilon: 100 x 1.1 is 110.00000000000001 in floating point.
  return !largest || tilesOf(aiPlayerId) >= largest.tiles * ALLIANCE_LEAD_MARGIN - 1e-9;
};

/**
 * Direct allies the AI should leave because its bloc nears Dominance size and,
 * through them, contains someone at least as large as the AI. Leaving them is
 * enough to make the AI the largest member of whatever remains.
 */
export const alliancesAiShouldLeave = (aiPlayerId: string, alliesOf: AllyLookup, tilesOf: TileLookup, landTileCount?: number): string[] => {
  if (!nearDominance(blocTiles(allianceBloc(aiPlayerId, alliesOf), tilesOf), landTileCount, ALLIANCE_LEAVE_LAND_SHARE)) return [];
  const aiTiles = tilesOf(aiPlayerId);
  return alliesOf(aiPlayerId).filter((allyId) => {
    for (const memberId of allianceBloc(allyId, alliesOf, aiPlayerId)) {
      if (tilesOf(memberId) >= aiTiles) return true;
    }
    return false;
  });
};
