// The two outside systems the hosting service depends on, as interfaces, so
// the order logic can be built and tested without money or servers. The real
// implementations (Stripe, Hetzner) arrive in later PRs; see
// docs/hosted-sectors-plan.md, section 15.
import type { HostedSectorOptions } from "@border-empires/shared";

export type CheckoutStatus = "open" | "paid" | "expired";
/** A share of a split-funded sector: the card is only held until the bar fills. */
/** "released": the hold was cancelled. "expired": the checkout closed unpaid. */
export type ContributionStatus = "open" | "held" | "captured" | "released" | "expired";

export interface PaymentProvider {
  /** Must be safe to repeat for the same sector id (one checkout per sector). */
  createCheckout(input: { sectorId: string; accountUid: string; amountCents: number; currency: string; options: HostedSectorOptions; createdAt: number }): Promise<{ paymentRef: string; checkoutUrl: string }>;
  /** Asked when a webhook may have been missed. */
  getCheckoutStatus(paymentRef: string): Promise<CheckoutStatus>;
  /**
   * Refunds the payment: all of it, or `amountCents` of it (a withdrawal keeps
   * a part for the days used). Must be safe to repeat with the same
   * `idempotencyKey`, which a partial refund must give.
   */
  refund(paymentRef: string, partial?: { amountCents: number; idempotencyKey: string }): Promise<void>;

  /**
   * Split funding (plan section 12). A checkout that only places a hold on
   * the card. Safe to repeat for the same contribution id.
   */
  createContributionCheckout(input: {
    contributionId: string; sectorId: string; accountUid: string; amountCents: number; currency: string; options: HostedSectorOptions; createdAt: number;
  }): Promise<{ paymentRef: string; checkoutUrl: string }>;
  getContributionStatus(paymentRef: string): Promise<ContributionStatus>;
  /**
   * Takes `amountCents` of the held money (at most the hold; the rest of the
   * hold is released). Safe to repeat; throws when the hold can no longer be
   * captured, or when the answer is lost, so callers ask for the status.
   */
  capture(paymentRef: string, amountCents: number): Promise<void>;
  /** Releases a hold, or closes an unpaid checkout, so nothing is charged. Safe to repeat. */
  release(paymentRef: string): Promise<void>;
}

export interface ServerProvider {
  /**
   * Requests a server for the sector. Must be safe to repeat: a second call
   * for the same sector id returns the existing server instead of a new one.
   */
  createServer(input: { sectorId: string; options: HostedSectorOptions }): Promise<{ serverRef: string; hostname: string }>;
  /** True once the sector's game server answers as healthy. */
  isHealthy(hostname: string): Promise<boolean>;
  /**
   * Whether the sector's contest has ended, and when a human last visited
   * (undefined if no human has yet). AI Houses playing do not count. The
   * game server must keep the visit time in its database: a value lost in a
   * restart would read as "never visited" and close a sector in play.
   */
  getContestStatus(hostname: string): Promise<{ ended: boolean; lastHumanVisitAt?: number }>;
  /** The sector server's public contest summary (GET /hq/summary), read before the server is deleted. */
  getContestSummary(hostname: string): Promise<unknown>;
  /** Deletes the server and its DNS record. Must be safe to repeat. */
  deleteServer(serverRef: string): Promise<void>;
}

export type HostingAlertKind =
  | "sector_creation_failing"
  | "sector_refunded_automatically"
  | "sector_refund_failed"
  | "sector_running_count"
  | "sector_closed_idle"
  | "sector_unreachable"
  | "contribution_refunded"
  | "contribution_capture_failed"
  | "sector_teardown_failed"
  | "payment_dispute"
  | "payment_dispute_closed"
  | "partial_refund"
  /** An email to a player could not be sent and was given up (hosting-email). */
  | "email_failed"
  /** A sector's results could not be read before teardown; its server is kept until they are (plan section 10). */
  | "results_export_failed"
  /** Results could not be read for RESULTS_EXPORT_GRACE_MS; the server was deleted without them. */
  | "results_export_abandoned"
  | "withdrawal"
  | "payment_for_unknown_sector";

/** Tells the owner. Must never throw. */
export type HostingAlert = (kind: HostingAlertKind, details: Record<string, string | number>) => void;
