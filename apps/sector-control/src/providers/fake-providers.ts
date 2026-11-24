// In-memory stand-ins for Stripe and Hetzner, for tests and local development.
// They take no money and create no servers.
import type { CheckoutStatus, PaymentProvider, ServerProvider } from "./providers.js";

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
}

export class FakeServerProvider implements ServerProvider {
  /** serverRef -> hostname, for every server that exists. */
  readonly servers = new Map<string, string>();
  readonly healthy = new Set<string>();
  readonly ended = new Set<string>();
  createCalls = 0;
  failCreates = false;
  failDeletes = false;

  async createServer(input: { sectorId: string }): Promise<{ serverRef: string; hostname: string }> {
    this.createCalls += 1;
    if (this.failCreates) throw new Error("fake capacity error");
    const serverRef = `fake-server-${input.sectorId}`;
    const hostname = `${input.sectorId}.sectors.invalid`;
    this.servers.set(serverRef, hostname);
    return { serverRef, hostname };
  }

  async isHealthy(hostname: string): Promise<boolean> {
    return this.healthy.has(hostname);
  }

  async contestHasEnded(hostname: string): Promise<boolean> {
    return this.ended.has(hostname);
  }

  async deleteServer(serverRef: string): Promise<void> {
    if (this.failDeletes) throw new Error("fake delete failure");
    this.servers.delete(serverRef);
  }
}
