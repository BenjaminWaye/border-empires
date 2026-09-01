// Turns the already-computed, already-name-hydrated halves of GET
// /api/activity into a ranked "daily story" — a handful of narrated
// headlines a human would actually want to read or share, instead of raw
// leaderboard rows. Pure and derives everything from data the activity API
// already assembles (activity-api-response.ts); no new sim-side tracking.
//
// Voice: matches the game's own in-fiction alert copy (see
// packages/client/src/client-alerts/client-alerts.ts and
// apps/simulation/src/runtime/runtime-ownership-change-sample.ts) — terse,
// present-passive, numbers stated plainly, coordinates in parens, no
// exclamation points, no adjectives that aren't load-bearing.
import type {
  ActivityApiResponse,
  DailyStoryEvent
} from "@border-empires/game-domain";

type DailyStoryInput = Pick<
  ActivityApiResponse,
  "wars" | "territoryMomentum" | "biggestSwing24h" | "frontlineHotspots" | "alliances" | "allianceBreaks" | "powerScore"
>;

// alliances/allianceBreaks carry raw player ids on the wire (see
// social-activity-views.ts — that's a deliberate, separate decision from the
// *Name fields wars/territoryMomentum/etc. carry), so the story builder
// needs the same name resolver activity-api-response.ts already builds to
// narrate them.
type PlayerNameResolver = (playerId: string) => string;

const buildBiggestDefeat = (swing: DailyStoryInput["biggestSwing24h"]): DailyStoryEvent | undefined => {
  if (!swing || swing.tilesLost <= 0) return undefined;
  return {
    type: "BIGGEST_DEFEAT",
    headline: "Heaviest Defeat",
    text: `${swing.playerName} lost ${swing.tilesLost} tiles today — the worst losses of the day.`,
    significance: swing.tilesLost,
    players: [swing.playerName]
  };
};

const buildOpenWar = (wars: DailyStoryInput["wars"]): DailyStoryEvent | undefined => {
  if (wars.length === 0) return undefined;
  const top = [...wars].sort((a, b) => b.tileFlips24h - a.tileFlips24h)[0];
  if (!top || top.tileFlips24h <= 0) return undefined;
  return {
    type: "OPEN_WAR",
    headline: "Open War",
    text: `${top.playerAName} and ${top.playerBName} are at war — ${top.tileFlips24h} tiles changed hands today.`,
    significance: top.tileFlips24h,
    players: [top.playerAName, top.playerBName]
  };
};

const buildFiercestFighting = (hotspots: DailyStoryInput["frontlineHotspots"]): DailyStoryEvent | undefined => {
  const top = hotspots[0];
  if (!top || top.flips24h <= 0) return undefined;
  return {
    type: "FIERCEST_FIGHTING",
    headline: "Fiercest Fighting",
    text: `The fiercest fighting today was at (${top.x}, ${top.y}) — ${top.flips24h} flips between ${top.contestedByNames.join(" and ")}.`,
    significance: top.flips24h,
    players: top.contestedByNames,
    x: top.x,
    y: top.y
  };
};

const buildAllianceFormed = (
  alliances: DailyStoryInput["alliances"],
  nameFor: PlayerNameResolver
): DailyStoryEvent | undefined => {
  if (alliances.length === 0) return undefined;
  const newest = [...alliances].sort((a, b) => b.since - a.since)[0];
  if (!newest) return undefined;
  const playerA = nameFor(newest.playerA);
  const playerB = nameFor(newest.playerB);
  return {
    type: "ALLIANCE_FORMED",
    headline: "New Alliance",
    text: `${playerA} and ${playerB} have formed an alliance.`,
    // Fixed weight, not tile-count-derived — an alliance is dramatic
    // regardless of either empire's current size.
    significance: 40,
    players: [playerA, playerB]
  };
};

const buildAllianceBroken = (
  breaks: DailyStoryInput["allianceBreaks"],
  nameFor: PlayerNameResolver
): DailyStoryEvent | undefined => {
  if (breaks.length === 0) return undefined;
  const newest = [...breaks].sort((a, b) => b.brokenAt - a.brokenAt)[0];
  if (!newest) return undefined;
  const playerA = nameFor(newest.playerA);
  const playerB = nameFor(newest.playerB);
  const brokenBy = nameFor(newest.brokenBy);
  return {
    type: "ALLIANCE_BROKEN",
    headline: "Alliance Broken",
    text: `${playerA} and ${playerB}'s alliance was broken by ${brokenBy}.`,
    significance: 50,
    players: [playerA, playerB]
  };
};

const buildFastestExpansion = (momentum: DailyStoryInput["territoryMomentum"]): DailyStoryEvent | undefined => {
  if (momentum.length === 0) return undefined;
  const top = [...momentum].sort((a, b) => b.net24h - a.net24h)[0];
  if (!top || top.net24h <= 0) return undefined;
  return {
    type: "FASTEST_EXPANSION",
    headline: "Fastest Expansion",
    text: `${top.playerName} expanded fastest today, gaining ${top.net24h} tiles net.`,
    significance: top.net24h,
    players: [top.playerName]
  };
};

const buildStrongestEmpire = (powerScore: DailyStoryInput["powerScore"]): DailyStoryEvent | undefined => {
  const leader = powerScore[0];
  if (!leader) return undefined;
  return {
    type: "STRONGEST_EMPIRE",
    headline: "Standing",
    text: `${leader.name} holds the strongest empire in the realm — ${leader.tiles} tiles, score ${leader.score}.`,
    // Fixed low weight — this is a standing, not news; it should rarely
    // outrank an actual event of the day.
    significance: 5,
    players: [leader.name]
  };
};

/** Builds the day's narrated highlights, ranked most-significant first. */
export const buildDailyStory = (input: DailyStoryInput, nameFor: PlayerNameResolver): DailyStoryEvent[] => {
  const events = [
    buildBiggestDefeat(input.biggestSwing24h),
    buildOpenWar(input.wars),
    buildFiercestFighting(input.frontlineHotspots),
    buildAllianceFormed(input.alliances, nameFor),
    buildAllianceBroken(input.allianceBreaks, nameFor),
    buildFastestExpansion(input.territoryMomentum),
    buildStrongestEmpire(input.powerScore)
  ].filter((event): event is DailyStoryEvent => event !== undefined);

  return events.sort((a, b) => b.significance - a.significance);
};
