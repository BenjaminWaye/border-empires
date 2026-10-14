import type { ClientEventLogEntry } from "../client-event-log-html.js";
import { occupationSurveyResourceLabel, techIdForOccupationSurveyResource } from "../client-occupation-survey.js";
import { escapeActivityDashboardHtml } from "./client-activity-dashboard-escape.js";

type ResourceSurvey = ClientEventLogEntry & {
  surveyResource: NonNullable<ClientEventLogEntry["surveyResource"]>;
  surveyX: number;
  surveyY: number;
};

// Standing intelligence comes from the authoritative player state, independently
// of the retiring Alerts feed and the dashboard's rolling 24-hour history.
export const resourceSurveySectionHtml = (entries: readonly ClientEventLogEntry[], techIds: readonly string[]): string => {
  const surveys = entries.filter((entry): entry is ResourceSurvey => entry.type === "OCCUPATION_SURVEY"
    && entry.surveyResource !== undefined && !techIds.includes(techIdForOccupationSurveyResource(entry.surveyResource))
    && Number.isFinite(entry.surveyX) && Number.isFinite(entry.surveyY));
  if (surveys.length === 0) return "";
  return `<section aria-label="Resource surveys">
    <h3>Resource surveys</h3>
    <p>Clues from towns you garrisoned. Research the resource's Manifest to reveal deposits.</p>
    ${surveys.map((entry) => `<div class="activity-dashboard-card">
      <span class="activity-dashboard-card-text"><strong>Likely ${escapeActivityDashboardHtml(occupationSurveyResourceLabel(entry.surveyResource))} territory</strong><br>${escapeActivityDashboardHtml(entry.text)}</span>
      <button class="activity-dashboard-center-btn" type="button" data-activity-survey="true" data-activity-focus-x="${entry.surveyX}" data-activity-focus-y="${entry.surveyY}">View survey</button>
    </div>`).join("")}
  </section>`;
};
