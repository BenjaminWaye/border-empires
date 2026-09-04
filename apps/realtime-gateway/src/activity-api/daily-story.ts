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

import { FIXED_SIGNIFICANCE, normalizeSignificance, SIGNIFICANCE_SCALE } from "./daily-story-significance.js";
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
    significance: normalizeSignificance(swing.tilesLost, SIGNIFICANCE_SCALE.tileCount),
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
    significance: normalizeSignificance(top.tileFlips24h, SIGNIFICANCE_SCALE.flipCount),
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
    significance: normalizeSignificance(top.flips24h, SIGNIFICANCE_SCALE.flipCount),
    players: top.contestedByNames,
    x: top.x,
    y: top.y
  };
};

const buildBloodiestBattle = (
  battle: DailyStoryInput["biggestBattle24h"]
): DailyStoryEvent | undefined => {
  if (!battle || battle.manpowerLoss <= 0) return undefined;
  const against = battle.defenderName ?? "unclaimed land";
  // "manpower" is uncountable (like "gold") -- never pluralize it with an
  // "s", unlike the countable "tile"/"flip" nouns pluralize() is for.
  return {
    type: "BLOODIEST_BATTLE",
    headline: "Bloodiest Battle",
    text: `The bloodiest battle today was ${battle.attackerName} against ${against} at (${battle.x}, ${battle.y}) — ${battle.manpowerLoss} manpower lost.`,
    significance: normalizeSignificance(battle.manpowerLoss, SIGNIFICANCE_SCALE.singleBattleManpower),
    players: battle.defenderName ? [battle.attackerName, battle.defenderName] : [battle.attackerName],
    x: battle.x,
    y: battle.y
  };
};

// Aggression, not damage taken: the player who spent the most manpower
// attacking (barbarian-origin attacks already excluded sim-side, see
// FiercestAttacker24h's doc comment -- they're rate-limited by cooldown, not
// manpower, so they never actually pay for the losses they'd otherwise log).
const buildFiercestAttacker = (fiercestAttacker24h: DailyStoryInput["fiercestAttacker24h"]): DailyStoryEvent | undefined => {
  if (!fiercestAttacker24h || fiercestAttacker24h.manpowerSpent <= 0) return undefined;
  return {
    type: "FIERCEST_ATTACKER",
    headline: "Fiercest Attacker",
    text: `${fiercestAttacker24h.attackerName} pressed hardest today, spending ${fiercestAttacker24h.manpowerSpent} manpower on attacks.`,
    significance: normalizeSignificance(fiercestAttacker24h.manpowerSpent, SIGNIFICANCE_SCALE.aggregateManpower),
    players: [fiercestAttacker24h.attackerName]
  };
};

// The complement to buildFiercestAttacker: who got attacked hardest, and
// whether it actually cost them anything. Cross-references territoryMomentum
// (already computed, not a new sim-side metric) for how many tiles that
// player actually lost in the same window -- a target that cost attackers
// dearly while losing zero ground is the more interesting story than the
// raw manpower figure alone, hence "not a tile lost" rather than just a number.
const buildToughestTarget = (
  toughestTarget24h: DailyStoryInput["toughestTarget24h"],
  territoryMomentum: DailyStoryInput["territoryMomentum"]
): DailyStoryEvent | undefined => {
  if (!toughestTarget24h || toughestTarget24h.manpowerSpentAgainst <= 0) return undefined;
  const tilesLost = territoryMomentum.find((entry) => entry.playerId === toughestTarget24h.defenderId)?.tilesLost24h ?? 0;
  const outcome = tilesLost === 0 ? "not a tile lost" : `just ${pluralize(tilesLost, "tile")} lost`;
  return {
    type: "TOUGHEST_TARGET",
    headline: "Toughest Target",
    text: `Attacking ${toughestTarget24h.defenderName} cost ${toughestTarget24h.manpowerSpentAgainst} manpower today — ${outcome}.`,
    significance: normalizeSignificance(toughestTarget24h.manpowerSpentAgainst, SIGNIFICANCE_SCALE.aggregateManpower),
    players: [toughestTarget24h.defenderName]
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
    significance: FIXED_SIGNIFICANCE.allianceFormed,
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
    significance: FIXED_SIGNIFICANCE.allianceBroken,
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
    significance: normalizeSignificance(top.net24h, SIGNIFICANCE_SCALE.tileCount),
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
    significance: FIXED_SIGNIFICANCE.strongestEmpire,
    players: [leader.name]
  };
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
    const alreadyTold = !isLocated && event.players.length > 0 && event.players.every((player) => covered.has(player));
    if (!alreadyTold) kept.push(event);
    for (const player of event.players) covered.add(player);
  }
  return kept;
};

/** Builds the day's narrated highlights, ranked most-significant first. */
export const buildDailyStory = (input: DailyStoryInput, nameFor: PlayerNameResolver): DailyStoryEvent[] => {
  const events = [
    buildBiggestDefeat(input.biggestSwing24h),
    buildOpenWar(input.wars),
    buildFiercestFighting(input.frontlineHotspots),
    buildBloodiestBattle(input.biggestBattle24h),
    buildFiercestAttacker(input.fiercestAttacker24h),
    buildToughestTarget(input.toughestTarget24h, input.territoryMomentum),
    buildAllianceFormed(input.alliances, nameFor),
    buildAllianceBroken(input.allianceBreaks, nameFor),
    buildFastestExpansion(input.territoryMomentum),
    buildEconomyBoom(input.growth),
    buildManpowerSurge(input.growth),
    buildStrongestEmpire(input.powerScore)
  ].filter((event): event is DailyStoryEvent => event !== undefined);

  return dedupeByPlayerSet(events.sort((a, b) => b.significance - a.significance));
};
