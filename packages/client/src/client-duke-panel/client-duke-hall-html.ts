// The Hall of Fame: who took the throne in each ended era (design doc §27).
import { escapeHtml } from "./client-duke-escape.js";
import { formatAge } from "./client-duke-format.js";
import type { DukeStatus } from "./client-duke-types.js";

export const dukeEraHtml = (status: DukeStatus): string =>
  `<p class="dk-line" data-duke-era>Era <b>${status.court.era}</b>${status.court.isEmperor ? ` · <b>You hold the throne</b> from era ${status.court.hallOfFame[0]?.era ?? status.court.era - 1}` : ""}</p>`;

export const dukeHallHtml = (status: DukeStatus, now: number): string =>
  status.court.hallOfFame.length === 0
    ? `<section class="dk-card" data-duke-hall><h4>Hall of Fame</h4><p class="dk-note">No era has ended yet. When the Court falls, the Duke with the highest Domain Weight takes the throne and is remembered here, and a new era begins with the Court at full strength.</p></section>`
    : `<section class="dk-card" data-duke-hall><h4>Hall of Fame</h4><ul class="dk-list">${status.court.hallOfFame
        .map(
          (e) =>
            `<li><b>Era ${e.era}</b> ${escapeHtml(e.emperorLabel)} <em>Domain Weight ${e.domainWeight}, ${formatAge(e.endedAt, now)}</em></li>`
        )
        .join("")}</ul></section>`;
