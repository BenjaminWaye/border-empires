import type { PersonalActivityCard, PersonalActivityTimeline } from "@border-empires/game-domain";

import { escapeActivityDashboardHtml } from "./client-activity-dashboard-escape.js";
import { siegeDetail, siegeHeadline } from "./client-activity-dashboard-combat-text.js";
import { activityCardTimeLabel } from "./client-activity-dashboard-format.js";
import type { PlayerNameLookup } from "./client-activity-dashboard-names.js";

type SiegeCard = Extract<PersonalActivityCard, { kind: "SIEGE" }>;

const isSiege = (card: PersonalActivityCard): card is SiegeCard => card.kind === "SIEGE";

/** Timeline cards minus sieges, which get their own section above the timeline. */
export const nonSiegeActivityCards = (cards: readonly PersonalActivityCard[]): PersonalActivityCard[] => cards.filter((card) => !isSiege(card));

// How your fortifications fared under sustained attack: one card per siege,
// costliest for the attackers first, so the most impressive stand leads.
export const siegeSectionHtml = (timeline: PersonalActivityTimeline | undefined, playerNames: PlayerNameLookup): string => {
  const sieges = (timeline?.cards ?? []).filter(isSiege).sort((a, b) => b.manpowerSpentAgainst - a.manpowerSpentAgainst);
  if (sieges.length === 0) return "";
  return `<section class="activity-dashboard-sieges" aria-label="Sieges">
    <h3>Sieges</h3>
    <p>How your defenses held up under repeated attack in the last 24 hours.</p>
    ${sieges.map((card) => `<div class="activity-dashboard-card activity-dashboard-siege ${card.outcome === "FELL" ? "is-fallen" : "is-holding"}">
      <span class="activity-dashboard-card-text"><strong>${escapeActivityDashboardHtml(siegeHeadline(card, playerNames))}</strong><br>${activityCardTimeLabel(card)} · ${escapeActivityDashboardHtml(siegeDetail(card, playerNames))}</span>
      <button class="activity-dashboard-center-btn" type="button" data-activity-focus-x="${card.x}" data-activity-focus-y="${card.y}">Center</button>
    </div>`).join("")}
  </section>`;
};
