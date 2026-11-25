// Helpers for the split-funding tests.
import { account, type createHostingHarness } from "../hosting-test-support.js";

export type Harness = Awaited<ReturnType<typeof createHostingHarness>>;
export const OPTIONS = { mapStyle: "continents", mapSize: "standard" } as const;

/** Opens a bar for "host" and lets each named friend join through an invite. */
export const openBar = (h: Harness, friends: string[] = []): string => {
  const opened = h.service.openFundingBar(account("host"), OPTIONS);
  if (!opened.ok) throw new Error(opened.code);
  const sectorId = opened.sector.sectorId;
  const invite = h.service.createInvite(account("host"), sectorId);
  if (!invite.ok) throw new Error(invite.code);
  for (const friend of friends) h.service.acceptInvite(account(friend), invite.invite.code);
  return sectorId;
};

/** Pledges a share and reports its hold, as Stripe's webhook would. Returns the contribution's payment ref. */
export const pledge = async (h: Harness, uid: string, sectorId: string, amountCents: number): Promise<string> => {
  const result = await h.service.contribute(account(uid), sectorId, amountCents);
  if (!result.ok) throw new Error(result.code);
  const paymentRef = result.checkoutUrl.replace("https://checkout.invalid/", "");
  const contributionId = paymentRef.replace("fake-hold-", "");
  h.payment.contributions.set(paymentRef, "held");
  await h.service.handlePaymentEvent({ eventId: `evt-held-${contributionId}`, kind: "held", contributionId });
  return paymentRef;
};

export const funding = (h: Harness, uid: string, sectorId: string) => {
  const viewed = h.service.getSector(account(uid), sectorId);
  return viewed.ok ? viewed.sector.funding : undefined;
};

