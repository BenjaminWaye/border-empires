// The top of the Chronicle's Yours view for a returning player: what changed
// since they last looked, in up to four short statements. What the player's own
// orders produced comes first, then what was taken from them (visit loop report,
// docs/visit-as-a-turn.md §2.1). Labelled "Since you
// last looked": "Since you left" read wrong mid-session (Playtest Run 4).
// Playtesters had to piece "lost 129 tiles, all 4 towns, respawned" together from ~15 rows.
// Built only from the timeline the rows already use, plus the respawn notice
// the client already holds (state.respawnNotice).

import type { PersonalActivityCard, PersonalActivityTileFeatureCount, PersonalActivityTimeline } from "@border-empires/game-domain";
import { listNames, plural, roundedAmount, type PlayerNameLookup } from "../client-activity-dashboard/client-activity-dashboard-names.js";

/** The parts of a respawn notice the headline reads (client-types.ts PlayerRespawnNotice). */
export type ChronicleRespawn = { at: number; reasonCode: string; spawnTileKey?: string | undefined };

export type ChronicleHeadlineInput = {
  me: string;
  timeline: PersonalActivityTimeline;
  /** The read watermark when the Chronicle opened. */
  awaySince: number;
  respawn?: ChronicleRespawn | undefined;
  nameOf: PlayerNameLookup;
};

export type ChronicleHeadlineTally = {
  tilesLost: number;
  tilesGained: number;
  townsLost: number;
  townsTaken: number;
  afcsLost: number;
  /** The player's own builds that finished and waystations they activated. */
  buildingsCompleted: number;
  waystationsActivated: number;
  /** Set when the empire was wiped out and given a new start since; coordinates when known. */
  newStart?: { x: number; y: number } | "unknown";
  /** Who each truce that ended was with, once each. */
  trucesEnded: string[];
  coinRaided: number;
};

const afcCount = (features: readonly PersonalActivityTileFeatureCount[] | undefined): number =>
  (features ?? []).reduce((sum, feature) => sum + (feature.kind === "AFC" ? feature.count : 0), 0);

type Ground = { tilesLost: number; tilesGained: number; afcsLost: number };

/**
 * Tiles and AFCs one card moved. The aggregator gives each flip to one card
 * (a capture explained by an attack is not also on a territory card), so the
 * cards' counts add up without double counting.
 */
const cardGround = (card: PersonalActivityCard, me: string): Ground => {
  switch (card.kind) {
    case "TERRITORY_FLIP_GROUP":
      return card.direction === "LOST"
        ? { tilesLost: card.tileCount, tilesGained: 0, afcsLost: afcCount(card.features) }
        : { tilesLost: 0, tilesGained: card.tileCount, afcsLost: 0 };
    case "COMBAT": {
      const mine = card.attackerId === me;
      const captured = card.attackerWon ? 1 : 0;
      const seized = card.originSeized ? 1 : 0;
      return mine
        ? { tilesLost: seized, tilesGained: captured, afcsLost: seized ? afcCount(card.seizedOriginFeatures) : 0 }
        : { tilesLost: captured, tilesGained: seized, afcsLost: captured ? afcCount(card.capturedFeatures) : 0 };
    }
    case "COMBAT_GROUP":
      return card.role === "ATTACKER"
        ? { tilesLost: card.originsSeized, tilesGained: card.captures, afcsLost: afcCount(card.seizedOriginFeatures) }
        : { tilesLost: card.captures, tilesGained: card.originsSeized, afcsLost: afcCount(card.capturedFeatures) };
    case "SIEGE":
      return { tilesLost: card.outcome === "FELL" ? 1 : 0, tilesGained: card.originsSeized, afcsLost: card.outcome === "FELL" ? afcCount(card.capturedFeatures) : 0 };
    default:
      return { tilesLost: 0, tilesGained: 0, afcsLost: 0 };
  }
};

/** Coin taken from the player by one card's raids (sieges carry no coin figure). */
const cardCoinRaided = (card: PersonalActivityCard, me: string): number => {
  if (card.kind === "COMBAT") return card.defenderId === me ? card.defenderGoldLoss : 0;
  if (card.kind === "COMBAT_GROUP") return card.role === "DEFENDER" ? card.defenderGoldLoss : 0;
  return 0;
};

const parseTileKey = (key: string | undefined): { x: number; y: number } | undefined => {
  const [x, y] = (key ?? "").split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) && key ? { x: x as number, y: y as number } : undefined;
};

/**
 * Counts since `awaySince`. When the player was away for the whole window the
 * timeline's own summary counts are used: they count distinct tiles over every
 * flip, including cards the 100-card cap dropped. Otherwise only the cards
 * after the watermark count.
 */
export const chronicleHeadlineTally = (input: ChronicleHeadlineInput): ChronicleHeadlineTally => {
  const { me, timeline, awaySince } = input;
  const recent = timeline.cards.filter((card) => card.occurredAt > awaySince);
  const wholeWindow = awaySince <= timeline.from;
  const ground = recent.reduce<Ground>((sum, card) => {
    const g = cardGround(card, me);
    return { tilesLost: sum.tilesLost + g.tilesLost, tilesGained: sum.tilesGained + g.tilesGained, afcsLost: sum.afcsLost + g.afcsLost };
  }, { tilesLost: 0, tilesGained: 0, afcsLost: 0 });
  const townsLostCards = recent.filter((card) => card.kind === "TOWN_LOST").length;
  const townsTakenCards = recent.filter((card) => card.kind === "TOWN_CAPTURED").length;
  const builtCards = recent.filter((card) => card.kind === "BUILDING_COMPLETED").length;
  const waystationCards = recent.filter((card) => card.kind === "WAYSTATION_ACTIVATED").length;
  const truces = new Set<string>();
  for (const card of recent) {
    if (card.kind !== "DIPLOMACY") continue;
    // A truce the player broke themselves is not news to them.
    if (card.event === "TRUCE_ENDED" || (card.event === "TRUCE_BROKEN" && card.byPlayerId !== me)) {
      truces.add(input.nameOf(card.counterpartyPlayerId) ?? card.counterpartyName);
    }
  }
  const s = timeline.summary;
  const respawn = input.respawn;
  const wiped = respawn && respawn.reasonCode === "eliminated" && respawn.at > awaySince;
  return {
    tilesLost: wholeWindow ? s.tilesLost : ground.tilesLost,
    tilesGained: wholeWindow ? s.tilesClaimed : ground.tilesGained,
    townsLost: wholeWindow ? Math.max(s.townsLost, townsLostCards) : townsLostCards,
    townsTaken: wholeWindow ? Math.max(s.townsCaptured, townsTakenCards) : townsTakenCards,
    afcsLost: wholeWindow ? Math.max(afcCount(s.featuresLost), ground.afcsLost) : ground.afcsLost,
    buildingsCompleted: wholeWindow ? Math.max(s.buildingsCompleted, builtCards) : builtCards,
    waystationsActivated: wholeWindow ? Math.max(s.waystationsActivated, waystationCards) : waystationCards,
    ...(wiped ? { newStart: parseTileKey(respawn.spawnTileKey) ?? "unknown" } : {}),
    trucesEnded: [...truces],
    coinRaided: roundedAmount(wholeWindow ? timeline.goldRaidedFromYou : recent.reduce((sum, card) => sum + cardCoinRaided(card, me), 0))
  };
};

const count = (n: number): string => n.toLocaleString("en-US");
const tiles = (n: number): string => `${count(n)} tile${n === 1 ? "" : "s"}`;

/** Up to four short statements, the player's own results first; none when nothing headline-worthy happened. */
export const chronicleHeadlineLines = (tally: ChronicleHeadlineTally): string[] => {
  const lines: string[] = [];
  const results: string[] = [];
  if (tally.buildingsCompleted > 0) results.push(`Built ${plural(tally.buildingsCompleted, "structure")}`);
  if (tally.waystationsActivated > 0) results.push(`${results.length > 0 ? "activated" : "Activated"} ${plural(tally.waystationsActivated, "waystation")}`);
  const gained: string[] = [];
  if (tally.tilesGained > 0) gained.push(tiles(tally.tilesGained));
  if (tally.townsTaken > 0) gained.push(plural(tally.townsTaken, "town"));
  if (gained.length > 0) results.push(`${results.length > 0 ? "gained" : "Gained"} ${listNames(gained)}`);
  if (results.length > 0) lines.push(`${results.join(" · ")}.`);
  const lost: string[] = [];
  if (tally.tilesLost > 0) lost.push(tiles(tally.tilesLost));
  if (tally.townsLost > 0) lost.push(plural(tally.townsLost, "town"));
  // Named as the AFC: playtesters read an AFC loss as a town's.
  if (tally.afcsLost > 0) lost.push(tally.afcsLost === 1 ? "your AFC" : `${tally.afcsLost} AFCs`);
  if (lost.length > 0) lines.push(`Lost ${listNames(lost)}.`);
  if (tally.newStart) {
    lines.push(tally.newStart === "unknown" ? "Wiped out · new start given." : `Wiped out · new start at (${tally.newStart.x}, ${tally.newStart.y}).`);
  }
  const other: string[] = [];
  if (tally.trucesEnded.length > 0) other.push(`${tally.trucesEnded.length === 1 ? "Truce" : "Truces"} with ${listNames(tally.trucesEnded)} ended`);
  if (tally.coinRaided > 0) other.push(`${count(tally.coinRaided)} coin raided`);
  if (other.length > 0) lines.push(`${other.join(" · ")}.`);
  return lines;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The headline block, or "" when there is nothing to say. */
export const chronicleHeadlineHtml = (input: ChronicleHeadlineInput): string => {
  const lines = chronicleHeadlineLines(chronicleHeadlineTally(input));
  if (lines.length === 0) return "";
  // Nothing gained to open with: the block keeps its alarm colour.
  const lossOnly = /^(Lost|Wiped)/.test(lines[0] ?? "");
  return `<div class="v2c-headline${lossOnly ? " v2c-headline-loss" : ""}" role="status"><span class="v2c-headline-h">Since you last looked</span>${lines.map((line) => `<p class="v2c-headline-line">${esc(line)}</p>`).join("")}</div>`;
};
