// The manpower-driven daily-story headlines: Fiercest Fighting, Bloodiest
// Battle, Fiercest Attacker and Toughest Target / Under Siege. Split from
// daily-story.ts so each event's wording and its outcome logic sit together.
//
// Every one of these used to quote only what was SPENT ("cost 18730
// manpower"), never what it BOUGHT, so a reader couldn't tell a heroic
// defence from a rout. Each now pairs the cost with the result the same
// activity data already carries: tiles gained or lost, and whether the
// assault broke through.
import type { ActivityApiResponse, DailyStoryEvent } from "@border-empires/game-domain";

import { normalizeSignificance, SIGNIFICANCE_SCALE } from "./daily-story-significance.js";
import { formatCount, lossShareClause, MEANINGFUL_LOSS_SHARE, pluralize, story, territoryLossShare, timesPhrase } from "./daily-story-text.js";

type CombatInput = Pick<
  ActivityApiResponse,
  "frontlineHotspots" | "biggestBattle24h" | "fiercestAttacker24h" | "toughestTarget24h" | "territoryMomentum"
>;

// "manpower" is uncountable (like "gold") -- never pluralize it.
const manpower = (amount: number): string => `${formatCount(amount)} manpower`;

export const buildFiercestFighting = (hotspots: CombatInput["frontlineHotspots"]): DailyStoryEvent | undefined => {
  const top = hotspots[0];
  if (!top || top.flips24h <= 0 || top.contestedByNames.length === 0) return undefined;
  // A hotspot can have a single contestant (the other side got filtered out
  // upstream, e.g. an eliminated player) -- "between Alice" reads broken.
  const front =
    top.contestedByNames.length === 1
      ? `${top.contestedByNames[0]}'s front`
      : `The front between ${top.contestedByNames.join(" and ")}`;
  const cost = top.manpowerLost24h > 0 ? ` — ${manpower(top.manpowerLost24h)} lost there` : "";
  const changed = `changed hands ${timesPhrase(top.flips24h)}`;
  return story({
    type: "FIERCEST_FIGHTING",
    headline: "Fiercest Fighting",
    text: `${front} ${changed} at (${top.x}, ${top.y}) today${cost}.`,
    significance: normalizeSignificance(top.flips24h, SIGNIFICANCE_SCALE.flipCount),
    players: top.contestedByNames,
    x: top.x,
    y: top.y
  }, top.contestedBy, `${front} ${changed} today${cost}.`);
};

export const buildBloodiestBattle = (battle: CombatInput["biggestBattle24h"]): DailyStoryEvent | undefined => {
  if (!battle || battle.manpowerLoss <= 0) return undefined;
  // The logged loss is the attacker's committed manpower, win or lose -- so
  // the outcome is the half of the story the old copy left out.
  const target = battle.defenderName ?? "unclaimed land";
  const outcome = battle.attackerWon ? "and broke through" : "and was thrown back";
  const lead = `${battle.attackerName} lost ${manpower(battle.manpowerLoss)} in a single assault on ${target}`;
  return story({
    type: "BLOODIEST_BATTLE",
    headline: "Bloodiest Battle",
    text: `${lead} at (${battle.x}, ${battle.y}) — ${outcome}.`,
    significance: normalizeSignificance(battle.manpowerLoss, SIGNIFICANCE_SCALE.singleBattleManpower),
    players: battle.defenderName ? [battle.attackerName, battle.defenderName] : [battle.attackerName],
    x: battle.x,
    y: battle.y
  }, battle.defenderId ? [battle.attackerId, battle.defenderId] : [battle.attackerId], `${lead} — ${outcome}.`);
};

// Aggression, not damage taken: the player who spent the most manpower
// attacking (barbarian-origin attacks already excluded sim-side, see
// FiercestAttacker24h's doc comment). Paired with the tiles that player
// gained in the same window (territoryMomentum), so the reader learns
// whether the spending paid off. Net, not gross: tilesGained24h also counts
// neutral claims and tiles retaken after being lost, so "took 312 tiles"
// could describe an empire that shrank by 88 that day. An attacker absent
// from territoryMomentum had no ownership changes at all, i.e. net 0.
export const buildFiercestAttacker = (
  attacker: CombatInput["fiercestAttacker24h"],
  territoryMomentum: CombatInput["territoryMomentum"]
): DailyStoryEvent | undefined => {
  if (!attacker || attacker.manpowerSpent <= 0) return undefined;
  const net = territoryMomentum.find((entry) => entry.playerId === attacker.attackerId)?.net24h ?? 0;
  const lead = `${attacker.attackerName} spent ${manpower(attacker.manpowerSpent)} on attacks today — more than anyone —`;
  const text =
    net > 0
      ? `${lead} and came out ${pluralize(net, "tile")} ahead.`
      : net < 0
        ? `${lead} yet still ended the day ${pluralize(-net, "tile")} down.`
        : `${lead} but gained no ground.`;
  return story({
    type: "FIERCEST_ATTACKER",
    headline: "Fiercest Attacker",
    text,
    significance: normalizeSignificance(attacker.manpowerSpent, SIGNIFICANCE_SCALE.aggregateManpower),
    players: [attacker.attackerName]
  }, [attacker.attackerId]);
};

// A defence "held" when it gave up nothing, or only a sliver of the realm.
// Without a known realm size (not on the leaderboard), a small absolute count
// stands in for "a sliver".
const HELD_ABSOLUTE_TILE_LIMIT = 10;

// Who got attacked hardest, and what it cost them. The old copy always
// framed this as a heroic defence ("just 405 tiles lost") even when the
// target lost almost as much ground as the day's heaviest defeat -- caught
// on staging, 2026-11-16 (Sigrid: 18,730 manpower spent against, 405 tiles
// lost). Now it only says "held the line" when the defence actually held,
// and otherwise reports the siege for what it was. The day's heaviest loser
// never "held", whatever its size: a 5,000-tile realm losing 450 tiles is
// under 10% but still the worst losses of the day. Tiles lost are counted
// from every cause, so the copy says the defender LOST them rather than
// that these attackers took them.
export const buildToughestTarget = (
  target: CombatInput["toughestTarget24h"],
  territoryMomentum: CombatInput["territoryMomentum"],
  heaviestLoserId: string | undefined
): DailyStoryEvent | undefined => {
  if (!target || target.manpowerSpentAgainst <= 0) return undefined;
  const tilesLost = territoryMomentum.find((entry) => entry.playerId === target.defenderId)?.tilesLost24h ?? 0;
  const share = territoryLossShare(target.defenderId, tilesLost, territoryMomentum);
  const isHeaviestLoser = tilesLost > 0 && target.defenderId === heaviestLoserId;
  const smallLoss = share === undefined ? tilesLost <= HELD_ABSOLUTE_TILE_LIMIT : share < MEANINGFUL_LOSS_SHARE;
  const held = tilesLost === 0 || (smallLoss && !isHeaviestLoser);
  const spent = manpower(target.manpowerSpentAgainst);
  const name = target.defenderName;
  const text = held
    ? `Rivals hurled ${spent} at ${name} today, yet ${name} lost ${tilesLost === 0 ? "not a single tile" : `only ${pluralize(tilesLost, "tile")}`}.`
    : `${name} was the most attacked empire today — rivals hurled ${spent} at them, and ${name} lost ${pluralize(tilesLost, "tile")}${lossShareClause(share)}.`;
  return story({
    type: "TOUGHEST_TARGET",
    headline: held ? "Held the Line" : "Under Siege",
    text,
    significance: normalizeSignificance(target.manpowerSpentAgainst, SIGNIFICANCE_SCALE.aggregateManpower),
    players: [name]
  }, [target.defenderId]);
};
