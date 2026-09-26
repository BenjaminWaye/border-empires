import type { PersonalActivityCard, PersonalActivityTruncationNoteCard } from "@border-empires/game-domain";

// "Highest-impact" per card kind (docs/activity-dashboard-plan.md 4.1):
// tile count for a territory group, manpower cost for a combat card. The
// synthetic truncation note itself is never a candidate for eviction.
const impactOf = (card: PersonalActivityCard): number => {
  if (card.kind === "TERRITORY_FLIP_GROUP") return card.tileCount;
  if (card.kind === "COMBAT") return card.manpowerLoss;
  if (card.kind === "TOWN_CAPTURED" || card.kind === "TOWN_LOST") return card.populationBefore;
  if (card.kind === "WAYSTATION_ACTIVATED") return 100;
  if (card.kind === "BUILDING_COMPLETED") return 10;
  return 0;
};

export const capPersonalActivityCards = (cards: readonly PersonalActivityCard[], cap: number): PersonalActivityCard[] => {
  if (cards.length <= cap) {
    return [...cards].sort((a, b) => b.occurredAt - a.occurredAt);
  }
  const byImpact = [...cards].sort((a, b) => impactOf(b) - impactOf(a));
  const kept = byImpact.slice(0, cap - 1);
  const keptIds = new Set(kept.map((card) => card.id));
  const hidden = cards.filter((card) => !keptIds.has(card.id));
  const note: PersonalActivityTruncationNoteCard = {
    kind: "TRUNCATION_NOTE",
    id: "truncation-note",
    occurredAt: Math.max(...hidden.map((card) => card.occurredAt)),
    hiddenCount: hidden.length
  };
  return [...kept, note].sort((a, b) => b.occurredAt - a.occurredAt);
};
