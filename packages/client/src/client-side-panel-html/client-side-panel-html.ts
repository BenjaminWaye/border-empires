import type { LeaderboardOverallEntry } from "../client-types.js";

export type ManpowerPanelMusterFlag = {
  x: number;
  y: number;
  amount: number;
  mode: "HOLD" | "ADVANCE" | "MARCH";
  targetX?: number;
  targetY?: number;
};

const musterFlagsSectionHtml = (
  flags: ManpowerPanelMusterFlag[],
  manpowerCap: number,
  formatManpowerAmount: (value: number) => string
): string => {
  // A flag's real ceiling is the player's manpower cap (see headroom calc in
  // runtime-muster-tick.ts) — there's no separate per-flag cap. Showing it
  // here makes that ceiling legible instead of the amount looking unbounded.
  const rows = flags.length
    ? flags
        .map(
          (flag) => `
            <button class="panel-btn economy-line muster-flag-row" type="button" data-muster-focus-x="${flag.x}" data-muster-focus-y="${flag.y}">
              <span>(${flag.x}, ${flag.y})${flag.mode === "ADVANCE" && flag.targetX !== undefined && flag.targetY !== undefined ? `<small>Advancing to (${flag.targetX}, ${flag.targetY})</small>` : `<small>${flag.mode === "ADVANCE" ? "Advancing" : "Holding"}</small>`}</span>
              <strong>${formatManpowerAmount(flag.amount)}/${formatManpowerAmount(manpowerCap)}</strong>
            </button>
          `
        )
        .join("")
    : `<div class="economy-footnote">No active muster flags.</div>`;
  return `
    <section class="card manpower-detail-card">
      <h4>Active muster flags</h4>
      ${rows}
    </section>
  `;
};

export const renderManpowerPanelHtml = (args: {
  manpower: number;
  manpowerCap: number;
  manpowerRegenPerMinute: number;
  manpowerBreakdown: {
    cap: Array<{ label: string; amount: number; note?: string }>;
    regen: Array<{ label: string; amount: number; note?: string }>;
  };
  musterFlags: ManpowerPanelMusterFlag[];
  formatManpowerAmount: (value: number) => string;
  rateToneClass: (rate: number) => string;
}): string => {
  const current = args.formatManpowerAmount(args.manpower);
  const cap = args.formatManpowerAmount(args.manpowerCap);
  const regen = args.manpowerRegenPerMinute;
  const regenText = `${regen >= 0 ? "+" : ""}${regen.toFixed(1)}/m`;
  const sectionHtml = (
    title: string,
    lines: Array<{ label: string; amount: number; note?: string }>
  ): string => `
    <section class="card manpower-detail-card">
      <h4>${title}</h4>
      ${lines
        .map(
          (line) =>
            `<div class="economy-line"><span>${line.label}${line.note ? `<small>${line.note}</small>` : ""}</span><strong>${line.amount >= 0 ? "+" : ""}${line.amount.toFixed(line.amount % 1 === 0 ? 0 : 1)}</strong></div>`
        )
        .join("")}
    </section>
  `;
  return `
    <div class="economy-panel">
      <section class="card manpower-summary-card">
        <div class="economy-detail-head">
          <div>
            <div class="economy-detail-kicker">Manpower</div>
            <strong>${current}/${cap}</strong>
          </div>
          <div class="economy-rate ${args.rateToneClass(regen)}">${regenText}</div>
        </div>
        <div class="economy-footnote">Manpower gates attacks. Fed towns raise cap and regeneration. Recently captured towns contribute less until they stabilize.</div>
      </section>
      ${sectionHtml("Cap modifiers", args.manpowerBreakdown.cap)}
      ${sectionHtml("Regen modifiers", args.manpowerBreakdown.regen)}
      ${musterFlagsSectionHtml(args.musterFlags, args.manpowerCap, args.formatManpowerAmount)}
    </div>
  `;
};

export const renderSocialInspectCardHtml = (args: {
  socialInspectPlayerId: string;
  leaderboardOverall: LeaderboardOverallEntry[];
  allies: string[];
  playerNameForOwner: (ownerId: string) => string | undefined;
}): string => {
  if (!args.socialInspectPlayerId) return "";
  const id = args.socialInspectPlayerId;
  const entry = args.leaderboardOverall.find((player) => player.id === id);
  const name = args.playerNameForOwner(id) ?? entry?.name ?? id.slice(0, 8);
  return `<article class="card social-inspect-card">
    <div class="economy-detail-head">
      <div>
        <div class="economy-detail-kicker">Player</div>
        <strong>${name}</strong>
      </div>
      <div class="economy-rate">${args.allies.includes(id) ? "Allied" : "Empire"}</div>
    </div>
    <div class="economy-detail-columns">
      <div class="economy-detail-column">
        <div class="economy-line"><span>Score</span><strong>${entry ? entry.score.toFixed(0) : "?"}</strong></div>
        <div class="economy-line"><span>Tiles</span><strong>${entry ? entry.tiles.toFixed(0) : "?"}</strong></div>
      </div>
      <div class="economy-detail-column">
        <div class="economy-line"><span>Income</span><strong>${entry ? `${(entry.incomePerMinute * 1440).toFixed(1)}/day` : "?"}</strong></div>
        <div class="economy-line"><span>Techs</span><strong>${entry ? entry.techs.toFixed(0) : "?"}</strong></div>
      </div>
    </div>
  </article>`;
};
