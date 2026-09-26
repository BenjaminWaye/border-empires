// The view for a system that isn't yours: what is known, and what to do to learn more.
import { escapeHtml } from "./client-duke-escape.js";
import { formatAge } from "./client-duke-format.js";
import type { DukeStatus, DukeTargetInfo } from "./client-duke-types.js";

export const dukeTargetHtml = (status: DukeStatus, target: DukeTargetInfo, now: number): string => {
  const intel = status.intel.find((i) => i.seasonId === target.seasonId);
  const orbiting = status.orbiting.some((o) => o.seasonId === target.seasonId);
  const flying = status.flights.some((f) => f.seasonId === target.seasonId);
  const known = intel
    ? `<p data-duke-target-intel>Surveyed${intel.live ? " (live, your Probe is watching)" : ` ${escapeHtml(formatAge(intel.at, now))}`}: Stability <b>${intel.stability}</b>, ${
        intel.defenderHull === null ? "<b>undefended</b>" : `defended by a Fighter at <b>${intel.defenderHull}%</b> hull`
      }.</p>`
    : `<p data-duke-target-intel class="dk-note">You know nothing about its defences yet.</p>`;
  const advice = intel
    ? "Send a Fighter from one of your planets (press the Fighter, then pick this system) to raid it."
    : orbiting || flying
      ? "A Probe is on its way or already watching; the survey lands when it arrives."
      : "Send a Probe from one of your planets (press the Probe, then pick this system) to survey its Stability and defender.";
  return `<section class="dk-card" data-duke-target="${escapeHtml(target.seasonId)}">
    <h4>${escapeHtml(target.label)}</h4>
    <p>${escapeHtml(target.stateText)}</p>
    ${known}
    <p class="dk-note">${escapeHtml(advice)}</p>
  </section>`;
};
