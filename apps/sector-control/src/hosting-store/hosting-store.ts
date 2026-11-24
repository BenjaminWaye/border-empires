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
 */
export const SECTOR_STATES = ["awaiting_payment", "creating", "open", "ended", "deleted", "cancelled", "refunded"] as const;
export type SectorState = (typeof SECTOR_STATES)[number];

/**
 * States in which an account's order occupies its one slot. An ended sector
 * (kept up a few days to look around) does not stop its host buying the next.
 */
export const LIVE_SECTOR_STATES: readonly SectorState[] = ["awaiting_payment", "creating", "open"];

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
  paidAt?: number;
  openedAt?: number;
  endedAt?: number;
  /** Failed creation attempts since payment, for backoff and alerting. */
  createAttempts: number;
  nextAttemptAt?: number;
  lastError?: string;
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
  countMembers(sectorId: string): number;

  insertInvite(invite: SectorInvite): void;
  getInvite(code: string): SectorInvite | undefined;
  countActiveInvites(sectorId: string, now: number): number;
  revokeInvite(code: string, now: number): boolean;

  /** Returns false when this provider event was already recorded. */
  recordPaymentEvent(eventId: string, now: number): boolean;
  prunePaymentEvents(olderThan: number): number;
}
