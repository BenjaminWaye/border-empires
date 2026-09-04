// Galactic meta-layer (docs/galactic-campaign-design.md §7/§11): the two
// pieces of durable state Defense Campaign auto-scheduling needs, neither of
// which existed before this: a FIFO queue of territories whose Stability
// hit 0 and are awaiting a Defense Campaign season, and a record of
// ownership transfers once one resolves. Kept as its own store (mirroring
// galaxy-economy-store.ts's shape) rather than folded into an existing one,
// since neither concept is an economy balance or a Stability value.
//
// Ownership transfer is the mechanism that makes "a Defense Campaign's
// winner takes over the ORIGINAL territory" possible at all: every other
// galaxy read path (resolveGalaxyHoldingsByOwner, /hq/galaxy/me, /hq/galaxy)
// derives ownership purely from "whoever won seasonId X's season" -- with no
// way for a *later* season to change who owns an *earlier* territory. A
// transfer record is that override: "seasonId X is now owned by authUid Y,
// as of the DC season that won it."
export type GalaxyContestedEntry = {
  // The original territory's own seasonId -- its permanent identity,
  // unrelated to whichever season eventually wins it back.
  targetSeasonId: string;
  // Owner at the moment it was contested, kept for audit/display purposes
  // only; the read path never trusts this once a transfer record exists.
  targetAuthUid: string;
  queuedAt: number;
};

export type GalaxyOwnershipTransfer = {
  originalSeasonId: string;
  currentOwnerAuthUid: string;
  transferredAt: number;
  // The Defense Campaign season whose winner received the territory --
  // kept for the era record/audit trail, not read by ownership resolution.
  wonViaSeasonId: string;
};

export type GalaxyDefenseCampaignStore = {
  enqueueContested: (entry: GalaxyContestedEntry) => Promise<void>;
  // Pops the oldest still-queued entry (FIFO -- "oldest-contested-first" per
  // §11), removing it. Undefined if the queue is empty. A territory that
  // gets re-contested while already queued is deliberately not
  // de-duplicated here -- see the scheduler's own handling.
  popOldestContested: () => Promise<GalaxyContestedEntry | undefined>;
  getQueueLength: () => Promise<number>;

  recordTransfer: (transfer: GalaxyOwnershipTransfer) => Promise<void>;
  getTransferForSeasonId: (originalSeasonId: string) => Promise<GalaxyOwnershipTransfer | undefined>;
  // Every transfer on record -- the read path needs the full set (keyed by
  // originalSeasonId) to override ownership across every held territory in
  // one pass, not a one-at-a-time lookup per territory.
  getAllTransfers: () => Promise<GalaxyOwnershipTransfer[]>;
};

export class InMemoryGalaxyDefenseCampaignStore implements GalaxyDefenseCampaignStore {
  private readonly queue: GalaxyContestedEntry[] = [];
  private readonly transfers = new Map<string, GalaxyOwnershipTransfer>();

  async enqueueContested(entry: GalaxyContestedEntry): Promise<void> {
    this.queue.push({ ...entry });
  }

  async popOldestContested(): Promise<GalaxyContestedEntry | undefined> {
    const entry = this.queue.shift();
    return entry ? { ...entry } : undefined;
  }

  async getQueueLength(): Promise<number> {
    return this.queue.length;
  }

  async recordTransfer(transfer: GalaxyOwnershipTransfer): Promise<void> {
    this.transfers.set(transfer.originalSeasonId, { ...transfer });
  }

  async getTransferForSeasonId(originalSeasonId: string): Promise<GalaxyOwnershipTransfer | undefined> {
    const existing = this.transfers.get(originalSeasonId);
    return existing ? { ...existing } : undefined;
  }

  async getAllTransfers(): Promise<GalaxyOwnershipTransfer[]> {
    return [...this.transfers.values()].map((t) => ({ ...t }));
  }
}
