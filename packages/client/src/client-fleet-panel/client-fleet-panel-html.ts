// Pure HTML builders for the Space View Fleet panel (galactic v1 backend,
// docs/galactic-campaign-design.md §6/§12 v2a). Kept separate from
// client-fleet-panel.ts (DOM/network wiring) the same way
// client-senate-panel-html.ts is split from client-senate-panel.ts.

export type FleetHullClassId = "SCOUT" | "RAIDER" | "BATTLELINE" | "DREADNOUGHT" | "TANKER";

// Mirrors FLEET_HULL_CLASSES in apps/realtime-gateway/src/galaxy-fleet-config/
// galaxy-fleet-config.ts -- display only, the server is the source of truth
// and re-validates the real cost/composition/travel-time on submit.
export const FLEET_HULL_CLASS_IDS: readonly FleetHullClassId[] = ["SCOUT", "RAIDER", "BATTLELINE", "DREADNOUGHT", "TANKER"];

type HullInfo = { icon: string; label: string; cost: number; damage: number; speed: number; revealsGarrison: boolean; blurb: string };

const HULL_INFO: Record<FleetHullClassId, HullInfo> = {
  SCOUT: { icon: "🛰️", label: "Scout", cost: 25, damage: 0, speed: 5, revealsGarrison: true, blurb: "Reveals Garrison, no damage" },
  RAIDER: { icon: "🗡️", label: "Raider", cost: 80, damage: 50, speed: 4, revealsGarrison: false, blurb: "Fast, moderate damage" },
  BATTLELINE: { icon: "🚀", label: "Battleline", cost: 200, damage: 200, speed: 3, revealsGarrison: false, blurb: "Balanced main-line hull" },
  DREADNOUGHT: { icon: "☠️", label: "Dreadnought", cost: 500, damage: 600, speed: 1, revealsGarrison: false, blurb: "Slow, devastating damage" },
  TANKER: { icon: "⛽", label: "Tanker", cost: 60, damage: 0, speed: 2, revealsGarrison: false, blurb: "No combat effect" }
};

// 2 days at relative speed 1 -- mirrors FLEET_BASE_TRAVEL_TIME_MS in
// galaxy-fleet-config.ts. Display only; see that module's comment for why
// this is a stand-in for a real distance model.
const FLEET_BASE_TRAVEL_TIME_MS = 2 * 24 * 60 * 60 * 1000;

// 3 minutes per point of Production cost -- mirrors
// FLEET_BUILD_TIME_MS_PER_PRODUCTION_COST in galaxy-fleet-config.ts.
// Display only; see that constant's comment for why build time exists.
const FLEET_BUILD_TIME_MS_PER_PRODUCTION_COST = 3 * 60 * 1000;

export type FleetTargetOption = { seasonId: string; label: string };

export type FleetBlueprintView = { id: string; name: string; composition: Partial<Record<FleetHullClassId, number>>; weaponEmphasis: string };

export type FleetOrderView = {
  id: string;
  targetLabel: string;
  // BUILDING is a client-derived status (now < departsAt) -- the server
  // only tracks TRAVELING/RESOLVED (see GalaxyFleetOrderStatus); an order
  // is still "TRAVELING" server-side for its whole build+travel span.
  status: "BUILDING" | "TRAVELING" | "RESOLVED";
  departsAt: number;
  arrivesAt: number;
  outcomeSummary?: string;
  reconOnly?: boolean;
  // A GARRISON ("hold at home") order never fights anything -- see
  // GalaxyFleetOrderKind's comment on the backend.
  garrison?: boolean;
};

export type FleetBattleLogEntryView = {
  attackerLabel: string;
  defenderLabel: string;
  summary: string;
  resolvedAt: number;
  reconOnly?: boolean;
};

// From GET /hq/galaxy/fleets/incoming -- deliberately anonymous (no
// attacker, no composition; see that route's comment on the gateway).
export type FleetThreatView = { targetLabel: string; arrivesAt: number };

const escapeHtml = (input: string): string =>
  input.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

const compositionSummary = (composition: Partial<Record<FleetHullClassId, number>>): string =>
  FLEET_HULL_CLASS_IDS.filter((id) => (composition[id] ?? 0) > 0)
    .map((id) => `${composition[id]}× ${id}`)
    .join(", ") || "(empty)";

const formatDuration = (ms: number): string => {
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) return `~${Math.max(1, Math.round(ms / 60_000))}m`;
  if (hours < 48) return `~${Math.round(hours)}h`;
  return `~${Math.round(hours / 24)}d`;
};

const relativeTimeFromNow = (targetMs: number): string => {
  const diffMs = targetMs - Date.now();
  if (diffMs <= 0) return "any moment now";
  return `in ${formatDuration(diffMs)}`;
};

export const fleetHullCardHtml = (id: FleetHullClassId, count: number): string => {
  const info = HULL_INFO[id];
  return `
    <div class="fl-hull-card ${count > 0 ? "fl-hull-card-active" : ""}" data-fleet-hull-card="${id}">
      <div class="fl-hull-icon">${info.icon}</div>
      <div class="fl-hull-name">${info.label}</div>
      <div class="fl-hull-stats">
        <span title="Production cost">💰${info.cost} cost</span>
        <span title="Damage">💥${info.damage} dmg</span>
        <span title="Relative speed (higher = faster)">⚡${info.speed} spd</span>
      </div>
      <div class="fl-hull-blurb">${info.blurb}</div>
      <div class="fl-hull-stepper">
        <button type="button" class="fl-step-btn" data-fleet-hull-step="${id}" data-fleet-hull-step-dir="-1">−</button>
        <input type="number" min="0" step="1" value="${count}" class="fl-hull-count" data-fleet-hull-count="${id}">
        <button type="button" class="fl-step-btn" data-fleet-hull-step="${id}" data-fleet-hull-step-dir="1">+</button>
      </div>
    </div>`;
};

export const fleetHullCardsHtml = (composition: Partial<Record<FleetHullClassId, number>> = {}): string =>
  FLEET_HULL_CLASS_IDS.map((id) => fleetHullCardHtml(id, composition[id] ?? 0)).join("");

export const fleetCompositionSummaryHtml = (composition: Partial<Record<FleetHullClassId, number>>): string => {
  const activeIds = FLEET_HULL_CLASS_IDS.filter((id) => (composition[id] ?? 0) > 0);
  if (activeIds.length === 0) {
    return `<div class="fl-summary fl-summary-empty">Pick at least one hull to see cost, damage and travel time.</div>`;
  }
  const totalCost = activeIds.reduce((sum, id) => sum + HULL_INFO[id].cost * (composition[id] ?? 0), 0);
  const totalDamage = activeIds.reduce((sum, id) => sum + HULL_INFO[id].damage * (composition[id] ?? 0), 0);
  const slowestSpeed = Math.min(...activeIds.map((id) => HULL_INFO[id].speed));
  const travelMs = Math.round(FLEET_BASE_TRAVEL_TIME_MS / slowestSpeed);
  const buildMs = totalCost * FLEET_BUILD_TIME_MS_PER_PRODUCTION_COST;
  const reconOnly = totalDamage === 0 && activeIds.some((id) => HULL_INFO[id].revealsGarrison);
  return `
    <div class="fl-summary">
      <div class="fl-summary-stat"><span class="fl-summary-label">Cost</span><span class="fl-summary-value">💰 ${totalCost}</span></div>
      <div class="fl-summary-stat"><span class="fl-summary-label">Damage</span><span class="fl-summary-value">${reconOnly ? "🔍 Recon only" : `💥 ${totalDamage}`}</span></div>
      <div class="fl-summary-stat"><span class="fl-summary-label">Build</span><span class="fl-summary-value">🔧 ${formatDuration(buildMs)}</span></div>
      <div class="fl-summary-stat"><span class="fl-summary-label">Travel</span><span class="fl-summary-value">🕐 ${formatDuration(travelMs)}</span></div>
    </div>`;
};

export const fleetTargetOptionsHtml = (targets: FleetTargetOption[]): string =>
  targets.map((t) => `<option value="${t.seasonId}">${escapeHtml(t.label)}</option>`).join("");

export const fleetBlueprintListHtml = (blueprints: FleetBlueprintView[]): string =>
  blueprints.length > 0
    ? `<ul class="fl-blueprint-list">${blueprints
        .map(
          (b) => `
      <li class="fl-blueprint" data-fleet-blueprint-id="${b.id}">
        <span class="fl-blueprint-name">${escapeHtml(b.name)}</span>
        <span class="fl-blueprint-comp">${escapeHtml(compositionSummary(b.composition))}</span>
        <button type="button" class="sv-btn fl-blueprint-load" data-fleet-load-blueprint>Load</button>
        <button type="button" class="sv-btn fl-blueprint-delete" data-fleet-delete-blueprint>Delete</button>
      </li>`
        )
        .join("")}</ul>`
    : `<p class="fl-empty">No saved blueprints yet.</p>`;

export const fleetOrderListHtml = (orders: FleetOrderView[]): string =>
  orders.length > 0
    ? `<ul class="fl-order-list">${orders
        .map((o) => {
          const icon = o.status === "BUILDING" ? "🔧" : o.status === "TRAVELING" ? (o.garrison ? "🏠" : "🚀") : o.garrison ? "🏠" : o.reconOnly ? "🔍" : "⚔️";
          const etaLabel = o.status === "BUILDING" ? `builds, then departs ${relativeTimeFromNow(o.departsAt)}` : o.status === "TRAVELING" ? `arrives ${relativeTimeFromNow(o.arrivesAt)}` : "";
          return `
      <li class="fl-order fl-status-${o.status.toLowerCase()}">
        <span class="fl-order-icon">${icon}</span>
        <span class="fl-order-target">${escapeHtml(o.targetLabel)}${o.garrison ? " (home)" : ""}</span>
        <span class="fl-pill fl-pill-${o.status.toLowerCase()}">${o.status}</span>
        ${etaLabel ? `<span class="fl-order-eta">${etaLabel}</span>` : ""}
        ${o.outcomeSummary ? `<span class="fl-order-outcome">${escapeHtml(o.outcomeSummary)}</span>` : ""}
      </li>`;
        })
        .join("")}</ul>`
    : `<p class="fl-empty">No fleets sent yet.</p>`;

export const fleetBattleLogHtml = (entries: FleetBattleLogEntryView[]): string =>
  entries.length > 0
    ? `<ul class="fl-log-list">${entries
        .map((e) => {
          const icon = e.reconOnly ? "🔍" : "⚔️";
          return `
      <li class="fl-log-entry fl-log-${e.reconOnly ? "recon" : "raid"}">
        <span class="fl-log-icon">${icon}</span>
        <div class="fl-log-body">
          <div class="fl-log-headline">
            <span class="fl-log-attacker">${escapeHtml(e.attackerLabel)}</span>
            <span class="fl-log-arrow">→</span>
            <span class="fl-log-defender">${escapeHtml(e.defenderLabel)}</span>
          </div>
          <div class="fl-log-summary">${escapeHtml(e.summary)}</div>
        </div>
      </li>`;
        })
        .join("")}</ul>`
    : `<p class="fl-empty">No raids logged yet.</p>`;

export const fleetThreatListHtml = (threats: FleetThreatView[]): string =>
  threats.length > 0
    ? `<ul class="fl-threat-list">${threats
        .map(
          (t) => `
      <li class="fl-threat">
        <span class="fl-threat-icon">⚠️</span>
        <span class="fl-threat-target">${escapeHtml(t.targetLabel)}</span>
        <span class="fl-threat-eta">arrives ${relativeTimeFromNow(t.arrivesAt)}</span>
      </li>`
        )
        .join("")}</ul>`
    : "";

export const fleetPanelHtml = (targetOptionsHtml: string, homeOptionsHtml = "", threatsHtml = ""): string => `
  <div class="fl-panel">
    <div class="fl-header">
      <h3 class="fl-heading">🛡️ Fleets</h3>
    </div>
    <div class="fl-section fl-threats-section" data-fleet-threats-section ${threatsHtml ? "" : "hidden"}>
      <h4>⚠️ Incoming</h4>
      <div data-fleet-threats>${threatsHtml}</div>
    </div>
    <div class="fl-section">
      <h4>Send a Fleet</h4>
      <form class="fl-form" data-fleet-send-form>
        <div class="fl-hull-cards" data-fleet-hull-cards>${fleetHullCardsHtml()}</div>
        <div data-fleet-summary>${fleetCompositionSummaryHtml({})}</div>
        <div class="fl-form-row">
          <label class="fl-field-label" for="fl-target-select">Target</label>
          <select class="fl-select" id="fl-target-select" data-fleet-target-select>
            <option value="" disabled selected>Choose a target...</option>
            <optgroup label="🏠 Hold at home (garrison, no combat)" data-fleet-home-optgroup ${homeOptionsHtml ? "" : "hidden"}>${homeOptionsHtml}</optgroup>
            <optgroup label="⚔️ Raid / recon target">${targetOptionsHtml}</optgroup>
          </select>
          <select class="fl-select" data-fleet-weapon-select>
            <option value="KINETIC">Kinetic</option>
            <option value="ENERGY">Energy</option>
            <option value="MISSILE">Missile</option>
          </select>
        </div>
        <div class="fl-form-row">
          <input type="text" class="fl-select" placeholder="Save as blueprint (optional name)" data-fleet-blueprint-name>
          <button type="submit" class="sv-btn fl-send-btn">🚀 Send Fleet</button>
          <button type="button" class="sv-btn" data-fleet-save-blueprint>Save Blueprint Only</button>
        </div>
      </form>
      <p class="fl-message" data-fleet-message hidden></p>
    </div>
    <div class="fl-section">
      <h4>Blueprints</h4>
      <div data-fleet-blueprints></div>
    </div>
    <div class="fl-section">
      <h4>Your Fleets</h4>
      <div data-fleet-orders></div>
    </div>
    <div class="fl-section">
      <h4>Battle Log</h4>
      <div data-fleet-log></div>
    </div>
  </div>
`;

export const fleetStyle = `
  .fl-panel{display:flex;flex-direction:column;gap:14px}
  .fl-header{border-left:3px solid #fb923c;padding-left:10px}
  .fl-heading{margin:0;color:#f8fafc;font-size:15px;letter-spacing:.02em}
  .fl-section h4{margin:0 0 6px;color:#e2e8f0;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
  .fl-form{display:flex;flex-direction:column;gap:10px}
  .fl-form-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .fl-field-label{color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.04em;width:100%}
  .fl-hull-cards{display:flex;gap:8px;flex-wrap:wrap}
  .fl-hull-card{position:relative;flex:1;min-width:110px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(15,23,42,.5);transition:border-color .15s,background .15s}
  .fl-hull-card-active{border-color:#fb923c;background:rgba(251,146,60,.12)}
  .fl-hull-icon{font-size:20px}
  .fl-hull-name{color:#f8fafc;font-weight:700;font-size:11px}
  .fl-hull-stats{display:flex;gap:6px;color:#cbd5e1;font-size:10px}
  .fl-hull-blurb{color:#94a3b8;font-size:9px;text-align:center;line-height:1.2;min-height:22px}
  .fl-hull-stepper{display:flex;align-items:center;gap:4px}
  .fl-step-btn{width:20px;height:20px;line-height:1;border-radius:4px;border:1px solid rgba(255,255,255,.2);background:rgba(15,23,42,.7);color:#e2e8f0;cursor:pointer;font-size:13px}
  .fl-step-btn:hover{border-color:#fb923c}
  .fl-hull-count{width:34px;text-align:center;background:rgba(15,23,42,.7);color:#e2e8f0;border:1px solid rgba(255,255,255,.18);border-radius:4px;padding:2px}
  .fl-summary{display:flex;gap:16px;padding:8px 12px;border:1px solid rgba(251,146,60,.3);border-radius:8px;background:rgba(88,28,4,.12)}
  .fl-summary-empty{color:#94a3b8;font-size:11px;font-style:italic}
  .fl-summary-stat{display:flex;flex-direction:column;gap:2px}
  .fl-summary-label{color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:.04em}
  .fl-summary-value{color:#f8fafc;font-size:12px;font-weight:700}
  .fl-select{background:rgba(15,23,42,.7);color:#e2e8f0;border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:6px 8px;font-size:12px}
  .fl-send-btn{border-color:#fb923c}
  .fl-message{margin:0;font-size:12px;color:#facc15}
  .fl-threats-section{border:1px solid rgba(239,68,68,.4);border-radius:8px;padding:10px 12px;background:rgba(127,29,29,.15)}
  .fl-threats-section h4{color:#fca5a5}
  .fl-threat-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
  .fl-threat{display:flex;align-items:center;gap:8px;font-size:12px;color:#fecaca}
  .fl-threat-icon{animation:fl-threat-pulse 1.4s ease-in-out infinite}
  .fl-threat-target{font-weight:700;color:#fee2e2}
  .fl-threat-eta{margin-left:auto;color:#fca5a5;font-size:11px;font-style:italic}
  @keyframes fl-threat-pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .fl-blueprint-list,.fl-order-list,.fl-log-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:160px;overflow:auto}
  .fl-blueprint{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 10px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(15,23,42,.5);font-size:12px;color:#e2e8f0}
  .fl-order{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 10px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(15,23,42,.5);font-size:12px;color:#e2e8f0}
  .fl-order-icon{font-size:14px}
  .fl-order-eta{color:#94a3b8;font-size:11px;font-style:italic;margin-left:auto}
  .fl-order-outcome{color:#cbd5e1;font-size:11px;width:100%}
  .fl-pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700}
  .fl-pill-building{background:rgba(148,163,184,.15);color:#cbd5e1;border:1px solid rgba(148,163,184,.3)}
  .fl-pill-traveling{background:rgba(250,204,21,.15);color:#facc15;border:1px solid rgba(250,204,21,.3)}
  .fl-pill-resolved{background:rgba(74,222,128,.15);color:#4ade80;border:1px solid rgba(74,222,128,.3)}
  .fl-log-entry{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:linear-gradient(180deg,rgba(30,10,4,.3),rgba(15,23,42,.55))}
  .fl-log-raid{border-color:rgba(248,113,113,.3)}
  .fl-log-recon{border-color:rgba(96,165,250,.3)}
  .fl-log-icon{font-size:16px}
  .fl-log-body{display:flex;flex-direction:column;gap:3px;flex:1}
  .fl-log-headline{display:flex;gap:6px;align-items:center;font-size:12px;color:#e2e8f0;font-weight:700}
  .fl-log-arrow{color:#94a3b8}
  .fl-log-summary{color:#cbd5e1;font-size:11px}
  .fl-empty{color:#94a3b8;font-size:12px;margin:0}
`;
