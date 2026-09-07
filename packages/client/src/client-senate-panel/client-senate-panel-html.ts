// Pure HTML builders for the Space View Senate panel (galactic v1 backend,
// docs/galactic-campaign-design.md §4/§13). Kept separate from
// client-senate-panel.ts (DOM/network wiring) the same way
// client-space-view-html.ts is split from client-space-view.ts.

export type SenateProposalView = {
  id: string;
  type: "EMBARGO" | "CONTEST";
  status: "PENDING" | "PASSED" | "FAILED";
  targetLabel: string;
  createdAt: number;
  canVote: boolean;
  // Live vote tally (from GET /hq/galaxy/senate's decorated response) --
  // undefined only if the gateway hasn't wired the dominion-weight deps
  // this needs, in which case the panel just omits the progress bar rather
  // than showing a broken/empty one.
  castWeight?: number;
  totalWeight?: number;
  quorumPct?: number;
  distinctVoters?: number;
  minDistinctVoters?: number;
  resolvesAt?: number;
};

export type SenateTargetOption = { seasonId: string; label: string };

// Mirrors GALAXY_SENATE_ACTIONS in apps/realtime-gateway/src/galaxy-senate-tick/
// galaxy-senate-tick.ts -- display only, the server is the source of truth
// and re-validates the real cost on submit.
const ACTION_INFO: Record<"EMBARGO" | "CONTEST", { icon: string; cost: number; quorumPct: number; summary: string }> = {
  EMBARGO: { icon: "🚫", cost: 15, quorumPct: 25, summary: "Halves the target's Influence/Production trickle for 2 Cycles." },
  CONTEST: { icon: "⚔️", cost: 40, quorumPct: 40, summary: "Forces the named territory's Stability to 0 and opens a Defense Campaign." }
};

const escapeHtml = (input: string): string =>
  input.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

const relativeTimeFromNow = (targetMs: number): string => {
  const diffMs = targetMs - Date.now();
  if (diffMs <= 0) return "any moment now";
  const hours = diffMs / (60 * 60 * 1000);
  if (hours < 1) return `~${Math.max(1, Math.round(diffMs / 60_000))}m`;
  if (hours < 48) return `~${Math.round(hours)}h`;
  return `~${Math.round(hours / 24)}d`;
};

const quorumBarHtml = (proposal: SenateProposalView): string => {
  if (proposal.totalWeight === undefined || proposal.totalWeight <= 0 || proposal.quorumPct === undefined) return "";
  const castPct = Math.min(100, ((proposal.castWeight ?? 0) / proposal.totalWeight) * 100);
  const quorumPct = proposal.quorumPct * 100;
  const cleared = castPct >= quorumPct && (proposal.distinctVoters ?? 0) >= (proposal.minDistinctVoters ?? 0);
  const votersLabel = proposal.minDistinctVoters !== undefined ? `${proposal.distinctVoters ?? 0}/${proposal.minDistinctVoters} voters` : "";
  return `
    <div class="sn-quorum">
      <div class="sn-quorum-track">
        <div class="sn-quorum-fill ${cleared ? "sn-quorum-cleared" : ""}" style="width:${castPct.toFixed(1)}%"></div>
        <div class="sn-quorum-tick" style="left:${Math.min(100, quorumPct).toFixed(1)}%" title="${quorumPct.toFixed(0)}% quorum needed"></div>
      </div>
      <div class="sn-quorum-meta">
        <span>${castPct.toFixed(0)}% of ${quorumPct.toFixed(0)}% quorum</span>
        ${votersLabel ? `<span>${votersLabel}</span>` : ""}
      </div>
    </div>`;
};

export const senateProposalRowHtml = (proposal: SenateProposalView): string => {
  const info = ACTION_INFO[proposal.type];
  const resolveNote =
    proposal.status === "PENDING" && proposal.resolvesAt !== undefined ? `<span class="sn-resolves">resolves ${relativeTimeFromNow(proposal.resolvesAt)}</span>` : "";
  return `
  <li class="sn-proposal sn-status-${proposal.status.toLowerCase()}" data-senate-proposal-id="${proposal.id}">
    <div class="sn-proposal-main">
      <span class="sn-pill sn-pill-${proposal.type.toLowerCase()}">${info.icon} ${proposal.type}</span>
      <span class="sn-proposal-target">${escapeHtml(proposal.targetLabel)}</span>
      <span class="sn-pill sn-pill-status-${proposal.status.toLowerCase()}">${proposal.status}</span>
      ${resolveNote}
    </div>
    ${proposal.status === "PENDING" ? quorumBarHtml(proposal) : ""}
    ${proposal.canVote ? `<button type="button" class="sv-btn sn-vote-btn" data-senate-vote>Cast Vote</button>` : ""}
  </li>
`;
};

export const senateProposalListHtml = (proposals: SenateProposalView[]): string =>
  proposals.length > 0
    ? `<ul class="sn-proposal-list">${proposals.map(senateProposalRowHtml).join("")}</ul>`
    : `<p class="sn-empty">No Senate proposals yet.</p>`;

export const senateTargetOptionsHtml = (targets: SenateTargetOption[]): string =>
  targets.map((t) => `<option value="${t.seasonId}">${escapeHtml(t.label)}</option>`).join("");

const actionCardHtml = (type: "EMBARGO" | "CONTEST", selected: boolean): string => {
  const info = ACTION_INFO[type];
  return `
    <label class="sn-action-card ${selected ? "sn-action-card-selected" : ""}">
      <input type="radio" name="sn-action-type" value="${type}" data-senate-type-radio ${selected ? "checked" : ""}>
      <span class="sn-action-icon">${info.icon}</span>
      <span class="sn-action-name">${type}</span>
      <span class="sn-action-cost">${info.cost} Influence</span>
      <span class="sn-action-summary">${info.summary}</span>
    </label>`;
};

export const senatePanelHtml = (proposalsHtml: string, targetOptionsHtml: string): string => `
  <div class="sn-panel">
    <div class="sn-header">
      <h3 class="sn-heading">🏛️ Galactic Senate</h3>
    </div>
    <div class="sn-proposals" data-senate-proposals>${proposalsHtml}</div>
    <form class="sn-form" data-senate-propose-form>
      <div class="sn-action-cards">
        ${actionCardHtml("EMBARGO", true)}
        ${actionCardHtml("CONTEST", false)}
      </div>
      <select class="sn-select" data-senate-target-select>${targetOptionsHtml}</select>
      <button type="submit" class="sv-btn sn-propose-btn">Raise Proposal</button>
    </form>
    <p class="sn-message" data-senate-message hidden></p>
  </div>
`;

export const senateStyle = `
  .sn-panel{display:flex;flex-direction:column;gap:14px}
  .sn-header{border-left:3px solid #a78bfa;padding-left:10px}
  .sn-heading{margin:0;color:#f8fafc;font-size:15px;letter-spacing:.02em}
  .sn-proposal-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;max-height:280px;overflow:auto}
  .sn-proposal{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid rgba(167,139,250,.25);border-radius:8px;background:linear-gradient(180deg,rgba(88,28,135,.18),rgba(15,23,42,.55))}
  .sn-proposal-main{display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:#e2e8f0;font-size:12px}
  .sn-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.03em}
  .sn-pill-embargo{background:rgba(251,191,36,.18);color:#fbbf24;border:1px solid rgba(251,191,36,.35)}
  .sn-pill-contest{background:rgba(248,113,113,.18);color:#f87171;border:1px solid rgba(248,113,113,.35)}
  .sn-proposal-target{color:#cbd5e1;font-weight:600}
  .sn-pill-status-pending{background:rgba(250,204,21,.15);color:#facc15;border:1px solid rgba(250,204,21,.3)}
  .sn-pill-status-passed{background:rgba(74,222,128,.15);color:#4ade80;border:1px solid rgba(74,222,128,.3)}
  .sn-pill-status-failed{background:rgba(148,163,184,.15);color:#94a3b8;border:1px solid rgba(148,163,184,.3)}
  .sn-resolves{margin-left:auto;color:#94a3b8;font-size:11px;font-style:italic}
  .sn-quorum-track{position:relative;height:8px;border-radius:999px;background:rgba(255,255,255,.08);overflow:visible}
  .sn-quorum-fill{position:absolute;inset:0;width:0;border-radius:999px;background:linear-gradient(90deg,#a78bfa,#818cf8);transition:width .4s ease}
  .sn-quorum-fill.sn-quorum-cleared{background:linear-gradient(90deg,#4ade80,#22c55e)}
  .sn-quorum-tick{position:absolute;top:-3px;width:2px;height:14px;background:#f8fafc;opacity:.8}
  .sn-quorum-meta{display:flex;justify-content:space-between;color:#94a3b8;font-size:10px;margin-top:4px}
  .sn-vote-btn{align-self:flex-start}
  .sn-empty{color:#94a3b8;font-size:12px;margin:0}
  .sn-form{display:flex;flex-direction:column;gap:10px}
  .sn-action-cards{display:flex;gap:8px;flex-wrap:wrap}
  .sn-action-card{position:relative;flex:1;min-width:140px;display:flex;flex-direction:column;gap:2px;padding:10px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(15,23,42,.5);cursor:pointer;transition:border-color .15s,background .15s}
  .sn-action-card:hover{border-color:rgba(167,139,250,.5)}
  .sn-action-card-selected{border-color:#a78bfa;background:rgba(88,28,135,.25)}
  .sn-action-card input{position:absolute;opacity:0;pointer-events:none}
  .sn-action-icon{font-size:18px}
  .sn-action-name{color:#f8fafc;font-weight:700;font-size:12px}
  .sn-action-cost{color:#facc15;font-size:11px}
  .sn-action-summary{color:#94a3b8;font-size:10px;line-height:1.3}
  .sn-select{background:rgba(15,23,42,.7);color:#e2e8f0;border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:6px 8px;font-size:12px}
  .sn-propose-btn{align-self:flex-start;border-color:#a78bfa}
  .sn-message{margin:0;font-size:12px;color:#facc15}
`;
