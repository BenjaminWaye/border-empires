// DOM/network wiring for the Space View Senate panel (galactic v1 backend --
// see docs/galactic-campaign-design.md §4/§13, and PR #1817 for the routes
// this drives: GET /hq/galaxy/senate, POST /hq/galaxy/senate/propose, POST
// /hq/galaxy/senate/vote). Kept separate from client-senate-panel-html.ts
// (pure HTML) the same way client-space-view.ts is split from
// client-space-view-html.ts.
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { senatePanelHtml, senateProposalListHtml, senateTargetOptionsHtml, type SenateProposalView, type SenateTargetOption } from "./client-senate-panel-html.js";

type RawSenateProposal = {
  id: string;
  type: "EMBARGO" | "CONTEST";
  status: "PENDING" | "PASSED" | "FAILED";
  targetSeasonId?: string;
  targetAuthUid: string;
  createdAt: number;
};

export type SenatePanelDeps = {
  wsUrl: string;
  getIdToken: () => Promise<string | undefined>;
  // Candidate proposal targets: every publicly-held territory (Planets +
  // Outposts) except the caller's own. Space View already fetches `GET
  // /hq/galaxy` for the 3D scene, so this is handed in rather than re-fetched.
  getTargetOptions: () => SenateTargetOption[];
};

const HTTP_ERROR_MESSAGES: Record<number, string> = {
  401: "You must be signed in to use the Senate.",
  402: "Not enough Influence for this proposal.",
  403: "Only a Planet-holding empire may take this Senate action.",
  404: "That target is not a currently held territory.",
  409: "This action is on cooldown, already resolved, or already voted on."
};

export const mountSenatePanel = (container: HTMLElement, deps: SenatePanelDeps): { refresh: () => Promise<void> } => {
  const authHeader = async (): Promise<Record<string, string> | undefined> => {
    const token = await deps.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  const showMessage = (text: string): void => {
    const el = container.querySelector<HTMLParagraphElement>("[data-senate-message]");
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
  };

  const toProposalView = (proposal: RawSenateProposal, myVotedIds: ReadonlySet<string>): SenateProposalView => ({
    id: proposal.id,
    type: proposal.type,
    status: proposal.status,
    targetLabel: proposal.targetSeasonId ?? proposal.targetAuthUid,
    createdAt: proposal.createdAt,
    canVote: proposal.status === "PENDING" && !myVotedIds.has(proposal.id)
  });

  // The list endpoint doesn't say which proposals the caller already voted
  // on -- rather than adding a server round-trip per proposal, this panel
  // just tracks "voted this session" locally. A page reload can show the
  // vote button again for something already voted on; the POST still fails
  // safely with a 409 the message surfaces, so this is a UX nicety gap, not
  // a correctness one.
  const votedThisSession = new Set<string>();

  const renderProposals = (proposals: RawSenateProposal[]): void => {
    const list = container.querySelector<HTMLDivElement>("[data-senate-proposals]");
    if (!list) return;
    list.innerHTML = senateProposalListHtml(proposals.map((p) => toProposalView(p, votedThisSession)));
  };

  const fetchProposals = async (): Promise<RawSenateProposal[]> => {
    const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/senate`, { headers: { Accept: "application/json" } });
    if (!response.ok) return [];
    const body = (await response.json().catch(() => undefined)) as { proposals?: RawSenateProposal[] } | undefined;
    return body?.proposals ?? [];
  };

  const refresh = async (): Promise<void> => {
    const targetOptions = senateTargetOptionsHtml(deps.getTargetOptions());
    const select = container.querySelector<HTMLSelectElement>("[data-senate-target-select]");
    if (select) select.innerHTML = targetOptions;
    renderProposals(await fetchProposals());
  };

  container.innerHTML = senatePanelHtml("", senateTargetOptionsHtml(deps.getTargetOptions()));
  void refresh();

  container.addEventListener("submit", (event) => {
    const form = (event.target as HTMLElement).closest("[data-senate-propose-form]");
    if (!form) return;
    event.preventDefault();
    void (async () => {
      showMessage("");
      const type = container.querySelector<HTMLSelectElement>("[data-senate-type-select]")?.value;
      const targetSeasonId = container.querySelector<HTMLSelectElement>("[data-senate-target-select]")?.value;
      if (!type || !targetSeasonId) return;
      const headers = await authHeader();
      if (!headers) {
        showMessage(HTTP_ERROR_MESSAGES[401] ?? "You must be signed in to use the Senate.");
        return;
      }
      const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/senate/propose`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ type, targetSeasonId })
      });
      if (!response.ok) {
        showMessage(HTTP_ERROR_MESSAGES[response.status] ?? "Could not raise this proposal.");
        return;
      }
      showMessage("Proposal raised.");
      await refresh();
    })();
  });

  container.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const voteBtn = target.closest("[data-senate-vote]");
    if (!voteBtn) return;
    const proposalId = voteBtn.closest<HTMLElement>("[data-senate-proposal-id]")?.dataset.senateProposalId;
    if (!proposalId) return;
    void (async () => {
      showMessage("");
      const headers = await authHeader();
      if (!headers) {
        showMessage(HTTP_ERROR_MESSAGES[401] ?? "You must be signed in to use the Senate.");
        return;
      }
      const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/senate/vote`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ proposalId })
      });
      if (!response.ok) {
        showMessage(HTTP_ERROR_MESSAGES[response.status] ?? "Could not cast this vote.");
        return;
      }
      votedThisSession.add(proposalId);
      showMessage("Vote cast.");
      await refresh();
    })();
  });

  return { refresh };
};
