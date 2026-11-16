// Turns the already-computed, already-name-hydrated halves of GET
// /api/activity into a ranked "daily story" — a handful of narrated
// headlines a human would actually want to read or share, instead of raw
// leaderboard rows. Pure and derives everything from data the activity API
// already assembles (activity-api-response.ts); no new sim-side tracking.
//
// Voice: a war correspondent, not a spreadsheet. Active verbs ("hurled",
// "carved off", "broke through"), numbers grouped ("18,730"), and every cost
// paired with what it bought -- a reader should learn who is winning, not
// just how much was spent. Still no exclamation points, and every adjective
// must be true of the data (no "heroic" defence that lost 400 tiles).
import type {
  ActivityApiResponse,
  DailyStoryEvent
} from "@border-empires/game-domain";

import { buildBloodiestBattle, buildFiercestAttacker, buildFiercestFighting, buildToughestTarget } from "./daily-story-combat.js";
import { FIXED_SIGNIFICANCE, normalizeSignificance, SIGNIFICANCE_SCALE } from "./daily-story-significance.js";
import { formatCount, lossShareClause, pluralize, story, territoryLossShare } from "./daily-story-text.js";
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
  | "biggestBattle24h"
  | "fiercestAttacker24h"
  | "toughestTarget24h"
  | "growth"
>;

// alliances/allianceBreaks carry raw player ids on the wire (see
// social-activity-views.ts — that's a deliberate, separate decision from the
// *Name fields wars/territoryMomentum/etc. carry), so the story builder
// needs the same name resolver activity-api-response.ts already builds to
// narrate them.
type PlayerNameResolver = (playerId: string) => string;

const buildBiggestDefeat = (
  swing: DailyStoryInput["biggestSwing24h"],
  powerScore: DailyStoryInput["powerScore"]
): DailyStoryEvent | undefined => {
  if (!swing || swing.tilesLost <= 0) return undefined;
  const share = lossShareClause(territoryLossShare(swing.playerId, swing.tilesLost, powerScore));
  return story({
    type: "BIGGEST_DEFEAT",
    headline: "Heaviest Defeat",
    text: `${swing.playerName} lost ${pluralize(swing.tilesLost, "tile")} today${share} — more ground than any other empire.`,
    significance: normalizeSignificance(swing.tilesLost, SIGNIFICANCE_SCALE.tileCount),
    players: [swing.playerName]
  }, [swing.playerId]);
};

const buildOpenWar = (wars: DailyStoryInput["wars"]): DailyStoryEvent | undefined => {
  if (wars.length === 0) return undefined;
  // Ranked and scored on distinct tiles, the same number the text quotes.
  const top = [...wars].sort((a, b) => b.tilesContested24h - a.tilesContested24h)[0];
  if (!top || top.tilesContested24h <= 0) return undefined;
  return story({
    type: "OPEN_WAR",
    headline: "Open War",
    text: `${top.playerAName} and ${top.playerBName} are locked in open war — ${pluralize(top.tilesContested24h, "tile")} changed hands today.`,
    significance: normalizeSignificance(top.tilesContested24h, SIGNIFICANCE_SCALE.tileCount),
    players: [top.playerAName, top.playerBName]
  }, [top.playerA, top.playerB]);
};

// When the day's heaviest defeat happened inside the day's biggest war, the
// two were read as separate headlines ("Alden lost 475 tiles" then "Alden and
// Freja are at war — 476 tiles changed hands") -- one story told twice, and
// dedupeByPlayerSet can't catch it because the war names a new player. Fold
// the loss into the war headline instead, so it reads as one escalating
// story with a clear loser.
const mergeDefeatIntoWar = (
  war: DailyStoryEvent | undefined,
  defeat: DailyStoryEvent | undefined,
  swing: DailyStoryInput["biggestSwing24h"],
  powerScore: DailyStoryInput["powerScore"]
): DailyStoryEvent[] => {
  if (!war || !defeat || !swing || !war.participantIds.includes(swing.playerId)) {
    return [war, defeat].filter((event): event is DailyStoryEvent => event !== undefined);
  }
  const share = lossShareClause(territoryLossShare(swing.playerId, swing.tilesLost, powerScore));
  const text = `${war.text} ${swing.playerName} is bleeding worst: ${pluralize(swing.tilesLost, "tile")} lost${share}, more than any empire.`;
  return [story({ ...war, text, significance: Math.max(war.significance, defeat.significance) }, war.participantIds)];
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
  return story({
    type: "ALLIANCE_FORMED",
    headline: "New Alliance",
    text: `${playerA} and ${playerB} have sealed an alliance.`,
    // Fixed weight, not tile-count-derived — an alliance is dramatic
    // regardless of either empire's current size.
    significance: FIXED_SIGNIFICANCE.allianceFormed,
    players: [playerA, playerB]
  }, [newest.playerA, newest.playerB]);
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
  const betrayed = nameFor(newest.brokenBy === newest.playerA ? newest.playerB : newest.playerA);
  return story({
    type: "ALLIANCE_BROKEN",
    headline: "Alliance Broken",
    text: `${brokenBy} has broken their alliance with ${betrayed}.`,
    significance: FIXED_SIGNIFICANCE.allianceBroken,
    players: [playerA, playerB]
  }, [newest.playerA, newest.playerB, newest.brokenBy]);
};

const buildFastestExpansion = (momentum: DailyStoryInput["territoryMomentum"]): DailyStoryEvent | undefined => {
  if (momentum.length === 0) return undefined;
  const top = [...momentum].sort((a, b) => b.net24h - a.net24h)[0];
  if (!top || top.net24h <= 0) return undefined;
  return story({
    type: "FASTEST_EXPANSION",
    headline: "Fastest Expansion",
    text: `${top.playerName} grew faster than any empire today — a net ${pluralize(top.net24h, "tile")} gained.`,
    significance: normalizeSignificance(top.net24h, SIGNIFICANCE_SCALE.tileCount),
    players: [top.playerName]
  }, [top.playerId]);
};

const buildStrongestEmpire = (powerScore: DailyStoryInput["powerScore"]): DailyStoryEvent | undefined => {
  const leader = powerScore[0];
  if (!leader) return undefined;
  return story({
    type: "STRONGEST_EMPIRE",
    headline: "Standing",
    text: `${leader.name} still holds the strongest empire in the realm — ${pluralize(leader.tiles, "tile")}, score ${formatCount(leader.score)}.`,
    // Fixed low weight — this is a standing, not news; it should rarely
    // outrank an actual event of the day.
    significance: FIXED_SIGNIFICANCE.strongestEmpire,
    players: [leader.name]
  }, [leader.id]);
};

// Collapses events that are really the same story told twice: once a player
// pair has anchored a higher-ranked event (say, Open War between A and B),
// a later, lower-ranked event about a subset of the same players and with no
// place attached (Heaviest Defeat for A alone, Standing for A) adds nothing
// a reader hasn't already been told, so it's dropped rather than padding the
// digest with the same border conflict narrated four different ways.
// Deliberately a SUBSET check, not an overlap check: an event introducing
// even one new name (e.g. a three-way situation) still earns its place.
//
// A located event (x/y set -- Fiercest Fighting, Bloodiest Battle) is never
// dropped by this even when its players are already fully covered: naming a
// specific tile is itself new information about an already-known rivalry
// (WHERE they're fighting, not just THAT they're fighting), not a repeat of
// it. It still contributes its players to `covered` so a later, unlocated
// event about the same pair is still correctly dropped.
const dedupeByPlayerSet = (events: readonly DailyStoryEvent[]): DailyStoryEvent[] => {
  const covered = new Set<string>();
  const kept: DailyStoryEvent[] = [];
  for (const event of events) {
    const isLocated = typeof event.x === "number";
    const alreadyTold = !isLocated && event.participantIds.length > 0 && event.participantIds.every((playerId) => covered.has(playerId));
    if (!alreadyTold) kept.push(event);
    for (const player of event.participantIds) covered.add(player);
  }
  return kept;
};

/** Builds the day's narrated highlights, ranked most-significant first. */
export const buildDailyStory = (input: DailyStoryInput, nameFor: PlayerNameResolver): DailyStoryEvent[] => {
  const events = [
    ...mergeDefeatIntoWar(
      buildOpenWar(input.wars),
      buildBiggestDefeat(input.biggestSwing24h, input.powerScore),
      input.biggestSwing24h,
      input.powerScore
    ),
    buildFiercestFighting(input.frontlineHotspots),
    buildBloodiestBattle(input.biggestBattle24h),
    buildFiercestAttacker(input.fiercestAttacker24h, input.territoryMomentum),
    buildToughestTarget(input.toughestTarget24h, input.territoryMomentum, input.powerScore),
    buildAllianceFormed(input.alliances, nameFor),
    buildAllianceBroken(input.allianceBreaks, nameFor),
    buildFastestExpansion(input.territoryMomentum),
    buildEconomyBoom(input.growth),
    buildManpowerSurge(input.growth),
    buildStrongestEmpire(input.powerScore)
  ].filter((event): event is DailyStoryEvent => event !== undefined);

  return dedupeByPlayerSet(events.sort((a, b) => b.significance - a.significance));
};
