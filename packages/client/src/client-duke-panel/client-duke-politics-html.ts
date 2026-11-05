// The Politics card on the Court tab (design doc §29): a Writ waiting for an
// answer, the Blind Eye, grievances (yours and against you) and Renown. Pure
// HTML; client-duke-panel.ts wires the buttons.
import { escapeHtml } from "./client-duke-escape.js";
import { BLIND_EYE_HELP, GRIEVANCE_HELP, formatDuration } from "./client-duke-format.js";
import type { DukePoliticsView, DukeStatus } from "./client-duke-types.js";

const writHtml = (politics: DukePoliticsView, now: number): string => {
  const writ = politics.writ;
  if (!writ) return "";
  const what =
    writ.kind === "FIGHTER"
      ? "a Fighter of your own, free"
      : `a Court Fighter to raid ${escapeHtml(writ.targetLabel ?? "a rival")}. It will look like any other raid`;
  return `<section class="dk-card dk-offer" data-duke-writ>
      <h4>A Writ of Advancement <small>${formatDuration(writ.expiresAt - now)} left</small></h4>
      <p>A Court envoy offers you ${what}. Nobody else will know whether you take it. Taking it gives the Court back 3 Strength.</p>
      <div class="dk-row">
        <button type="button" class="dk-btn" data-duke-writ-answer="accept">Take the Writ</button>
        <button type="button" class="dk-btn dk-btn-quiet" data-duke-writ-answer="decline">Send the envoy away</button>
      </div>
    </section>`;
};

const favorHtml = (status: DukeStatus, politics: DukePoliticsView): string => {
  if (!politics.favor.revoked) return "";
  const lender = status.systems.find((s) => s.fighters.some((h) => h > 0));
  const button = lender
    ? `<button type="button" class="dk-btn" data-duke-lend="${escapeHtml(lender.seasonId)}">Lend a Fighter from ${escapeHtml(lender.label)}</button>`
    : `<p class="dk-note">You have no Fighter at home to lend. Build one first.</p>`;
  return `<section class="dk-card dk-offer" data-duke-blind-eye>
      <h4>The Court has turned a blind eye to you</h4>
      <p class="dk-note">${escapeHtml(BLIND_EYE_HELP)}</p>
      <div class="dk-row">${button}</div>
    </section>`;
};

const grievanceHtml = (politics: DukePoliticsView, influence: number, now: number): string => {
  const against = politics.grievancesAgainstMe
    .map((g) => `<li><b>${escapeHtml(g.fromLabel)}</b> has a grievance against you for another ${formatDuration(g.expiresAt - now)}.</li>`)
    .join("");
  const mine = politics.grievance
    ? `<p class="dk-line">Your grievance against <b>${escapeHtml(politics.grievance.targetLabel)}</b>: ${politics.grievance.hits} hit${politics.grievance.hits === 1 ? "" : "s"} so far, ${formatDuration(politics.grievance.expiresAt - now)} left.</p>`
    : "";
  const options = politics.rivals
    .map((r) => {
      const cost = r.grievanceCost === 0 ? "free, the Court looks away" : `${r.grievanceCost} Influence`;
      return `<option value="${escapeHtml(r.seasonId)}">${escapeHtml(r.label)}${r.isAi ? " (AI)" : ""}, Domain Weight ${r.weight}, ${cost}</option>`;
    })
    .join("");
  const declare =
    politics.grievance || politics.rivals.length === 0
      ? ""
      : `<div class="dk-row">
          <select data-duke-grievance-target aria-label="Rival to declare against">${options}</select>
          <button type="button" class="dk-btn" data-duke-declare>Declare a grievance</button>
        </div>
        <p class="dk-note">You have ${influence} Influence.</p>`;
  return `<section class="dk-card" data-duke-grievances>
      <h4>Grievances <small>Renown ${politics.renown}</small></h4>
      ${against ? `<ul class="dk-list">${against}</ul>` : ""}
      ${mine}
      ${declare}
      <p class="dk-note">${escapeHtml(GRIEVANCE_HELP)}</p>
    </section>`;
};

export const dukePoliticsHtml = (status: DukeStatus, now: number): string => {
  const politics = status.politics;
  if (!politics) return "";
  return `${writHtml(politics, now)}${favorHtml(status, politics)}${grievanceHtml(politics, status.influence, now)}`;
};
