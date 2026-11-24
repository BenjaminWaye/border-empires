export type HostingConfig = {
  /** Kill switch (plan section 11): false stops new orders; running sectors are unaffected. */
  salesEnabled: boolean;
  /** Owner question Q8, not yet answered. Off until it is. */
  allowGuestMembers: boolean;
  /** How long an unpaid order waits before it is checked with the payment provider and cancelled. */
  checkoutExpiryMs: number;
  /** After this long without an open sector, a paid order is refunded automatically (owner decision Q1: 24 hours). */
  refundAfterMs: number;
  /** How long an ended sector stays up to look around (owner question Q7; 3 days recommended). */
  lookAroundMs: number;
  inviteTtlMs: number;
  maxActiveInvitesPerSector: number;
  /** The owner is told when the number of running sectors first reaches each mark (owner decision Q3: no cap, alerts instead). */
  runningCountAlertMarks: readonly number[];
  /** Processed payment event ids are kept this long. */
  paymentEventRetentionMs: number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEFAULT_HOSTING_CONFIG: HostingConfig = {
  salesEnabled: false,
  allowGuestMembers: false,
  checkoutExpiryMs: 30 * MINUTE,
  refundAfterMs: 24 * HOUR,
  lookAroundMs: 3 * DAY,
  inviteTtlMs: 30 * DAY,
  maxActiveInvitesPerSector: 5,
  runningCountAlertMarks: [10, 25, 50, 100, 150, 200],
  paymentEventRetentionMs: 90 * DAY
};

/** Wait before the next creation attempt: 1, 2, 4, 8, 16, then 30 minutes. */
export const creationRetryDelayMs = (attempts: number): number => Math.min(30, 2 ** Math.max(0, attempts - 1)) * MINUTE;
