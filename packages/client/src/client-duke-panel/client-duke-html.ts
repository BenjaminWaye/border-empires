// Pure HTML builders for the Duke HUD (always on screen) and the Duke panel.
// Every player-derived string is escaped. Costs shown here are display only;
// the gateway is the source of truth and re-validates on submit.
import { COURT_STRENGTH_HELP, DOMAIN_WEIGHT_HELP, STABILITY_HELP, choiceBanner, formatAge, formatDuration } from "./client-duke-format.js";
import type { DukeStatus, DukeTargetOption } from "./client-duke-types.js";

const FIGHTER_COST = 80;
const PROBE_COST = 25;

export const escapeHtml = (input: string): string =>
  input.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

const daysFor = (cost: number, ratePerDay: number): string =>
  ratePerDay > 0 ? `${plural(Math.ceil(cost / ratePerDay), "day")} at your rate` : "no Production yet";

export const dukeHudHtml = (status: DukeStatus, now: number): string => {
  const banner = choiceBanner(status, now);
  const lowest = status.meters.sectors.reduce<DukeStatus["meters"]["sectors"][number] | undefined>(
    (min, s) => (!min || s.stability < min.stability ? s : min),
    undefined
  );
  const courtPct = status.court.start > 0 ? Math.round((status.court.current / status.court.start) * 100) : 0;
  const stabilityHint = lowest ? `${plural(lowest.hitsRemaining, "more hit")} before it is contested` : "no Sector held";
  return `
    <div class="dk-banner dk-banner-${banner.state === "READY" ? "ready" : "used"}" role="status" data-duke-banner>
      <div class="dk-banner-text"><strong>${escapeHtml(banner.headline)}</strong><span>${escapeHtml(banner.detail)}</span></div>
      <button type="button" class="dk-open" data-duke-open>Open Duke panel</button>
    </div>
    ${status.court.fallen ? `<div class="dk-fallen" role="status">The Court has fallen. The Duke with the highest Domain Weight becomes Emperor.</div>` : ""}
    <div class="dk-meters">
      <div class="dk-meter" title="${escapeHtml(STABILITY_HELP)}" data-duke-meter="stability">
        <span class="dk-meter-label">Stability</span>
        <span class="dk-meter-value">${lowest ? lowest.stability : "-"}</span>
        <span class="dk-meter-hint">${escapeHtml(stabilityHint)}</span>
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

const disabledAttr = (disabled: boolean, reason: string): string => (disabled ? ` disabled title="${escapeHtml(reason)}"` : "");

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

const docketHtml = (status: DukeStatus, now: number): string => {
  const threat =
    status.docket.incursionArrivesAt === null
      ? "No incursion expected right now."
      : `Unidentified craft arriving in ${formatDuration(status.docket.incursionArrivesAt - now)}. ${
          status.ships.fighterHulls.length > 0 ? "Your Fighter will defend." : "With no Fighter, your Sector will lose 20 Stability."
        }`;
  const slot = status.production.slot
    ? `Building ${escapeHtml(status.production.slot.label)}: ${
        status.production.slot.daysLeft === null ? "waiting on Production" : `${plural(status.production.slot.daysLeft, "day")} left`
      } (${Math.round((status.production.slot.progress / status.production.slot.cost) * 100)}%).`
    : `Build slot empty. Production is banking (${status.production.idleBank}, up to one Cycle's worth).`;
  const politics = status.court.fallen
    ? "The Court has fallen."
    : status.docket.canMoveAgainstCourt
      ? "You can Move Against the Court."
      : "Move Against the Court is locked by the Court's offer.";
  return `<section class="dk-card" data-duke-docket>
      <h4>This Cycle</h4>
      <ul class="dk-list">
        <li><b>Threat</b> ${escapeHtml(threat)}</li>
        <li><b>Build slot</b> ${slot}</li>
        <li><b>Politics</b> ${escapeHtml(politics)}</li>
      </ul>
    </section>`;
};

const investHtml = (status: DukeStatus, gateUsed: boolean): string => {
  const rate = status.production.ratePerDay;
  const busy = status.docket.slotState === "BUILDING";
  const reason = gateUsed ? "You've used this Cycle's action." : "Your build slot is busy.";
  const off = gateUsed || busy;
  const damaged = status.ships.fighterHulls.some((h) => h < 100);
  const sectorOptions = status.meters.sectors
    .filter((s) => s.stability < 100)
    .map((s) => `<option value="${escapeHtml(s.seasonId)}">${escapeHtml(s.label)} (${s.stability})</option>`)
    .join("");
  return `<section class="dk-card" data-duke-invest>
      <h4>Invest <small>spends Production, ${rate} per day</small></h4>
      <p class="dk-note">Your one build slot works on one thing at a time. Starting a build uses your action; after that it runs by itself.</p>
      <div class="dk-row">
        <button type="button" class="dk-btn" data-duke-invest="FIGHTER"${disabledAttr(off, reason)}>Fighter <small>${FIGHTER_COST}, ${daysFor(FIGHTER_COST, rate)}</small></button>
        <button type="button" class="dk-btn" data-duke-invest="PROBE"${disabledAttr(off, reason)}>Probe <small>${PROBE_COST}, ${daysFor(PROBE_COST, rate)}</small></button>
        <button type="button" class="dk-btn" data-duke-invest="REFIT"${disabledAttr(off || !damaged, damaged ? reason : "No Fighter is damaged.")}>Refit <small>repairs a Fighter</small></button>
      </div>
      <div class="dk-row">
        <select data-duke-fortify-sector${disabledAttr(sectorOptions === "", "All your Sectors are at full Stability.")}>${sectorOptions}</select>
        <input type="number" min="1" max="100" value="20" data-duke-fortify-points aria-label="Stability points to restore" />
        <button type="button" class="dk-btn" data-duke-fortify${disabledAttr(off || sectorOptions === "", sectorOptions === "" ? "All your Sectors are at full Stability." : reason)}>Fortify <small>2 Production per point</small></button>
      </div>
      ${status.production.slot ? `<div class="dk-row"><button type="button" class="dk-btn dk-btn-quiet" data-duke-cancel-build${disabledAttr(gateUsed, reason)}>Cancel current build</button></div>` : ""}
    </section>`;
};

const petitionHtml = (status: DukeStatus, gateUsed: boolean): string => {
  const min = status.docket.minMoveAgainstCourtWager;
  const canAct = status.docket.canMoveAgainstCourt && !gateUsed;
  const reason = gateUsed ? "You've used this Cycle's action." : status.court.fallen ? "The Court has fallen." : "Locked by the Court's offer.";
  return `<section class="dk-card" data-duke-petition>
      <h4>Petition the Senate <small>spends Influence (you have ${status.influence})</small></h4>
      <p class="dk-note">Move Against the Court: wager Influence. Every 5 Influence lowers Court Strength by 1 and raises your Domain Weight by 1. It is spent whether or not anyone follows.</p>
      <div class="dk-row">
        <input type="number" min="${min}" value="${min}" data-duke-court-wager aria-label="Influence to wager" />
        <button type="button" class="dk-btn" data-duke-court-move${disabledAttr(!canAct, reason)}>Move Against the Court</button>
      </div>
    </section>`;
};

const targetOptions = (status: DukeStatus, targets: ReadonlyArray<DukeTargetOption>, surveyedOnly: boolean): string => {
  const surveyed = new Map(status.intel.map((i) => [i.seasonId, i]));
  return targets
    .filter((t) => !surveyedOnly || surveyed.has(t.seasonId))
    .map((t, i) => {
      const known = surveyed.get(t.seasonId);
      const label = known ? known.label : `Unknown system ${i + 1}`;
      return `<option value="${escapeHtml(t.seasonId)}">${escapeHtml(label)}</option>`;
    })
    .join("");
};

const orderHtml = (status: DukeStatus, targets: ReadonlyArray<DukeTargetOption>, gateUsed: boolean): string => {
  const flying = status.ships.inFlight !== null;
  const probeOptions = targetOptions(status, targets, false);
  const raidOptions = targetOptions(status, targets, true);
  const gateReason = gateUsed ? "You've used this Cycle's action." : "An order is already in flight.";
  const noProbe = status.ships.probeStock < 1;
  const noFighter = status.ships.fighterHulls.every((h) => h <= 0);
  return `<section class="dk-card" data-duke-order>
      <h4>Give an order <small>uses a ship, costs no Production</small></h4>
      <p class="dk-note">A Probe surveys a system, then stays in orbit and keeps you updated on it. You can only raid a system you have surveyed.</p>
      <div class="dk-row">
        <select data-duke-probe-target${disabledAttr(probeOptions === "", "No other systems yet.")}>${probeOptions}</select>
        <button type="button" class="dk-btn" data-duke-order-launch="PROBE"${disabledAttr(gateUsed || flying || noProbe || probeOptions === "", noProbe ? "You have no Probe. Build one first (Invest)." : gateReason)}>Launch Probe <small>${status.ships.probeStock} ready</small></button>
      </div>
      <div class="dk-row">
        <select data-duke-raid-target${disabledAttr(raidOptions === "", "Survey a system with a Probe first.")}>${raidOptions}</select>
        <button type="button" class="dk-btn" data-duke-order-launch="RAID"${disabledAttr(gateUsed || flying || noFighter || raidOptions === "", noFighter ? "You have no Fighter ready. Build one first (Invest)." : raidOptions === "" ? "Survey a system with a Probe first." : gateReason)}>Raid with a Fighter <small>a hit that gets through costs 20 Stability</small></button>
      </div>
      ${flying && status.ships.inFlight ? `<p class="dk-note">${status.ships.inFlight.kind === "PROBE" ? "A Probe" : "A Fighter"} is in flight, arriving in ${formatDuration(status.ships.inFlight.arrivesAt - status.now)}.</p>` : ""}
    </section>`;
};

const shipsHtml = (status: DukeStatus): string => {
  const fighters =
    status.ships.fighterHulls.length === 0
      ? "None. Your Sector defends itself, at a cost of 20 Stability per hit."
      : status.ships.fighterHulls.map((h) => `Fighter, hull ${h}%`).join(" | ");
  const orbiting = status.ships.orbiting.length === 0 ? "None" : status.ships.orbiting.map((o) => escapeHtml(o.label)).join(", ");
  return `<section class="dk-card"><h4>Ships</h4><ul class="dk-list">
      <li><b>Fighters</b> ${escapeHtml(fighters)}</li>
      <li><b>Probes ready</b> ${status.ships.probeStock} of 3</li>
      <li><b>Probes in orbit</b> ${orbiting} (up to 3)</li>
    </ul></section>`;
};

const intelHtml = (status: DukeStatus, now: number): string =>
  status.intel.length === 0
    ? ""
    : `<section class="dk-card"><h4>Surveyed systems</h4><ul class="dk-list">${status.intel
        .map(
          (i) =>
            `<li><b>${escapeHtml(i.label)}</b> Stability ${i.stability}, ${
              i.defenderHull === null ? "undefended" : `defended (Fighter hull ${i.defenderHull}%)`
            } <em>${i.live ? "live, a Probe is watching" : formatAge(i.at, now)}</em></li>`
        )
        .join("")}</ul></section>`;

const digestHtml = (status: DukeStatus, now: number): string =>
  `<section class="dk-card" data-duke-digest><h4>While you were away</h4>${
    status.digest.length === 0
      ? `<p class="dk-note">Nothing yet.</p>`
      : `<ul class="dk-list">${status.digest.map((d) => `<li class="dk-${d.kind.toLowerCase()}"><em>${formatAge(d.at, now)}</em> ${escapeHtml(d.text)}</li>`).join("")}</ul>`
  }</section>`;

export const dukePanelHtml = (status: DukeStatus, now: number, targets: ReadonlyArray<DukeTargetOption>): string => {
  const gateUsed = !status.gate.available;
  return `
    <p class="dk-message" data-duke-message hidden></p>
    ${offerHtml(status)}
    ${docketHtml(status, now)}
    ${investHtml(status, gateUsed)}
    ${petitionHtml(status, gateUsed)}
    ${orderHtml(status, targets, gateUsed)}
    ${shipsHtml(status)}
    ${intelHtml(status, now)}
    ${digestHtml(status, now)}`;
};

export const dukeStyle = `
  .dk-hud{position:absolute;top:56px;left:0;z-index:2;pointer-events:none;display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:8px 12px;width:min(460px,calc(100% - 24px))}
  .dk-hud > *{pointer-events:auto}
  .dk-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-radius:10px;border:1px solid rgba(214,150,68,.5);background:linear-gradient(180deg,rgba(38,27,15,.94),rgba(20,14,8,.94));color:#f0e0c8}
  .dk-banner-ready{border-color:#6fd2c6;box-shadow:0 0 14px rgba(111,210,198,.25)}
  .dk-banner-text{display:flex;flex-direction:column;gap:2px}
  .dk-banner-text strong{color:#ffd68f;font-size:16px}
  .dk-banner-text span{font-size:12px;color:#c9b08a}
  .dk-open{border:1px solid rgba(214,150,68,.5);background:rgba(45,32,18,.9);color:#ffd68f;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
  .dk-fallen{padding:8px 12px;border-radius:8px;background:rgba(160,50,40,.85);color:#fff3dc;font-size:13px;text-align:center}
  .dk-meters{display:flex;gap:8px;flex-wrap:wrap}
  .dk-meter{flex:1 1 130px;display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:8px;background:rgba(15,10,6,.88);border:1px solid rgba(214,150,68,.28);cursor:help}
  .dk-meter-label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#b9926a}
  .dk-meter-value{font-size:18px;font-weight:700;color:#ffd68f}
  .dk-meter-hint{font-size:11px;color:#c9b08a}
  .dk-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}
  .dk-bar-fill{display:block;height:100%;background:#ff6b58}
  .dk-message{margin:0 0 10px;padding:8px 10px;border-radius:6px;background:rgba(160,50,40,.35);border:1px solid rgba(255,110,90,.5);color:#ffe4dc;font-size:13px}
  .dk-message[hidden]{display:none}
  .dk-card{margin:0 0 10px;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(214,150,68,.22);color:#f0e0c8;font-size:13px}
  .dk-card h4{margin:0 0 6px;font-size:14px;color:#ffd68f}
  .dk-card h4 small{font-weight:400;color:#b9926a;margin-left:6px}
  .dk-offer{border-color:#6fd2c6}
  .dk-note{margin:0 0 8px;color:#c9b08a;font-size:12px}
  .dk-list{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:4px}
  .dk-list em{color:#b9926a;font-style:normal;font-size:11px;margin-right:4px}
  .dk-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px}
  .dk-btn{border:1px solid rgba(214,150,68,.45);background:linear-gradient(180deg,rgba(60,42,24,.9),rgba(30,21,12,.9));color:#f0e0c8;border-radius:6px;padding:7px 10px;font-size:13px;font-weight:600;cursor:pointer}
  .dk-btn small{display:block;font-weight:400;font-size:11px;color:#c9b08a}
  .dk-btn:disabled{opacity:.45;cursor:not-allowed}
  .dk-btn-quiet{background:transparent}
  .dk-card select,.dk-card input{background:rgba(0,0,0,.35);color:#f0e0c8;border:1px solid rgba(214,150,68,.35);border-radius:6px;padding:6px 8px;font-size:13px;max-width:100%}
  .dk-card input[type=number]{width:84px}
  .dk-combat{color:#f0e0c8}.dk-court{color:#9fdcd2}.dk-intel{color:#c9d6ff}.dk-economy{color:#e8d6a8}.dk-politics{color:#f2c4a8}
  @media (max-width:600px){.dk-hud{top:48px}.dk-banner{flex-direction:column;align-items:flex-start}}
`;
