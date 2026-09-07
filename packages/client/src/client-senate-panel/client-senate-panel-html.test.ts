import { describe, expect, it } from "vitest";
import { senateProposalListHtml, senateTargetOptionsHtml, type SenateProposalView } from "./client-senate-panel-html.js";

describe("senateProposalListHtml", () => {
  it("renders an empty state with no proposals", () => {
    expect(senateProposalListHtml([])).toContain("No Senate proposals yet.");
  });

  it("shows a Vote button only for a PENDING proposal not yet voted on", () => {
    const pending: SenateProposalView = { id: "p1", type: "EMBARGO", status: "PENDING", targetLabel: "season-1", createdAt: 0, canVote: true };
    const html = senateProposalListHtml([pending]);
    expect(html).toContain("data-senate-vote");
    expect(html).toContain("EMBARGO");
  });

  it("omits the Vote button once resolved or already voted", () => {
    const resolved: SenateProposalView = { id: "p2", type: "CONTEST", status: "PASSED", targetLabel: "season-2", createdAt: 0, canVote: false };
    expect(senateProposalListHtml([resolved])).not.toContain("data-senate-vote");
  });

  it("escapes a target label containing HTML", () => {
    const proposal: SenateProposalView = { id: "p3", type: "EMBARGO", status: "PENDING", targetLabel: "<script>x</script>", createdAt: 0, canVote: false };
    const html = senateProposalListHtml([proposal]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a quorum bar sized to the cast fraction of total weight, with a tick at the quorum threshold", () => {
    const proposal: SenateProposalView = {
      id: "p4",
      type: "CONTEST",
      status: "PENDING",
      targetLabel: "season-1",
      createdAt: 0,
      canVote: true,
      castWeight: 20,
      totalWeight: 50,
      quorumPct: 0.4,
      distinctVoters: 1,
      minDistinctVoters: 3
    };
    const html = senateProposalListHtml([proposal]);
    expect(html).toContain('style="width:40.0%"');
    expect(html).toContain('style="left:40.0%"');
    expect(html).toContain("1/3 voters");
    expect(html).not.toContain("sn-quorum-cleared");
  });

  it("marks the quorum bar cleared once cast weight and distinct voters both clear their floors", () => {
    const proposal: SenateProposalView = {
      id: "p5",
      type: "EMBARGO",
      status: "PENDING",
      targetLabel: "season-1",
      createdAt: 0,
      canVote: false,
      castWeight: 30,
      totalWeight: 50,
      quorumPct: 0.25,
      distinctVoters: 3,
      minDistinctVoters: 3
    };
    expect(senateProposalListHtml([proposal])).toContain("sn-quorum-cleared");
  });

  it("omits the quorum bar entirely once a proposal has resolved", () => {
    const proposal: SenateProposalView = {
      id: "p6",
      type: "CONTEST",
      status: "PASSED",
      targetLabel: "season-1",
      createdAt: 0,
      canVote: false,
      castWeight: 30,
      totalWeight: 50,
      quorumPct: 0.4,
      distinctVoters: 3,
      minDistinctVoters: 3
    };
    expect(senateProposalListHtml([proposal])).not.toContain("sn-quorum-track");
  });

  it("omits the quorum bar when the listing carries no live tally data", () => {
    const proposal: SenateProposalView = { id: "p7", type: "EMBARGO", status: "PENDING", targetLabel: "season-1", createdAt: 0, canVote: true };
    expect(senateProposalListHtml([proposal])).not.toContain("sn-quorum-track");
  });
});

describe("senateTargetOptionsHtml", () => {
  it("renders an option per target with the seasonId as the value", () => {
    const html = senateTargetOptionsHtml([{ seasonId: "season-1", label: "Aurelia" }]);
    expect(html).toBe('<option value="season-1">Aurelia</option>');
  });
});
