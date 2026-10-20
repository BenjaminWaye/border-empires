import type { PersonalActivityRival, PersonalActivityTimeline } from "@border-empires/game-domain";

import { escapeActivityDashboardHtml } from "./client-activity-dashboard-escape.js";
import { nameOf, plural, type PlayerNameLookup } from "./client-activity-dashboard-names.js";

/** "took 2 tiles · lost 1 tile · repelled 3 of their attacks". */
export const rivalDetail = (rival: PersonalActivityRival): string => {
  const parts: string[] = [];
  if (rival.tilesTaken > 0) parts.push(`took ${plural(rival.tilesTaken, "tile")}`);
  if (rival.tilesLost > 0) parts.push(`lost ${plural(rival.tilesLost, "tile")}`);
  if (rival.attacksRepelled > 0) parts.push(`repelled ${rival.attacksRepelled} of their attacks`);
  if (rival.attacksFailed > 0) parts.push(`${rival.attacksFailed} of your attacks failed`);
  return parts.join(" · ");
};

/** Who's winning the exchange of ground, or undefined when no ground changed hands. */
export const rivalVerdict = (rival: PersonalActivityRival): "ahead" | "behind" | "even" | undefined => {
  if (rival.tilesTaken === 0 && rival.tilesLost === 0) return undefined;
  if (rival.tilesTaken === rival.tilesLost) return "even";
  return rival.tilesTaken > rival.tilesLost ? "ahead" : "behind";
};

const VERDICT_LABEL = { ahead: "You're ahead", behind: "They're ahead", even: "Even" } as const;

// Head-to-head against each opponent fought in the window, most active first.
export const rivalSectionHtml = (timeline: PersonalActivityTimeline | undefined, playerNames: PlayerNameLookup): string => {
  // A simulation not yet redeployed with rival tallies sends no field.
  const rivals: readonly PersonalActivityRival[] = timeline?.rivals ?? [];
  if (rivals.length === 0) return "";
  return `<section class="activity-dashboard-rivals" aria-label="Rivals">
    <h3>Rivals</h3>
    ${rivals.map((rival) => {
      const verdict = rivalVerdict(rival);
      return `<div class="activity-dashboard-rival">
        <span class="activity-dashboard-card-text"><strong>${escapeActivityDashboardHtml(nameOf(rival.playerId, playerNames))}</strong> · ${escapeActivityDashboardHtml(rivalDetail(rival))}</span>
        ${verdict ? `<span class="activity-dashboard-rival-verdict is-${verdict}">${VERDICT_LABEL[verdict]}</span>` : ""}
      </div>`;
    }).join("")}
  </section>`;
};
