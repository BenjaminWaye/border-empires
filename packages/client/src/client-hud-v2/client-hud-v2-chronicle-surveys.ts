// Resource survey clues in Chronicle → Yours. A survey's clue matters until
// the player researches that resource's Manifest, which can be long after the
// 24-hour activity timeline has dropped it, so these rows come from the clues
// the client keeps (client-occupation-survey.ts), not from the timeline.
// Logging in does not pop survey cards any more; this section is where a clue
// found while the player was away can be read.

import { ACTIVITY_TONE_GLYPH } from "../client-activity-dashboard/client-activity-dashboard-tone.js";
import { occupationSurveyResourceLabel, type OccupationSurveyReport } from "../client-occupation-survey.js";
import { focusCamera, screen, type HudV2Deps } from "./client-hud-v2-context.js";

export const RESOURCE_SURVEYS_HEADING = "RESOURCE SURVEYS";

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const surveyRowHtml = (report: OccupationSurveyReport): string => `<div class="v2c-row v2c-tone-neutral">
    <span class="v2c-time">Clue</span>
    <span class="v2c-glyph" aria-hidden="true">${ACTIVITY_TONE_GLYPH.neutral}</span>
    <span class="v2c-text"><span class="v2c-what">Signs of ${esc(occupationSurveyResourceLabel(report.resource))} nearby</span><span class="v2c-where">${esc(report.text)} Research its Manifest to reveal deposits.</span></span>
    <button type="button" class="v2c-show" data-v2-chronicle-survey="${esc(report.id)}" data-x="${report.x}" data-y="${report.y}">View</button>
  </div>`;

/** The Resource surveys group, or "" when there are no open clues. */
export const chronicleSurveysHtml = (reports: readonly OccupationSurveyReport[]): string =>
  reports.length === 0 ? "" : `<div class="v2c-day">${RESOURCE_SURVEYS_HEADING}</div>${reports.map(surveyRowHtml).join("")}`;

/**
 * View on a survey row: moves the camera to the clue's area. The point is a rough
 * area, not a deposit, so unlike Show on an event it opens no tile menu and leaves
 * no tile selected; it also clears an event row's highlight. True when handled.
 */
export const chronicleSurveyClick = (deps: Pick<HudV2Deps, "state" | "wrapX" | "wrapY" | "requestViewRefresh" | "renderHud">, target: Element): boolean => {
  const view = target.closest<HTMLElement>("[data-v2-chronicle-survey]");
  if (!view) return false;
  const x = Number(view.dataset.x);
  const y = Number(view.dataset.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    focusCamera(deps, x, y);
    deps.state.selected = undefined;
  }
  screen.chronicleSelectedId = undefined;
  deps.renderHud();
  return true;
};
