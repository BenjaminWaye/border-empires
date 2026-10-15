// Alliance blocs and the Diplomatic Dominance victory: a bloc that controls
// enough land wins for its LARGEST member (season-victory-objectives.ts). So
// an AI only joins a bloc it would lead, and walks out of one the moment a
// partner outgrows it -- otherwise it would be handing someone else the win.
//
// Size is the leaderboard tile count, the gateway's closest view of the
// controlled-tile count the victory check uses.

/** Joining needs a clear lead, so alliances don't flip back and forth on small swings. */
export const ALLIANCE_LEAD_MARGIN = 1.1;

export type AllyLookup = (playerId: string) => readonly string[];
export type TileLookup = (playerId: string) => number;

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

export const aiWouldLeadAlliance = (aiPlayerId: string, requesterId: string, alliesOf: AllyLookup, tilesOf: TileLookup): boolean => {
  const largest = largestOtherMember(aiPlayerId, requesterId, alliesOf, tilesOf);
  // Small epsilon: 100 x 1.1 is 110.00000000000001 in floating point.
  return !largest || tilesOf(aiPlayerId) >= largest.tiles * ALLIANCE_LEAD_MARGIN - 1e-9;
};

/**
 * Direct allies the AI should leave because, through them, its bloc contains
 * someone at least as large as the AI. Leaving them is enough to make the AI
 * the largest member of whatever remains.
 */
export const alliancesAiShouldLeave = (aiPlayerId: string, alliesOf: AllyLookup, tilesOf: TileLookup): string[] => {
  const aiTiles = tilesOf(aiPlayerId);
  return alliesOf(aiPlayerId).filter((allyId) => {
    for (const memberId of allianceBloc(allyId, alliesOf, aiPlayerId)) {
      if (tilesOf(memberId) >= aiTiles) return true;
    }
    return false;
  });
};
