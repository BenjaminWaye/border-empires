import type { PersonalActivityCard, PersonalActivitySummary, PersonalActivityTimeline } from "@border-empires/game-domain";
import { structureDisplayName } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { combatCardText, combatGroupCardText, siegeCardText } from "./client-activity-dashboard-combat-text.js";
import { nameOf, roundedAmount, type PlayerNameLookup } from "./client-activity-dashboard-names.js";

export type { PlayerNameLookup };

// Materiality gate for the manpower-spent-attacking headline (plan §2.3):
// only surface it up top when it's both a large absolute number and a
// meaningful share of the player's current manpower cap -- otherwise it
// stays folded into the per-combat card detail, never the summary line.
const MANPOWER_HEADLINE_MIN_ABSOLUTE = 250;
const MANPOWER_HEADLINE_MIN_CAP_SHARE = 0.05;

export const shouldShowManpowerHeadline = (manpowerSpentAttacking: number, reportEndManpowerCap: number): boolean =>
  manpowerSpentAttacking >= MANPOWER_HEADLINE_MIN_ABSOLUTE &&
  reportEndManpowerCap > 0 &&
  manpowerSpentAttacking / reportEndManpowerCap >= MANPOWER_HEADLINE_MIN_CAP_SHARE;

// Coin amounts this small aren't worth headline space (and a sub-coin
// amount would otherwise round to a meaningless "−0 coin raided").
const SUMMARY_MIN_COIN = 5;

/** Line 1: counts and one-off transfers -- never merged with line 2's effects. */
export const summaryCountsLine = (summary: PersonalActivitySummary, timeline: PersonalActivityTimeline, reportEndManpowerCap: number): string => {
  const parts: string[] = [];
  if (summary.tilesClaimed > 0) parts.push(`+${summary.tilesClaimed} tiles claimed`);
  if (summary.tilesLost > 0) parts.push(`−${summary.tilesLost} tiles lost`);
  if (roundedAmount(timeline.goldRaidedFromYou) >= SUMMARY_MIN_COIN) parts.push(`−${roundedAmount(timeline.goldRaidedFromYou)} coin raided`);
  if (roundedAmount(timeline.goldPlundered) >= SUMMARY_MIN_COIN) parts.push(`+${roundedAmount(timeline.goldPlundered)} coin plundered`);
  if (summary.waystationsActivated > 0) parts.push(`${summary.waystationsActivated} waystation${summary.waystationsActivated === 1 ? "" : "s"} activated`);
  if (summary.townsCaptured > 0) parts.push(`+${summary.townsCaptured} town${summary.townsCaptured === 1 ? "" : "s"} captured`);
  if (summary.townsLost > 0) parts.push(`−${summary.townsLost} town${summary.townsLost === 1 ? "" : "s"} lost`);
  if (summary.buildingsCompleted > 0) parts.push(`${summary.buildingsCompleted} building${summary.buildingsCompleted === 1 ? "" : "s"} completed`);
  if (shouldShowManpowerHeadline(timeline.manpowerSpentAttacking, reportEndManpowerCap)) {
    parts.push(`${roundedAmount(timeline.manpowerSpentAttacking)} manpower spent attacking`);
  }
  return parts.join(" · ");
};

const AWAY_TRUNCATION_LABEL = (awayMs: number): string => {
  const days = Math.max(1, Math.round(awayMs / (24 * 60 * 60_000)));
  return `You were away ${days} day${days === 1 ? "" : "s"}. This activity history covers the latest 24 hours.`;
};

/** Truncation label (plan §4.2) -- never "since you were away" for a truncated report. */
export const truncationLabel = (timeline: Pick<PersonalActivityTimeline, "truncated" | "from" | "to">): string | undefined => {
  if (!timeline.truncated) return undefined;
  return AWAY_TRUNCATION_LABEL(timeline.to - timeline.from);
};

const timeLabel = (occurredAt: number): string => {
  const date = new Date(occurredAt);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

// An AI player's ClientState.playerNames entry is its diplomacy name (see
// client-owner-name.ts), so AI display names come from the leaderboard's live
// name, which is what the rest of the UI shows for them. Everyone else keeps resolving through
// playerNames, which a PLAYER_STYLE rename updates immediately while the
// leaderboard lags until the next status update. Build once per render.
export const activityPlayerNameLookup = (state: Pick<ClientState, "playerNames" | "leaderboard">): PlayerNameLookup => {
  const aiNames = new Map<string, string>();
  const { overall, byTiles, byIncome, byTechs } = state.leaderboard;
  for (const entry of [...overall, ...byTiles, ...byIncome, ...byTechs]) {
    if (entry.id.startsWith("ai-") && !aiNames.has(entry.id)) aiNames.set(entry.id, entry.name);
  }
  return (playerId) => aiNames.get(playerId) ?? state.playerNames.get(playerId);
};

// Resolves a tech id to its player-facing name (ClientState.techCatalog);
// an unknown id falls back to the raw id.
export type TechNameLookup = (techId: string) => string | undefined;

const territoryCardText = (card: Extract<PersonalActivityCard, { kind: "TERRITORY_FLIP_GROUP" }>, playerNames: PlayerNameLookup): string => {
  const counterparty = card.counterpartyPlayerId ? ` (${nameOf(card.counterpartyPlayerId, playerNames)})` : "";
  return card.direction === "GAINED"
    ? `+${card.tileCount} tile${card.tileCount === 1 ? "" : "s"} claimed${counterparty}`
    : `−${card.tileCount} tile${card.tileCount === 1 ? "" : "s"} lost${counterparty}`;
};

const waystationCardText = (card: Extract<PersonalActivityCard, { kind: "WAYSTATION_ACTIVATED" }>, techName: TechNameLookup): string => {
  if (card.grantedEffect === "TECH") return card.grantedTechId ? `Waystation activated · ${techName(card.grantedTechId) ?? card.grantedTechId} granted` : "Waystation activated · no unowned technology remained";
  if (card.grantedEffect === "RESOURCE_SLOT") return `Waystation activated · +1 ${card.grantedResource?.toLowerCase() ?? "resource"} slot`;
  if (card.grantedEffect === "GOLD") return `Waystation activated · +${roundedAmount(card.grantedGold ?? 0)} Coin`;
  if (card.grantedEffect === "MANPOWER") return `Waystation activated · +${roundedAmount(card.grantedManpower ?? 0)} manpower`;
  if (card.grantedEffect === "POPULATION") return card.populationBurst ? `Waystation activated · +${roundedAmount(card.populationBurst)} population` : "Waystation activated · no eligible town received population";
  return "Waystation activated · permanent vision revealed";
};

const townCardText = (card: Extract<PersonalActivityCard, { kind: "TOWN_CAPTURED" | "TOWN_LOST" }>): string => {
  const town = card.townName ?? card.townTier.toLowerCase();
  const outcome = card.kind === "TOWN_CAPTURED" ? `Captured ${town}` : `Lost ${town}`;
  const aftermath = card.townSurvived ? `${card.populationAfter} population remaining` : "settlement razed";
  return `${outcome} · ${aftermath}`;
};

const buildingCardText = (card: Extract<PersonalActivityCard, { kind: "BUILDING_COMPLETED" }>): string => {
  const parts = [`${structureDisplayName(card.structureType)} completed`];
  if (card.instantGold && card.instantGold > 0) parts.push(`+${roundedAmount(card.instantGold)} coin`);
  if (card.populationBurst && card.populationBurst > 0) parts.push(`+${roundedAmount(card.populationBurst)} population`);
  return parts.join(" · ");
};

/** One timeline row's display text, given the viewing player's id and a way to resolve names. */
export const activityCardText = (card: PersonalActivityCard, playerId: string, playerNames: PlayerNameLookup, techName: TechNameLookup = () => undefined): string => {
  if (card.kind === "COMBAT") return combatCardText(card, playerId, playerNames);
  if (card.kind === "COMBAT_GROUP") return combatGroupCardText(card, playerNames);
  if (card.kind === "SIEGE") return siegeCardText(card, playerNames);
  if (card.kind === "TERRITORY_FLIP_GROUP") return territoryCardText(card, playerNames);
  if (card.kind === "WAYSTATION_ACTIVATED") return waystationCardText(card, techName);
  if (card.kind === "TOWN_CAPTURED" || card.kind === "TOWN_LOST") return townCardText(card);
  if (card.kind === "BUILDING_COMPLETED") return buildingCardText(card);
  return `${card.hiddenCount} smaller event${card.hiddenCount === 1 ? "" : "s"} not shown`;
};

export const activityCardTimeLabel = (card: PersonalActivityCard): string => timeLabel(card.occurredAt);

/** Every concrete activity card carries a map location; the truncation note never does. */
export const activityCardCoordinates = (card: PersonalActivityCard): { x: number; y: number } | undefined =>
  card.kind === "TRUNCATION_NOTE" ? undefined : { x: card.x, y: card.y };
