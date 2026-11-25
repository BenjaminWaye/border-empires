// In-memory stand-ins for Stripe and Hetzner, for tests and local development.
// They take no money and create no servers.
import type { CheckoutStatus, ContributionStatus, PaymentProvider, ServerProvider } from "./providers.js";

export class FakePaymentProvider implements PaymentProvider {
  readonly statuses = new Map<string, CheckoutStatus>();
  readonly refunded: string[] = [];
  failRefunds = false;

  async createCheckout(input: { sectorId: string }): Promise<{ paymentRef: string; checkoutUrl: string }> {
    const paymentRef = `fake-pay-${input.sectorId}`;
    if (!this.statuses.has(paymentRef)) this.statuses.set(paymentRef, "open");
    return { paymentRef, checkoutUrl: `https://checkout.invalid/${paymentRef}` };
  }

  async getCheckoutStatus(paymentRef: string): Promise<CheckoutStatus> {
    return this.statuses.get(paymentRef) ?? "expired";
  }

  async refund(paymentRef: string): Promise<void> {
    if (this.failRefunds) throw new Error("fake refund failure");
    if (!this.refunded.includes(paymentRef)) this.refunded.push(paymentRef);
  }

  /** Contribution checkouts: "open" until a test sets "held" or "expired"; capture and release update it. */
  readonly contributions = new Map<string, ContributionStatus>();
  readonly captured: string[] = [];
  readonly released: string[] = [];
  /** Cents taken by each capture. */
  readonly capturedAmounts = new Map<string, number>();
  /** Payment refs whose capture fails without taking anything. */
  readonly failCaptures = new Set<string>();
  /** Payment refs whose capture takes the money but whose answer is lost (a timeout). */
  readonly loseCaptureAnswers = new Set<string>();
  /** Payment refs whose status cannot be read. */
  readonly failStatus = new Set<string>();

  async createContributionCheckout(input: { contributionId: string }): Promise<{ paymentRef: string; checkoutUrl: string }> {
    const paymentRef = `fake-hold-${input.contributionId}`;
    if (!this.contributions.has(paymentRef)) this.contributions.set(paymentRef, "open");
    return { paymentRef, checkoutUrl: `https://checkout.invalid/${paymentRef}` };
  }

  async getContributionStatus(paymentRef: string): Promise<ContributionStatus> {
    if (this.failStatus.has(paymentRef)) throw new Error("fake status failure");
    return this.contributions.get(paymentRef) ?? "expired";
  }

  async capture(paymentRef: string, amountCents: number): Promise<void> {
    if (this.failCaptures.has(paymentRef)) throw new Error("fake capture failure");
    if (!this.captured.includes(paymentRef)) this.captured.push(paymentRef);
    this.capturedAmounts.set(paymentRef, amountCents);
    this.contributions.set(paymentRef, "captured");
    if (this.loseCaptureAnswers.has(paymentRef)) throw new Error("fake capture timeout");
  }

  async release(paymentRef: string): Promise<void> {
    // As with Stripe, taken money cannot be released, only refunded.
    if (this.contributions.get(paymentRef) === "captured") throw new Error("fake release of captured money");
    if (!this.released.includes(paymentRef)) this.released.push(paymentRef);
    if (this.contributions.get(paymentRef) === "held") this.contributions.set(paymentRef, "released");
  }
}

export class FakeServerProvider implements ServerProvider {
  /** serverRef -> hostname, for every server that exists. */
  readonly servers = new Map<string, string>();
  readonly healthy = new Set<string>();
  readonly ended = new Set<string>();
  readonly lastHumanVisitAt = new Map<string, number>();
  createCalls = 0;
  failCreates = false;
  failDeletes = false;
  failStatus = false;
  /** Runs inside createServer, after the server exists: lets a test change the world mid-request. */
  duringCreate: (() => Promise<void>) | undefined;

  async createServer(input: { sectorId: string }): Promise<{ serverRef: string; hostname: string }> {
    this.createCalls += 1;
    if (this.failCreates) throw new Error("fake capacity error");
    const serverRef = `fake-server-${input.sectorId}`;
    const hostname = `${input.sectorId}.sectors.invalid`;
    this.servers.set(serverRef, hostname);
    await this.duringCreate?.();
    return { serverRef, hostname };
  }

  async isHealthy(hostname: string): Promise<boolean> {
    return this.healthy.has(hostname);
  }

  async getContestStatus(hostname: string): Promise<{ ended: boolean; lastHumanVisitAt?: number }> {
    if (this.failStatus) throw new Error("fake server unreachable");
    const lastHumanVisitAt = this.lastHumanVisitAt.get(hostname);
    return { ended: this.ended.has(hostname), ...(lastHumanVisitAt !== undefined ? { lastHumanVisitAt } : {}) };
  }

  async deleteServer(serverRef: string): Promise<void> {
    if (this.failDeletes) throw new Error("fake delete failure");
    this.servers.delete(serverRef);
  }
}
