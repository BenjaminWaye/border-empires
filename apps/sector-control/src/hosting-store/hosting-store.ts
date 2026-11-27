// Durable state of the hosting service (docs/hosted-sectors-plan.md, section 6).
// The database is the only source of truth: the service keeps no in-memory
// copy, so it can be restarted at any point of an order's life.
import type { HostedSectorOptions } from "@border-empires/shared";

/**
 * One row per order. The sector id exists from the moment of ordering so an
 * invite link can be shared before payment completes.
 *
 * awaiting_payment -> creating -> open -> ended -> deleted
 *                  \-> cancelled   \-> refunded (creation failed, or refunded by the owner)
 *
 * A sector paid by several people (split funding, plan section 12) starts in
 * "funding" instead: funding -> creating once its bar is full, or
 * funding -> cancelled when the deadline passes first.
 */
export const SECTOR_STATES = ["awaiting_payment", "funding", "creating", "open", "ended", "deleted", "cancelled", "refunded"] as const;
export type SectorState = (typeof SECTOR_STATES)[number];

/**
 * States in which an account's order occupies its one slot. An ended sector
 * (kept up a few days to look around) does not stop its host buying the next.
 */
export const LIVE_SECTOR_STATES: readonly SectorState[] = ["awaiting_payment", "funding", "creating", "open"];

/**
 * What a buyer agreed to before paying, kept as proof (docs/legal-drafts/README.md,
 * item 3): when, which version of the Terms of Sale, and the exact wording ticked.
 */
export type ConsentRecord = { at: number; termsVersion: string; text: string };

export type SectorRecord = {
  sectorId: string;
  hostUid: string;
  options: HostedSectorOptions;
  state: SectorState;
  amountCents: number;
  currency: string;
  /** The payment provider's reference for the checkout. */
  paymentRef?: string;
  checkoutUrl?: string;
  /** The server provider's reference; set once a server has been requested. */
  serverRef?: string;
  hostname?: string;
  createdAt: number;
  updatedAt: number;
  /** Split funding only: when an unfilled bar is given up and every hold released. */
  fundingDeadline?: number;
  paidAt?: number;
  openedAt?: number;
  endedAt?: number;
  /** Failed creation attempts since payment, for backoff and alerting. */
  createAttempts: number;
  nextAttemptAt?: number;
  lastError?: string;
  /** The host's consent when ordering in full. A split-funded sector keeps one per share instead. */
  consent?: ConsentRecord;
};

/**
 * One person's share of a split-funded sector.
 *
 * awaiting_payment -> held -> captured (the bar filled) -> refunded
 *                  \-> cancelled  \-> released (the deadline passed, or the sector was closed)
 */
export const CONTRIBUTION_STATES = ["awaiting_payment", "held", "captured", "released", "cancelled", "refunded"] as const;
export type ContributionState = (typeof CONTRIBUTION_STATES)[number];

export type ContributionRecord = {
  contributionId: string;
  sectorId: string;
  accountUid: string;
  amountCents: number;
  state: ContributionState;
  paymentRef?: string;
  checkoutUrl?: string;
  createdAt: number;
  updatedAt: number;
  /** The contributor's consent for this share. */
  consent?: ConsentRecord;
};

/** `amountCents` changes only when a share is partly captured: it is then what was charged. */
export type ContributionPatch = { state?: ContributionState; amountCents?: number; paymentRef?: string | null; checkoutUrl?: string | null };

/** `withdrawalKey` is the sector id for a purchase in full, or the contribution id for one share. */
export type WithdrawalRecord = {
  withdrawalKey: string;
  sectorId: string;
  contributionId?: string;
  accountUid: string;
  /** The payment the refund goes back to. */
  paymentRef: string;
  paidCents: number;
  deductionCents: number;
  refundCents: number;
  requestedAt: number;
  /** Set once the payment provider has accepted the refund; until then the reconciler keeps trying. */
  refundedAt?: number;
};

export type SectorMember = { sectorId: string; accountUid: string; role: "host" | "member"; joinedAt: number };

export type SectorInvite = {
  code: string;
  sectorId: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
};

/** Fields a transition may change. `null` clears a field. */
export type SectorPatch = {
  state?: SectorState;
  fundingDeadline?: number | null;
  paymentRef?: string | null;
  checkoutUrl?: string | null;
  serverRef?: string | null;
  hostname?: string | null;
  paidAt?: number | null;
  openedAt?: number | null;
  endedAt?: number | null;
  createAttempts?: number;
  nextAttemptAt?: number | null;
  lastError?: string | null;
};

export interface HostingStore {
  /** Throws if the account already has a live sector (enforced by the database). */
  insertSector(sector: SectorRecord): void;
  getSector(sectorId: string): SectorRecord | undefined;
  /**
   * Applies `patch` only if the sector is still in one of `fromStates`.
   * Returns false when it is not, so a repeated event or a second process
   * cannot move a sector backwards or act on it twice.
   */
  transitionSector(sectorId: string, fromStates: readonly SectorState[], patch: SectorPatch, now: number): boolean;
  liveSectorForHost(hostUid: string): SectorRecord | undefined;
  listSectorsInStates(states: readonly SectorState[]): SectorRecord[];
  listSectorsForAccount(accountUid: string): SectorRecord[];
  countSectorsByState(): Record<SectorState, number>;

  /** Returns false when the account was already a member. */
  addMember(member: SectorMember): boolean;
  getMember(sectorId: string, accountUid: string): SectorMember | undefined;
  /** False when the account was not a member. */
  removeMember(sectorId: string, accountUid: string): boolean;
  countMembers(sectorId: string): number;

  insertInvite(invite: SectorInvite): void;
  getInvite(code: string): SectorInvite | undefined;
  countActiveInvites(sectorId: string, now: number): number;
  revokeInvite(code: string, now: number): boolean;

  insertContribution(contribution: ContributionRecord): void;
  getContribution(contributionId: string): ContributionRecord | undefined;
  /** Applies `patch` only if the contribution is still in one of `fromStates`; false otherwise. */
  transitionContribution(contributionId: string, fromStates: readonly ContributionState[], patch: ContributionPatch, now: number): boolean;
  listContributions(sectorId: string): ContributionRecord[];

  /**
   * Payment disputes (chargebacks), by the account that paid. While one is
   * open the account cannot buy again (Terms of Sale section 9, plan Q2).
   * Recording the same dispute twice changes nothing.
   */
  openDispute(dispute: { disputeId: string; accountUid: string; sectorId: string; openedAt: number }): boolean;
  closeDispute(disputeId: string, closedAt: number): boolean;
  hasOpenDispute(accountUid: string): boolean;

  /**
   * A consumer's withdrawal from the contract (Terms of Sale section 7): one
   * per sector, or per share of a split-funded one (`withdrawalKey`). False
   * when that purchase was already withdrawn from.
   */
  insertWithdrawal(withdrawal: WithdrawalRecord): boolean;
  getWithdrawal(withdrawalKey: string): WithdrawalRecord | undefined;
  markWithdrawalRefunded(withdrawalKey: string, at: number): boolean;
  /** Withdrawals whose refund has not been accepted yet. */
  listPendingWithdrawals(): WithdrawalRecord[];

  /** Returns false when this provider event was already recorded. */
  recordPaymentEvent(eventId: string, now: number): boolean;
  hasPaymentEvent(eventId: string): boolean;
  prunePaymentEvents(olderThan: number): number;
}
