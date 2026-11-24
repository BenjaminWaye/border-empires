// The two outside systems the hosting service depends on, as interfaces, so
// the order logic can be built and tested without money or servers. The real
// implementations (Stripe, Hetzner) arrive in later PRs; see
// docs/hosted-sectors-plan.md, section 15.
import type { HostedSectorOptions } from "@border-empires/shared";

export type CheckoutStatus = "open" | "paid" | "expired";

export interface PaymentProvider {
  /** Must be safe to repeat for the same sector id (one checkout per sector). */
  createCheckout(input: { sectorId: string; accountUid: string; amountCents: number; currency: string }): Promise<{ paymentRef: string; checkoutUrl: string }>;
  /** Asked when a webhook may have been missed. */
  getCheckoutStatus(paymentRef: string): Promise<CheckoutStatus>;
  /** Full refund. Must be safe to repeat. */
  refund(paymentRef: string): Promise<void>;
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
  | "sector_teardown_failed"
  | "payment_dispute"
  | "payment_for_unknown_sector";

/** Tells the owner. Must never throw. */
export type HostingAlert = (kind: HostingAlertKind, details: Record<string, string | number>) => void;
