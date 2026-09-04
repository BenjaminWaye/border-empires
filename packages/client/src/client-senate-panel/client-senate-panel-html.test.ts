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
});

describe("senateTargetOptionsHtml", () => {
  it("renders an option per target with the seasonId as the value", () => {
    const html = senateTargetOptionsHtml([{ seasonId: "season-1", label: "Aurelia" }]);
    expect(html).toBe('<option value="season-1">Aurelia</option>');
  });
});
