import type { PersonalActivityCard, PersonalActivitySummary, PersonalActivityTimeline } from "@border-empires/game-domain";

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

/** Line 1: counts and one-off transfers -- never merged with line 2's effects. */
export const summaryCountsLine = (summary: PersonalActivitySummary, timeline: PersonalActivityTimeline, reportEndManpowerCap: number): string => {
  const parts: string[] = [];
  if (summary.tilesClaimed > 0) parts.push(`+${summary.tilesClaimed} tiles claimed`);
  if (summary.tilesLost > 0) parts.push(`−${summary.tilesLost} tiles lost`);
  if (timeline.goldRaidedFromYou > 0) parts.push(`−${timeline.goldRaidedFromYou} gold raided`);
  if (timeline.goldPlundered > 0) parts.push(`+${timeline.goldPlundered} gold plundered`);
  if (summary.waystationsActivated > 0) parts.push(`${summary.waystationsActivated} waystation${summary.waystationsActivated === 1 ? "" : "s"} activated`);
  if (summary.townsCaptured > 0) parts.push(`+${summary.townsCaptured} town${summary.townsCaptured === 1 ? "" : "s"} captured`);
  if (summary.townsLost > 0) parts.push(`−${summary.townsLost} town${summary.townsLost === 1 ? "" : "s"} lost`);
  if (summary.buildingsCompleted > 0) parts.push(`${summary.buildingsCompleted} building${summary.buildingsCompleted === 1 ? "" : "s"} completed`);
  if (shouldShowManpowerHeadline(timeline.manpowerSpentAttacking, reportEndManpowerCap)) {
    parts.push(`${timeline.manpowerSpentAttacking} manpower spent attacking`);
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

const combatCardText = (card: Extract<PersonalActivityCard, { kind: "COMBAT" }>, playerId: string): string => {
  const iWasAttacker = card.attackerId === playerId;
  const outcome = card.attackerWon ? (iWasAttacker ? "captured a tile" : "lost a tile to attack") : iWasAttacker ? "attack was repelled" : "defended successfully";
  const parts = [outcome];
  if (iWasAttacker && card.pillagedGold > 0) parts.push(`${card.pillagedGold} gold plundered`);
  if (!iWasAttacker && card.defenderGoldLoss > 0) parts.push(`−${card.defenderGoldLoss} gold raided from you`);
  return parts.join(" · ");
};

const territoryCardText = (card: Extract<PersonalActivityCard, { kind: "TERRITORY_FLIP_GROUP" }>): string =>
  card.direction === "GAINED"
    ? `+${card.tileCount} tile${card.tileCount === 1 ? "" : "s"} claimed`
    : `−${card.tileCount} tile${card.tileCount === 1 ? "" : "s"} lost`;

/** One timeline row's display text, given the viewing player's id. */
export const activityCardText = (card: PersonalActivityCard, playerId: string): string => {
  if (card.kind === "COMBAT") return combatCardText(card, playerId);
  if (card.kind === "TERRITORY_FLIP_GROUP") return territoryCardText(card);
  return `${card.hiddenCount} smaller event${card.hiddenCount === 1 ? "" : "s"} not shown`;
};

export const activityCardTimeLabel = (card: PersonalActivityCard): string => timeLabel(card.occurredAt);

/** Only territory/combat cards carry a real map location; the truncation note never does. */
export const activityCardCoordinates = (card: PersonalActivityCard): { x: number; y: number } | undefined =>
  card.kind === "TRUNCATION_NOTE" ? undefined : { x: card.x, y: card.y };
