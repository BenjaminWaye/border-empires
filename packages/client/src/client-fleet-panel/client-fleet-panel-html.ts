// Pure HTML builders for the Space View Fleet panel (galactic v1 backend,
// docs/galactic-campaign-design.md §6/§12 v2a). Kept separate from
// client-fleet-panel.ts (DOM/network wiring) the same way
// client-senate-panel-html.ts is split from client-senate-panel.ts.

export type FleetHullClassId = "SCOUT" | "RAIDER" | "BATTLELINE" | "DREADNOUGHT" | "TANKER";

// Mirrors FLEET_HULL_CLASSES in apps/realtime-gateway/src/galaxy-fleet-config/
// galaxy-fleet-config.ts -- display only, the server is the source of truth
// and re-validates the real cost/composition on submit.
export const FLEET_HULL_CLASS_IDS: readonly FleetHullClassId[] = ["SCOUT", "RAIDER", "BATTLELINE", "DREADNOUGHT", "TANKER"];
const HULL_LABEL: Record<FleetHullClassId, string> = {
  SCOUT: "Scout (25 Prod, recon only)",
  RAIDER: "Raider (80 Prod, 50 dmg)",
  BATTLELINE: "Battleline (200 Prod, 200 dmg)",
  DREADNOUGHT: "Dreadnought (500 Prod, 600 dmg, slow)",
  TANKER: "Tanker (60 Prod, no effect)"
};

export type FleetTargetOption = { seasonId: string; label: string };

export type FleetBlueprintView = { id: string; name: string; composition: Partial<Record<FleetHullClassId, number>>; weaponEmphasis: string };

export type FleetOrderView = {
  id: string;
  targetLabel: string;
  status: "TRAVELING" | "RESOLVED";
  arrivesAt: number;
  outcomeSummary?: string;
};

export type FleetBattleLogEntryView = {
  attackerLabel: string;
  defenderLabel: string;
  summary: string;
  resolvedAt: number;
};

const escapeHtml = (input: string): string =>
  input.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

const compositionSummary = (composition: Partial<Record<FleetHullClassId, number>>): string =>
  FLEET_HULL_CLASS_IDS.filter((id) => (composition[id] ?? 0) > 0)
    .map((id) => `${composition[id]}× ${id}`)
    .join(", ") || "(empty)";

export const fleetHullInputsHtml = (): string =>
  FLEET_HULL_CLASS_IDS.map(
    (id) => `
    <label class="fl-hull-input">
      <span>${HULL_LABEL[id]}</span>
      <input type="number" min="0" step="1" value="0" data-fleet-hull-count="${id}">
    </label>`
  ).join("");

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
        .map(
          (o) => `
      <li class="fl-order fl-status-${o.status.toLowerCase()}">
        <span class="fl-order-target">${escapeHtml(o.targetLabel)}</span>
        <span class="fl-order-status">${o.status}</span>
        ${o.outcomeSummary ? `<span class="fl-order-outcome">${escapeHtml(o.outcomeSummary)}</span>` : ""}
      </li>`
        )
        .join("")}</ul>`
    : `<p class="fl-empty">No fleets sent yet.</p>`;

export const fleetBattleLogHtml = (entries: FleetBattleLogEntryView[]): string =>
  entries.length > 0
    ? `<ul class="fl-log-list">${entries
        .map(
          (e) => `
      <li class="fl-log-entry">
        <span class="fl-log-attacker">${escapeHtml(e.attackerLabel)}</span>
        <span class="fl-log-arrow">→</span>
        <span class="fl-log-defender">${escapeHtml(e.defenderLabel)}</span>
        <span class="fl-log-summary">${escapeHtml(e.summary)}</span>
      </li>`
        )
        .join("")}</ul>`
    : `<p class="fl-empty">No raids logged yet.</p>`;

export const fleetPanelHtml = (targetOptionsHtml: string): string => `
  <div class="fl-panel">
    <h3 class="fl-heading">Fleets</h3>
    <div class="fl-section">
      <h4>Send a Fleet</h4>
      <form class="fl-form" data-fleet-send-form>
        <div class="fl-hull-inputs">${fleetHullInputsHtml()}</div>
        <select class="fl-select" data-fleet-target-select>${targetOptionsHtml}</select>
        <select class="fl-select" data-fleet-weapon-select>
          <option value="KINETIC">Kinetic</option>
          <option value="ENERGY">Energy</option>
          <option value="MISSILE">Missile</option>
        </select>
        <input type="text" class="fl-select" placeholder="Save as blueprint (optional name)" data-fleet-blueprint-name>
        <button type="submit" class="sv-btn">Send Fleet</button>
        <button type="button" class="sv-btn" data-fleet-save-blueprint>Save Blueprint Only</button>
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
  .fl-heading{margin:0;color:#f8fafc;font-size:15px}
  .fl-section h4{margin:0 0 6px;color:#e2e8f0;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
  .fl-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .fl-hull-inputs{display:flex;gap:8px;flex-wrap:wrap}
  .fl-hull-input{display:flex;flex-direction:column;gap:2px;font-size:10px;color:#94a3b8}
  .fl-hull-input input{width:60px;background:rgba(15,23,42,.7);color:#e2e8f0;border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:4px 6px}
  .fl-select{background:rgba(15,23,42,.7);color:#e2e8f0;border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:6px 8px;font-size:12px}
  .fl-message{margin:0;font-size:12px;color:#facc15}
  .fl-blueprint-list,.fl-order-list,.fl-log-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:160px;overflow:auto}
  .fl-blueprint,.fl-order,.fl-log-entry{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 10px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(15,23,42,.5);font-size:12px;color:#e2e8f0}
  .fl-status-traveling .fl-order-status{color:#facc15}
  .fl-status-resolved .fl-order-status{color:#4ade80}
  .fl-empty{color:#94a3b8;font-size:12px;margin:0}
`;
