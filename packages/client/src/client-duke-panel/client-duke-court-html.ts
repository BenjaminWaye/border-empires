// The Court tab (Petition, offer, ranks) and the Log tab (digest).
import { escapeHtml } from "./client-duke-escape.js";
import { COURT_STRENGTH_HELP, DOMAIN_WEIGHT_HELP, WARDEN_HELP, formatAge, formatDuration, plural } from "./client-duke-format.js";
import type { DukeStatus } from "./client-duke-types.js";

const offerHtml = (status: DukeStatus): string =>
  status.court.offer.status !== "PENDING"
    ? ""
    : `<section class="dk-card dk-offer" data-duke-offer>
        <h4>An offer from the Court</h4>
        <p>Accept 30 days of Court protection: Warden incursions will not touch you. In return you cannot Move Against the Court for 90 days. This offer is made once. Declining costs nothing.</p>
        <div class="dk-row">
          <button type="button" class="dk-btn" data-duke-offer-answer="accept">Accept protection</button>
          <button type="button" class="dk-btn dk-btn-quiet" data-duke-offer-answer="decline">Decline</button>
        </div>
      </section>`;

const petitionReason = (status: DukeStatus, now: number): string | null => {
  if (status.court.fallen) return "The Court has fallen.";
  if (!status.court.canMoveAgainstCourt) return "Locked by the Court's offer.";
  if (!status.petition.available && status.petition.availableAt !== null) return `You've already petitioned this Cycle. You can again in ${formatDuration(status.petition.availableAt - now)}.`;
  if (status.influence < status.court.minWager) return `You need at least ${status.court.minWager} Influence.`;
  return null;
};

export const dukeCourtHtml = (status: DukeStatus, now: number): string => {
  const reason = petitionReason(status, now);
  const pct = status.court.start > 0 ? Math.round((status.court.current / status.court.start) * 100) : 0;
  const upkeep = status.economy.developmentUpkeepPerCycle;
  return `
    ${offerHtml(status)}
    <section class="dk-card" data-duke-court>
      <h4>Court Strength <small>${status.court.current} of ${status.court.start}</small></h4>
      <div class="dk-stab"><div class="dk-stab-fill dk-stab-court" style="width:${pct}%"></div></div>
      <p class="dk-note">${escapeHtml(COURT_STRENGTH_HELP)}</p>
      <p class="dk-line">Your Domain Weight <b>${status.meters.domainWeight}</b> · #${status.meters.rank} of ${plural(status.meters.dukeCount, "Duke")}. You have wagered ${status.court.myContribution} Influence so far.</p>
      <p class="dk-note">${escapeHtml(DOMAIN_WEIGHT_HELP)}</p>
    </section>
    <section class="dk-card" data-duke-petition>
      <h4>Petition the Senate <small>once per Cycle</small></h4>
      <p class="dk-note">Move Against the Court: wager Influence. Every 5 Influence lowers Court Strength by 1 and raises your Domain Weight by 1. It is spent either way.</p>
      <p class="dk-line">You have <b>${status.influence} Influence</b>. It also pays for development upkeep${upkeep > 0 ? ` (${upkeep} per Cycle now)` : ""}, and if it runs out Stability starts to drain.</p>
      <div class="dk-row">
        <input type="number" min="${status.court.minWager}" value="${status.court.minWager}" data-duke-court-wager aria-label="Influence to wager" />
        <button type="button" class="dk-btn" data-duke-court-move${reason ? ` disabled title="${escapeHtml(reason)}"` : ""}>Move Against the Court</button>
      </div>
      ${reason ? `<p class="dk-note">${escapeHtml(reason)}</p>` : ""}
    </section>
    <section class="dk-card">
      <h4>Wardens</h4>
      <p class="dk-note">${escapeHtml(WARDEN_HELP)}</p>
      <p class="dk-line">Right now each Planet takes about <b>${status.economy.incursionsPerCyclePerSystem}</b> incursion${status.economy.incursionsPerCyclePerSystem === 1 ? "" : "s"} per Cycle, out of ${status.economy.wardenPoolPerCycle} shared across the galaxy.</p>
    </section>`;
};

export const dukeLogHtml = (status: DukeStatus, now: number): string => {
  const intel = status.intel.length
    ? `<section class="dk-card"><h4>Surveyed systems</h4><ul class="dk-list">${status.intel
        .map(
          (i) =>
            `<li><b>${escapeHtml(i.label)}</b> Stability ${i.stability}, ${i.defenderHull === null ? "undefended" : `defended (Fighter hull ${i.defenderHull}%)`} <em>${i.live ? "live, a Probe is watching" : formatAge(i.at, now)}</em></li>`
        )
        .join("")}</ul></section>`
    : "";
  return `${intel}<section class="dk-card" data-duke-digest><h4>While you were away</h4>${
    status.digest.length === 0
      ? `<p class="dk-note">Nothing yet.</p>`
      : `<ul class="dk-list">${status.digest.map((d) => `<li class="dk-${d.kind.toLowerCase()}"><em>${formatAge(d.at, now)}</em> ${escapeHtml(d.text)}</li>`).join("")}</ul>`
  }</section>`;
};
