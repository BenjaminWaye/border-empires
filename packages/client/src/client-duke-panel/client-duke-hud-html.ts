// The always-visible Duke HUD (design doc §24.4): what needs you, then three
// meters. No text walls: the panel holds everything else.
import { escapeHtml } from "./client-duke-escape.js";
import { COURT_STRENGTH_HELP, DOMAIN_WEIGHT_HELP, STABILITY_HELP, attentionText, plural } from "./client-duke-format.js";
import type { DukeStatus } from "./client-duke-types.js";

const MAX_SHOWN = 4;

export const dukeHudHtml = (status: DukeStatus, now: number): string => {
  const shown = status.attention.slice(0, MAX_SHOWN);
  const more = status.attention.length - shown.length;
  const lowest = status.systems.reduce<DukeStatus["systems"][number] | undefined>((min, s) => (!min || s.stability < min.stability ? s : min), undefined);
  const courtPct = status.court.start > 0 ? Math.round((status.court.current / status.court.start) * 100) : 0;
  const attention =
    shown.length === 0
      ? `<div class="dk-calm" role="status">All quiet. Tap your planet to build.</div>`
      : `<ul class="dk-attention" role="status" data-duke-attention-list>${shown
          .map(
            (a) =>
              `<li><button type="button" class="dk-attn dk-attn-${a.severity === "URGENT" ? "urgent" : "notice"}" data-duke-attention="${a.kind}" data-season-id="${escapeHtml(a.seasonId ?? "")}">${escapeHtml(attentionText(a, now))}</button></li>`
          )
          .join("")}${more > 0 ? `<li class="dk-more">+${more} more</li>` : ""}</ul>`;
  return `
    ${attention}
    ${status.court.fallen ? `<div class="dk-fallen" role="status">The Court has fallen. The Duke with the highest Domain Weight becomes Emperor.</div>` : ""}
    <div class="dk-meters">
      <div class="dk-meter" title="${escapeHtml(STABILITY_HELP)}" data-duke-meter="stability">
        <span class="dk-meter-label">Stability</span>
        <span class="dk-meter-value">${lowest ? lowest.stability : "-"}</span>
        <span class="dk-meter-hint">${lowest ? `${plural(lowest.hitsRemaining, "more hit")} before contested` : "no Sector held"}</span>
      </div>
      <div class="dk-meter" title="${escapeHtml(DOMAIN_WEIGHT_HELP)}" data-duke-meter="domain">
        <span class="dk-meter-label">Domain Weight</span>
        <span class="dk-meter-value">${status.meters.domainWeight}</span>
        <span class="dk-meter-hint">#${status.meters.rank} of ${plural(status.meters.dukeCount, "Duke")}</span>
      </div>
      <div class="dk-meter" title="${escapeHtml(COURT_STRENGTH_HELP)}" data-duke-meter="court">
        <span class="dk-meter-label">Court Strength</span>
        <span class="dk-meter-value">${status.court.current} / ${status.court.start}</span>
        <span class="dk-bar"><span class="dk-bar-fill" style="width:${courtPct}%"></span></span>
      </div>
    </div>`;
};
