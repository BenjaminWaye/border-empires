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

import { buildEconomyBoom, buildManpowerSurge } from "./player-growth.js";

type DailyStoryInput = Pick<
  ActivityApiResponse,
  | "wars"
  | "territoryMomentum"
  | "biggestSwing24h"
  | "frontlineHotspots"
  | "alliances"
  | "allianceBreaks"
  | "powerScore"
  | "manpowerLost24h"
  | "biggestBattle24h"
  | "growth"
>;

// alliances/allianceBreaks carry raw player ids on the wire (see
// social-activity-views.ts — that's a deliberate, separate decision from the
// *Name fields wars/territoryMomentum/etc. carry), so the story builder
// needs the same name resolver activity-api-response.ts already builds to
// narrate them.
type PlayerNameResolver = (playerId: string) => string;

// "1 tiles" / "1 flips" reads as broken English, and a quiet-day frontline
// hotspot can genuinely have only one contestant (e.g. a barbarian filtered
// out elsewhere), where "X flips between Alice" is equally wrong -- caught
// against real staging data, not invented.
const pluralize = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

const buildBiggestDefeat = (swing: DailyStoryInput["biggestSwing24h"]): DailyStoryEvent | undefined => {
  if (!swing || swing.tilesLost <= 0) return undefined;
  return {
    type: "BIGGEST_DEFEAT",
    headline: "Heaviest Defeat",
    text: `${swing.playerName} lost ${pluralize(swing.tilesLost, "tile")} today — the worst losses of the day.`,
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
    text: `${top.playerAName} and ${top.playerBName} are at war — ${pluralize(top.tileFlips24h, "tile")} changed hands today.`,
    significance: top.tileFlips24h,
    players: [top.playerAName, top.playerBName]
  };
};

const buildFiercestFighting = (hotspots: DailyStoryInput["frontlineHotspots"]): DailyStoryEvent | undefined => {
  const top = hotspots[0];
  if (!top || top.flips24h <= 0) return undefined;
  const flips = pluralize(top.flips24h, "flip");
  // A hotspot can have a single contestant (the other side got filtered out
  // upstream, e.g. an eliminated player) -- "between Alice" reads as broken
  // as "1 flips" did, so this isn't always a two-name sentence.
  const contested =
    top.contestedByNames.length === 1
      ? `${flips} involving ${top.contestedByNames[0]}`
      : `${flips} between ${top.contestedByNames.join(" and ")}`;
  return {
    type: "FIERCEST_FIGHTING",
    headline: "Fiercest Fighting",
    text: `The fiercest fighting today was at (${top.x}, ${top.y}) — ${contested}.`,
    significance: top.flips24h,
    players: top.contestedByNames,
    x: top.x,
    y: top.y
  };
};

const buildBloodiestBattle = (
  battle: DailyStoryInput["biggestBattle24h"],
  manpowerLost24h: DailyStoryInput["manpowerLost24h"]
): DailyStoryEvent | undefined => {
  if (!battle || battle.manpowerLoss <= 0) return undefined;
  const against = battle.defenderName ?? "unclaimed land";
  // "manpower" is uncountable (like "gold") -- never pluralize it with an
  // "s", unlike the countable "tile"/"flip" nouns pluralize() is for.
  const totalClause = manpowerLost24h > battle.manpowerLoss ? ` ${manpowerLost24h} manpower lost to combat across the realm today.` : "";
  return {
    type: "BLOODIEST_BATTLE",
    headline: "Bloodiest Battle",
    text: `The bloodiest battle today was ${battle.attackerName} against ${against} at (${battle.x}, ${battle.y}) — ${battle.manpowerLoss} manpower lost.${totalClause}`,
    significance: battle.manpowerLoss,
    players: battle.defenderName ? [battle.attackerName, battle.defenderName] : [battle.attackerName],
    x: battle.x,
    y: battle.y
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
    text: `${top.playerName} expanded fastest today, gaining ${pluralize(top.net24h, "tile")} net.`,
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
    text: `${leader.name} holds the strongest empire in the realm — ${pluralize(leader.tiles, "tile")}, score ${leader.score}.`,
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
    buildBloodiestBattle(input.biggestBattle24h, input.manpowerLost24h),
    buildAllianceFormed(input.alliances, nameFor),
    buildAllianceBroken(input.allianceBreaks, nameFor),
    buildFastestExpansion(input.territoryMomentum),
    buildEconomyBoom(input.growth),
    buildManpowerSurge(input.growth),
    buildStrongestEmpire(input.powerScore)
  ].filter((event): event is DailyStoryEvent => event !== undefined);

  return events.sort((a, b) => b.significance - a.significance);
};
