import type { LeaderboardOverallEntry } from "../client-types.js";

export type ManpowerPanelMusterFlag = {
  x: number;
  y: number;
  amount: number;
  mode: "HOLD" | "ADVANCE" | "MARCH";
  targetX?: number | undefined;
  targetY?: number | undefined;
  inFlight?: boolean | undefined;
  inFlightCount?: number | undefined;
  nextActionAt?: number | undefined;
  fightX?: number | undefined;
  fightY?: number | undefined;
  noTargetInRange?: boolean | undefined;
  insufficientManpower?: boolean | undefined;
};

/**
 * Turns a flag's mode + auto-fire status (inFlight/inFlightCount/nextActionAt/fightX/Y/
 * noTargetInRange/insufficientManpower, synced from the server — see
 * syncMusterStatus in apps/simulation) into the one-line status text shown
 * in the tile menu, HUD panel row, and on-map alert label, so a player
 * glancing at any of those three surfaces sees the same story: the flag is
 * fighting, waiting because nothing's in range, waiting because it can't
 * afford its nearest target, or just counting down to its next search — not
 * just "Advancing"/"Holding".
 */
export const musterStatusText = (
  flag: Pick<
    ManpowerPanelMusterFlag,
    "mode" | "amount" | "x" | "y" | "targetX" | "targetY" | "inFlight" | "inFlightCount" | "nextActionAt" | "fightX" | "fightY" | "noTargetInRange" | "insufficientManpower"
  >,
  nowMs: number = Date.now()
): string => {
  if (flag.mode === "HOLD") return `Holding ${Math.floor(flag.amount)} manpower at (${flag.x}, ${flag.y}).`;
  if (flag.inFlight) {
    const countSuffix = (flag.inFlightCount ?? 1) > 1 ? ` (${flag.inFlightCount} actions active)` : "";
    return flag.fightX !== undefined && flag.fightY !== undefined
      ? `Fighting at (${flag.fightX}, ${flag.fightY})${countSuffix}.`
      : `Fighting nearby${countSuffix}.`;
  }
  if (flag.nextActionAt !== undefined && flag.nextActionAt > nowMs) {
    const remainingS = Math.max(1, Math.ceil((flag.nextActionAt - nowMs) / 1000));
    if (flag.insufficientManpower) return `Not enough manpower for the nearest target — retrying in ${remainingS}s.`;
    if (flag.noTargetInRange) return `No target within range — retrying in ${remainingS}s.`;
    return `Planning next move — ${remainingS}s.`;
  }
  if (flag.mode === "MARCH" && flag.targetX !== undefined && flag.targetY !== undefined) {
    return `Marching toward (${flag.targetX}, ${flag.targetY}).`;
  }
  return `Advancing ${Math.floor(flag.amount)} manpower — scouting for a target.`;
};

const musterFlagsSectionHtml = (flags: ManpowerPanelMusterFlag[]): string => {
  const rows = flags.length
    ? flags
        .map(
          (flag) => `
            <button class="panel-btn economy-line muster-flag-row" type="button" data-muster-focus-x="${flag.x}" data-muster-focus-y="${flag.y}">
              <span>(${flag.x}, ${flag.y})<small>${musterStatusText(flag)}</small></span>
              <strong>${flag.amount}</strong>
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

/**
 * "Manpower full in 3h 42min" — the personal, no-turns clock D1 calls for
 * (docs/replenishment-update-plan.md workstream A). Pure function of the
 * same manpower/manpowerCap/manpowerRegenPerMinute fields already on the
 * wire, so this needs no new server plumbing: it's just the inverse of the
 * continuous-regen formula the server already uses (effectiveManpowerAt).
 * A regen of 0 or less (the manpower-panel wire value is never 0 from a
 * genuine lack of towns — STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE and
 * MANPOWER_REGEN_GLOBAL_FLOOR both keep it positive — so 0 here means the
 * Titanium Levy's regen freeze is active) reads as "paused", not a countdown
 * to Infinity.
 */
export const manpowerFullStatusText = (manpower: number, manpowerCap: number, manpowerRegenPerMinute: number, formatDuration: (ms: number) => string): string => {
  if (manpower >= manpowerCap) return "Manpower full.";
  if (manpowerRegenPerMinute <= 0) return "Regen paused.";
  const msUntilFull = ((manpowerCap - manpower) / manpowerRegenPerMinute) * 60_000;
  return `Manpower full in ${formatDuration(msUntilFull)}.`;
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
  formatDuration: (ms: number) => string;
}): string => {
  const current = args.formatManpowerAmount(args.manpower);
  const cap = args.formatManpowerAmount(args.manpowerCap);
  const regen = args.manpowerRegenPerMinute;
  const regenText = `${regen >= 0 ? "+" : ""}${regen.toFixed(1)}/m`;
  const fullStatusText = manpowerFullStatusText(args.manpower, args.manpowerCap, args.manpowerRegenPerMinute, args.formatDuration);
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
        <div class="economy-footnote manpower-full-eta">${fullStatusText}</div>
        <div class="economy-footnote">Manpower gates attacks. Fed towns raise cap and regeneration. Recently captured towns contribute less until they stabilize.</div>
      </section>
      ${sectionHtml("Cap modifiers", args.manpowerBreakdown.cap)}
      ${sectionHtml("Regen modifiers", args.manpowerBreakdown.regen)}
      ${musterFlagsSectionHtml(args.musterFlags)}
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
