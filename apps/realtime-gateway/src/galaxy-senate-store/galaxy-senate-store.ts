// Galactic meta-layer v1 (docs/galactic-campaign-design.md §4/§13): Senate
// proposals and votes. Mirrors galaxy-economy-store.ts's shape (durable,
// authUid-keyed, InMemory + Sqlite implementations of the same interface).
//
// Scope note: only EMBARGO (a Sanction) and CONTEST are modeled here.
// Weapons Inspection, Blockade, Travel Ban, and War Reparations all act on
// Fleets or on a just-failed raid/Contest, neither of which exist yet
// (Fleets are §12's v2a) — building them now would be dead code with
// nothing to act on. The Terrain vote is skipped too: its effect requires
// hooking into season/Sector creation, which this pass doesn't touch.
export type GalaxySenateProposalType = "EMBARGO" | "CONTEST";
export type GalaxySenateProposalStatus = "PENDING" | "PASSED" | "FAILED";

export type GalaxySenateProposal = {
  id: string;
  type: GalaxySenateProposalType;
  proposerAuthUid: string;
  targetAuthUid: string;
  // Only meaningful for CONTEST — identifies which of the target's held
  // territories is being forced open. Undefined for EMBARGO, which targets
  // the whole empire's economy rather than one territory.
  targetSeasonId?: string;
  createdAt: number;
  // The global Cycle index (see galaxy-senate-tick.ts) this proposal was
  // raised in. It resolves once the shared galaxy Cycle clock advances past
  // this index — see the doc's "resolves at the next Cycle tick".
  createdAtCycleIndex: number;
  status: GalaxySenateProposalStatus;
  resolvedAt?: number;
  // For a PASSED EMBARGO only: the Cycle index through which the sanction's
  // trickle reduction stays active (§13: 2 Cycles duration).
  activeUntilCycleIndex?: number;
};

export type GalaxySenateVote = {
  proposalId: string;
  voterAuthUid: string;
  // Dominion vote weight (§13/§19.7) snapshotted at the moment of voting —
  // not recomputed later, so a vote's weight can't drift after the fact if
  // the voter's holdings change before resolution.
  weight: number;
  castAt: number;
};

export type CreateSenateProposalInput = {
  type: GalaxySenateProposalType;
  proposerAuthUid: string;
  targetAuthUid: string;
  targetSeasonId?: string;
  createdAt: number;
  createdAtCycleIndex: number;
};

export type ResolveSenateProposalInput = {
  status: "PASSED" | "FAILED";
  resolvedAt: number;
  activeUntilCycleIndex?: number;
};

export type GalaxySenateStore = {
  createProposal: (input: CreateSenateProposalInput) => Promise<GalaxySenateProposal>;
  getProposal: (id: string) => Promise<GalaxySenateProposal | undefined>;
  // Every proposal still awaiting resolution — what the resolution
  // scheduler iterates each poll.
  getPendingProposals: () => Promise<GalaxySenateProposal[]>;
  resolveProposal: (id: string, input: ResolveSenateProposalInput) => Promise<void>;

  addVote: (vote: GalaxySenateVote) => Promise<void>;
  getVotesForProposal: (proposalId: string) => Promise<GalaxySenateVote[]>;
  hasVoted: (proposalId: string, voterAuthUid: string) => Promise<boolean>;

  // Most recently resolved proposal of this type against this target, for
  // §13's "cooldown per target" — undefined if never targeted before.
  getLatestResolvedProposal: (targetAuthUid: string, type: GalaxySenateProposalType) => Promise<GalaxySenateProposal | undefined>;

  // authUids currently under a PASSED, still-active EMBARGO as of the given
  // Cycle index — the economy tick scheduler's lookup for the trickle
  // reduction (galaxy-cycle-tick.ts).
  getActiveEmbargoAuthUids: (currentCycleIndex: number) => Promise<Set<string>>;

  // Most recent proposals regardless of status, newest first — for a future
  // "Senate" UI surface. Not used by any resolution logic.
  listRecentProposals: (limit: number) => Promise<GalaxySenateProposal[]>;
};

export class InMemoryGalaxySenateStore implements GalaxySenateStore {
  private readonly proposals = new Map<string, GalaxySenateProposal>();
  private readonly votesByProposal = new Map<string, GalaxySenateVote[]>();
  private nextId = 1;

  async createProposal(input: CreateSenateProposalInput): Promise<GalaxySenateProposal> {
    const id = `senate-${this.nextId++}`;
    const proposal: GalaxySenateProposal = {
      id,
      type: input.type,
      proposerAuthUid: input.proposerAuthUid,
      targetAuthUid: input.targetAuthUid,
      ...(input.targetSeasonId ? { targetSeasonId: input.targetSeasonId } : {}),
      createdAt: input.createdAt,
      createdAtCycleIndex: input.createdAtCycleIndex,
      status: "PENDING"
    };
    this.proposals.set(id, proposal);
    this.votesByProposal.set(id, []);
    return { ...proposal };
  }

  async getProposal(id: string): Promise<GalaxySenateProposal | undefined> {
    const existing = this.proposals.get(id);
    return existing ? { ...existing } : undefined;
  }

  async getPendingProposals(): Promise<GalaxySenateProposal[]> {
    return [...this.proposals.values()].filter((p) => p.status === "PENDING").map((p) => ({ ...p }));
  }

  async resolveProposal(id: string, input: ResolveSenateProposalInput): Promise<void> {
    const existing = this.proposals.get(id);
    if (!existing) return;
    this.proposals.set(id, {
      ...existing,
      status: input.status,
      resolvedAt: input.resolvedAt,
      ...(input.activeUntilCycleIndex !== undefined ? { activeUntilCycleIndex: input.activeUntilCycleIndex } : {})
    });
  }

  async addVote(vote: GalaxySenateVote): Promise<void> {
    const list = this.votesByProposal.get(vote.proposalId);
    if (list) list.push({ ...vote });
    else this.votesByProposal.set(vote.proposalId, [{ ...vote }]);
  }

  async getVotesForProposal(proposalId: string): Promise<GalaxySenateVote[]> {
    return (this.votesByProposal.get(proposalId) ?? []).map((v) => ({ ...v }));
  }

  async hasVoted(proposalId: string, voterAuthUid: string): Promise<boolean> {
    return (this.votesByProposal.get(proposalId) ?? []).some((v) => v.voterAuthUid === voterAuthUid);
  }

  async getLatestResolvedProposal(targetAuthUid: string, type: GalaxySenateProposalType): Promise<GalaxySenateProposal | undefined> {
    let latest: GalaxySenateProposal | undefined;
    for (const proposal of this.proposals.values()) {
      if (proposal.targetAuthUid !== targetAuthUid || proposal.type !== type || proposal.status === "PENDING") continue;
      if (!latest || (proposal.resolvedAt ?? 0) > (latest.resolvedAt ?? 0)) latest = proposal;
    }
    return latest ? { ...latest } : undefined;
  }

  async getActiveEmbargoAuthUids(currentCycleIndex: number): Promise<Set<string>> {
    const active = new Set<string>();
    for (const proposal of this.proposals.values()) {
      if (proposal.type !== "EMBARGO" || proposal.status !== "PASSED") continue;
      if ((proposal.activeUntilCycleIndex ?? -1) >= currentCycleIndex) active.add(proposal.targetAuthUid);
    }
    return active;
  }

  async listRecentProposals(limit: number): Promise<GalaxySenateProposal[]> {
    return [...this.proposals.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((p) => ({ ...p }));
  }
}
