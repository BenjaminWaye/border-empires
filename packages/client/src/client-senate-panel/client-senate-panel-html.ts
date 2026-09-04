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
};

export type SenateTargetOption = { seasonId: string; label: string };

// Mirrors GALAXY_SENATE_ACTIONS in apps/realtime-gateway/src/galaxy-senate-tick/
// galaxy-senate-tick.ts -- display only, the server is the source of truth
// and re-validates the real cost on submit.
const PROPOSAL_COST: Record<"EMBARGO" | "CONTEST", number> = { EMBARGO: 15, CONTEST: 40 };

const escapeHtml = (input: string): string =>
  input.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

export const senateProposalRowHtml = (proposal: SenateProposalView): string => `
  <li class="sn-proposal sn-status-${proposal.status.toLowerCase()}" data-senate-proposal-id="${proposal.id}">
    <div class="sn-proposal-main">
      <span class="sn-proposal-type">${proposal.type}</span>
      <span class="sn-proposal-target">${escapeHtml(proposal.targetLabel)}</span>
      <span class="sn-proposal-status">${proposal.status}</span>
    </div>
    ${proposal.canVote ? `<button type="button" class="sv-btn sn-vote-btn" data-senate-vote>Vote</button>` : ""}
  </li>
`;

export const senateProposalListHtml = (proposals: SenateProposalView[]): string =>
  proposals.length > 0
    ? `<ul class="sn-proposal-list">${proposals.map(senateProposalRowHtml).join("")}</ul>`
    : `<p class="sn-empty">No Senate proposals yet.</p>`;

export const senateTargetOptionsHtml = (targets: SenateTargetOption[]): string =>
  targets.map((t) => `<option value="${t.seasonId}">${escapeHtml(t.label)}</option>`).join("");

export const senatePanelHtml = (proposalsHtml: string, targetOptionsHtml: string): string => `
  <div class="sn-panel">
    <h3 class="sn-heading">Galactic Senate</h3>
    <div class="sn-proposals" data-senate-proposals>${proposalsHtml}</div>
    <form class="sn-form" data-senate-propose-form>
      <select class="sn-select" data-senate-type-select>
        <option value="EMBARGO">Embargo (${PROPOSAL_COST.EMBARGO} Influence)</option>
        <option value="CONTEST">Contest (${PROPOSAL_COST.CONTEST} Influence)</option>
      </select>
      <select class="sn-select" data-senate-target-select>${targetOptionsHtml}</select>
      <button type="submit" class="sv-btn">Raise Proposal</button>
    </form>
    <p class="sn-message" data-senate-message hidden></p>
  </div>
`;

export const senateStyle = `
  .sn-panel{display:flex;flex-direction:column;gap:12px}
  .sn-heading{margin:0;color:#f8fafc;font-size:15px}
  .sn-proposal-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto}
  .sn-proposal{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(15,23,42,.5)}
  .sn-proposal-main{display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:#e2e8f0;font-size:12px}
  .sn-proposal-type{font-weight:700}
  .sn-status-passed .sn-proposal-status{color:#4ade80}
  .sn-status-failed .sn-proposal-status{color:#f87171}
  .sn-status-pending .sn-proposal-status{color:#facc15}
  .sn-empty{color:#94a3b8;font-size:12px;margin:0}
  .sn-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .sn-select{background:rgba(15,23,42,.7);color:#e2e8f0;border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:6px 8px;font-size:12px}
  .sn-message{margin:0;font-size:12px;color:#facc15}
`;
