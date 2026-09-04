import { describe, expect, it } from "vitest";

import { InMemoryGalaxySenateStore } from "./galaxy-senate-store.js";

describe("InMemoryGalaxySenateStore", () => {
  it("creates a proposal PENDING with the input fields, generating an id", async () => {
    const store = new InMemoryGalaxySenateStore();
    const proposal = await store.createProposal({
      type: "CONTEST",
      proposerAuthUid: "uid-1",
      targetAuthUid: "uid-2",
      targetSeasonId: "season-9",
      createdAt: 1_000,
      createdAtCycleIndex: 3
    });
    expect(proposal.status).toBe("PENDING");
    expect(proposal.id).toBeTruthy();
    await expect(store.getProposal(proposal.id)).resolves.toEqual(proposal);
  });

  it("omits targetSeasonId when not provided (EMBARGO targets the whole empire)", async () => {
    const store = new InMemoryGalaxySenateStore();
    const proposal = await store.createProposal({
      type: "EMBARGO",
      proposerAuthUid: "uid-1",
      targetAuthUid: "uid-2",
      createdAt: 1_000,
      createdAtCycleIndex: 3
    });
    expect(proposal.targetSeasonId).toBeUndefined();
  });

  it("getPendingProposals only returns PENDING proposals", async () => {
    const store = new InMemoryGalaxySenateStore();
    const a = await store.createProposal({ type: "EMBARGO", proposerAuthUid: "p", targetAuthUid: "t1", createdAt: 1, createdAtCycleIndex: 0 });
    await store.createProposal({ type: "EMBARGO", proposerAuthUid: "p", targetAuthUid: "t2", createdAt: 1, createdAtCycleIndex: 0 });
    await store.resolveProposal(a.id, { status: "PASSED", resolvedAt: 2 });

    const pending = await store.getPendingProposals();
    expect(pending.map((p) => p.targetAuthUid)).toEqual(["t2"]);
  });

  it("addVote / getVotesForProposal / hasVoted round-trip", async () => {
    const store = new InMemoryGalaxySenateStore();
    const proposal = await store.createProposal({ type: "CONTEST", proposerAuthUid: "p", targetAuthUid: "t", createdAt: 1, createdAtCycleIndex: 0 });

    await expect(store.hasVoted(proposal.id, "voter-1")).resolves.toBe(false);
    await store.addVote({ proposalId: proposal.id, voterAuthUid: "voter-1", weight: 12, castAt: 5 });
    await expect(store.hasVoted(proposal.id, "voter-1")).resolves.toBe(true);

    const votes = await store.getVotesForProposal(proposal.id);
    expect(votes).toEqual([{ proposalId: proposal.id, voterAuthUid: "voter-1", weight: 12, castAt: 5 }]);
  });

  it("getLatestResolvedProposal ignores PENDING proposals and picks the most recently resolved", async () => {
    const store = new InMemoryGalaxySenateStore();
    const a = await store.createProposal({ type: "EMBARGO", proposerAuthUid: "p", targetAuthUid: "t", createdAt: 1, createdAtCycleIndex: 0 });
    const b = await store.createProposal({ type: "EMBARGO", proposerAuthUid: "p", targetAuthUid: "t", createdAt: 2, createdAtCycleIndex: 1 });
    await store.createProposal({ type: "EMBARGO", proposerAuthUid: "p", targetAuthUid: "t", createdAt: 3, createdAtCycleIndex: 2 }); // stays PENDING

    await store.resolveProposal(a.id, { status: "FAILED", resolvedAt: 100 });
    await store.resolveProposal(b.id, { status: "PASSED", resolvedAt: 200 });

    const latest = await store.getLatestResolvedProposal("t", "EMBARGO");
    expect(latest?.id).toBe(b.id);
  });

  it("getLatestResolvedProposal returns undefined for a never-targeted empire", async () => {
    const store = new InMemoryGalaxySenateStore();
    await expect(store.getLatestResolvedProposal("nobody", "CONTEST")).resolves.toBeUndefined();
  });

  it("getActiveEmbargoAuthUids only returns PASSED, still-active EMBARGOes", async () => {
    const store = new InMemoryGalaxySenateStore();
    const active = await store.createProposal({ type: "EMBARGO", proposerAuthUid: "p", targetAuthUid: "still-active", createdAt: 1, createdAtCycleIndex: 0 });
    const expired = await store.createProposal({ type: "EMBARGO", proposerAuthUid: "p", targetAuthUid: "expired", createdAt: 1, createdAtCycleIndex: 0 });
    const failed = await store.createProposal({ type: "EMBARGO", proposerAuthUid: "p", targetAuthUid: "failed", createdAt: 1, createdAtCycleIndex: 0 });
    const contestNotEmbargo = await store.createProposal({ type: "CONTEST", proposerAuthUid: "p", targetAuthUid: "contested", createdAt: 1, createdAtCycleIndex: 0 });

    await store.resolveProposal(active.id, { status: "PASSED", resolvedAt: 10, activeUntilCycleIndex: 5 });
    await store.resolveProposal(expired.id, { status: "PASSED", resolvedAt: 10, activeUntilCycleIndex: 2 });
    await store.resolveProposal(failed.id, { status: "FAILED", resolvedAt: 10 });
    await store.resolveProposal(contestNotEmbargo.id, { status: "PASSED", resolvedAt: 10 });

    const activeAt5 = await store.getActiveEmbargoAuthUids(5);
    expect(activeAt5).toEqual(new Set(["still-active"]));
  });

  it("listRecentProposals sorts newest-first and respects the limit", async () => {
    const store = new InMemoryGalaxySenateStore();
    await store.createProposal({ type: "EMBARGO", proposerAuthUid: "p", targetAuthUid: "t1", createdAt: 1, createdAtCycleIndex: 0 });
    await store.createProposal({ type: "EMBARGO", proposerAuthUid: "p", targetAuthUid: "t2", createdAt: 3, createdAtCycleIndex: 0 });
    await store.createProposal({ type: "EMBARGO", proposerAuthUid: "p", targetAuthUid: "t3", createdAt: 2, createdAtCycleIndex: 0 });

    const recent = await store.listRecentProposals(2);
    expect(recent.map((p) => p.targetAuthUid)).toEqual(["t2", "t3"]);
  });
});
