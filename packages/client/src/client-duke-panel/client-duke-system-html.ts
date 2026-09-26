// The planet panel (design doc §24.4): press a planet, see its Stability, its
// ships, and what it can build. Ships are the way to give an order: press one,
// then pick a target. Every option that is unavailable says why.
import { escapeHtml } from "./client-duke-escape.js";
import { BODY_NAMES, ERROR_MESSAGES, formatAge, formatDuration, plural } from "./client-duke-format.js";
import type { DukeBuildOption, DukeShipKind, DukeStatus, DukeSystemView, DukeTargetOption } from "./client-duke-types.js";

export type SystemViewOptions = {
  now: number;
  targets: ReadonlyArray<DukeTargetOption>;
  selectedShip: DukeShipKind | null;
};

const reasonFor = (code: string | null): string => (code === null ? "" : (ERROR_MESSAGES[code] ?? "Not available right now."));
const disabled = (code: string | null): string => (code === null ? "" : ` disabled title="${escapeHtml(reasonFor(code))}"`);
const timeText = (days: number | null): string => (days === null ? "no Production" : plural(days, "day"));

const optionButton = (o: DukeBuildOption, attrs: string): string =>
  `<button type="button" class="dk-btn dk-build" ${attrs}${disabled(o.blockedBy)}>
     <span class="dk-build-name">${escapeHtml(o.label)}</span>
     <small>${escapeHtml(o.summary)}</small>
     <small class="dk-build-cost">${o.cost} Production, ${timeText(o.daysAtCurrentRate)}</small>
   </button>`;

const targetLabel = (status: DukeStatus, targets: ReadonlyArray<DukeTargetOption>, seasonId: string): string => {
  const known = status.intel.find((i) => i.seasonId === seasonId);
  if (known) return known.label;
  const index = targets.findIndex((t) => t.seasonId === seasonId);
  return `Unknown system ${index >= 0 ? index + 1 : "?"}`;
};

const headerHtml = (s: DukeSystemView, now: number): string => {
  const defended = s.fighters.some((h) => h > 0);
  const incursion =
    s.incursionArrivesAt === null
      ? ""
      : `<p class="dk-alert ${defended ? "dk-alert-ok" : "dk-alert-bad"}">Craft arriving in ${formatDuration(s.incursionArrivesAt - now)}. ${
          defended ? "Your Fighter here will meet it." : "No Fighter here: this system will lose 20 Stability."
        }</p>`;
  return `
    <header class="dk-sys-head">
      <h3>${escapeHtml(s.label)}</h3>
      <span class="dk-tag">${escapeHtml(s.specialization.charAt(0) + s.specialization.slice(1).toLowerCase())} planet</span>
    </header>
    <div class="dk-stab" title="Stability ${s.stability} of 100"><div class="dk-stab-fill" style="width:${s.stability}%"></div></div>
    <p class="dk-line"><b>Stability ${s.stability}</b> · ${plural(s.hitsRemaining, "more hit")} before it is contested</p>
    ${incursion}
    <p class="dk-line">Production <b>${s.ratePerDay}/day</b> · ${
      s.slot
        ? `building <b>${escapeHtml(s.slot.label)}</b>, ${s.slot.daysLeft === null ? "stalled" : `${plural(s.slot.daysLeft, "day")} left`} (${Math.round((s.slot.progress / s.slot.cost) * 100)}%)`
        : `slot empty, ${s.idleBank} banked (at most one Cycle's worth)`
    }</p>
    ${s.slot ? `<div class="dk-row"><div class="dk-progress"><div style="width:${Math.round((s.slot.progress / s.slot.cost) * 100)}%"></div></div><button type="button" class="dk-btn dk-btn-quiet" data-duke-cancel-build>Cancel build</button></div>` : ""}`;
};

const shipsHtml = (status: DukeStatus, s: DukeSystemView, o: SystemViewOptions): string => {
  const ships: string[] = [];
  s.fighters.forEach((hull) => ships.push(`<button type="button" class="dk-ship${o.selectedShip === "FIGHTER" ? " dk-ship-on" : ""}" data-duke-ship="FIGHTER" aria-pressed="${o.selectedShip === "FIGHTER"}"><span class="dk-ship-icon">▲</span>Fighter<small>hull ${hull}%</small></button>`));
  if (s.probeStock > 0) ships.push(`<button type="button" class="dk-ship${o.selectedShip === "PROBE" ? " dk-ship-on" : ""}" data-duke-ship="PROBE" aria-pressed="${o.selectedShip === "PROBE"}"><span class="dk-ship-icon">◎</span>Probe${s.probeStock > 1 ? ` ×${s.probeStock}` : ""}<small>ready</small></button>`);
  const flights = status.flights.filter((f) => f.fromSeasonId === s.seasonId);
  const flightText = flights.length
    ? `<ul class="dk-list dk-flights">${flights
        .map((f) => `<li>${f.kind === "PROBE" ? "Probe" : "Fighter"} on its way to ${escapeHtml(targetLabel(status, o.targets, f.seasonId))}, arriving in ${formatDuration(f.arrivesAt - o.now)}</li>`)
        .join("")}</ul>`
    : "";
  return `<section class="dk-card" data-duke-ships>
      <h4>Ships here <small>press one to give an order</small></h4>
      ${ships.length ? `<div class="dk-ships">${ships.join("")}</div>` : `<p class="dk-note">No ships. Build a Fighter to defend this system, or a Probe to look at another.</p>`}
      ${orderFormHtml(status, s, o)}
      ${flightText}
    </section>`;
};

const orderFormHtml = (status: DukeStatus, s: DukeSystemView, o: SystemViewOptions): string => {
  if (o.selectedShip === "PROBE") {
    const options = o.targets.map((t) => `<option value="${escapeHtml(t.seasonId)}">${escapeHtml(targetLabel(status, o.targets, t.seasonId))}</option>`).join("");
    return `<div class="dk-order">
        <p class="dk-note">A Probe surveys a system, then stays in orbit and keeps you updated on it (up to 3 at once). It is used up.</p>
        <div class="dk-row"><select data-duke-probe-target${options === "" ? " disabled" : ""}>${options}</select>
        <button type="button" class="dk-btn" data-duke-order-launch="PROBE"${options === "" ? ` disabled title="No other systems yet."` : ""}>Launch Probe</button></div>
      </div>`;
  }
  if (o.selectedShip === "FIGHTER") {
    const surveyed = status.intel.filter((i) => o.targets.some((t) => t.seasonId === i.seasonId));
    const options = surveyed
      .map((i) => `<option value="${escapeHtml(i.seasonId)}">${escapeHtml(i.label)}: Stability ${i.stability}, ${i.defenderHull === null ? "undefended" : `defended (hull ${i.defenderHull}%)`}${i.live ? "" : `, ${formatAge(i.at, o.now)}`}</option>`)
      .join("");
    return `<div class="dk-order">
        <p class="dk-note">Fighters defend this system on their own. Sending one to raid leaves it one defender short until it returns. A raid that gets through costs the target 20 Stability.</p>
        <div class="dk-row"><select data-duke-raid-target${options === "" ? " disabled" : ""}>${options}</select>
        <button type="button" class="dk-btn" data-duke-order-launch="RAID"${options === "" ? ` disabled title="${escapeHtml(ERROR_MESSAGES.NOT_SURVEYED ?? "")}"` : ""}>Raid</button></div>
      </div>`;
  }
  return "";
};

const buildHtml = (s: DukeSystemView, status: DukeStatus): string => {
  const shipyard = s.options.map((o) => optionButton(o, `data-duke-build="${o.kind}"`)).join("");
  const points = Math.min(20, Math.max(1, s.fortifyMaxPoints));
  const fortify =
    s.fortifyMaxPoints === 0
      ? `<p class="dk-note">Stability is full: nothing to Fortify.</p>`
      : `<div class="dk-row"><input type="range" min="1" max="${s.fortifyMaxPoints}" value="${points}" data-duke-fortify-points aria-label="Stability points to restore" /><output data-duke-fortify-output>+${points}</output>
         <button type="button" class="dk-btn" data-duke-fortify${disabled(s.fortifyBlockedBy)}>Fortify <small>2 Production per point</small></button></div>`;
  const bodies = s.bodies
    .map((b) =>
      b.development
        ? `<li class="dk-body dk-body-built"><span class="dk-body-name">${BODY_NAMES[b.kind]}</span><span>${escapeHtml(b.development.label)} online: ${escapeHtml(b.development.summary)}</span></li>`
        : `<li class="dk-body"><span class="dk-body-name">${BODY_NAMES[b.kind]}</span>${b.option ? optionButton(b.option, `data-duke-develop="${b.index}"`) : ""}</li>`
    )
    .join("");
  const upkeep = status.economy.developmentUpkeepPerCycle;
  return `<section class="dk-card" data-duke-build>
      <h4>Build here <small>one thing at a time</small></h4>
      <div class="dk-builds">${shipyard}</div>
      ${fortify}
      <h4 class="dk-sub">Bodies in this system</h4>
      <ul class="dk-bodies">${bodies}</ul>
      <p class="dk-note">The first development in each system is free. Each extra one costs 1 Influence per Cycle${upkeep > 0 ? ` (you pay ${upkeep} now)` : ""}, the same Influence you would wager against the Court.</p>
    </section>`;
};

export const dukeSystemHtml = (status: DukeStatus, system: DukeSystemView, o: SystemViewOptions): string =>
  `<div class="dk-system" data-duke-system="${escapeHtml(system.seasonId)}">${headerHtml(system, o.now)}${shipsHtml(status, system, o)}${buildHtml(system, status)}</div>`;
