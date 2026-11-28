// The wording of every email the hosting service sends (plan section 15,
// step 8c), rendered with the game's branded layout. Kept apart from when and
// to whom they are sent (hosting-mailer.ts) so the text can be read and
// reviewed on its own.
//
// An order confirmation is the confirmation on a durable medium that Art. 8(7)
// of Directive 2011/83/EU asks for: it restates the purchase and the request
// made at checkout word for word, and carries the Terms of Sale as an
// attachment (Terms of Sale section 3 promises exactly this).
import { HOSTED_SECTOR_PRICE_FACTS, HOSTED_SECTOR_SHARE_PRICE_FACTS, type HostedSectorOptions } from "@border-empires/shared";

import { formatBrandedEmail } from "../../../realtime-gateway/src/email-alerts/email-branded-template.js";
import type { ConsentRecord } from "../hosting-store/hosting-store.js";

export type RenderedEmail = { subject: string; text: string; html: string };

/** "USD 20.00". */
export const formatMoney = (cents: number, currency: string): string => `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;

/** "28 Nov 2026, 14:05 UTC": one form for every reader, whatever their time zone. */
export const formatTime = (ms: number): string => {
  const date = new Date(ms);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
};

const describeSector = (sectorId: string, options: HostedSectorOptions): string =>
  `a Border Empires hosted sector, ${options.mapStyle} map, ${options.mapSize} size (sector ${sectorId})`;

/** The request made at checkout, word for word, one statement per line. */
const consentLines = (consent: ConsentRecord): string[] => [
  `At checkout on ${formatTime(consent.at)} you agreed to the Terms of Sale (version ${consent.termsVersion}), attached to this email, and made this request, word for word:`,
  ...consent.text.split("\n").map((line) => `"${line}"`)
];

const render = (appUrl: string, input: { subject: string; eyebrow: string; headline: string; body: string[]; highlight?: { label: string; value: string }; linkLabel?: string }): RenderedEmail => {
  // Rendered without an address: it is looked up when the email is sent.
  const message = formatBrandedEmail(appUrl, { to: "", ...input });
  return { subject: message.subject, text: message.text, html: message.html };
};

/** How to withdraw, as Terms of Sale section 7 has it; repeated here because the confirmation must stand on its own. */
const WITHDRAWAL_WAYS = "with the Withdraw from contract button on the sector in My sectors, or by replying to this email";
const WITHDRAWAL_IN_FULL =
  `Your right to withdraw (if you are a consumer in the EU, the EEA or the UK): you can withdraw within 14 days of payment ${WITHDRAWAL_WAYS}. ` +
  "Before your sector has opened you get the full price back. Once it has opened, one thirtieth of the price is kept for each started 24 hours it was open and the rest is refunded; the sector then closes. " +
  "The right ends once its Sector Contest has ended. The attached Terms of Sale (section 7) are what count.";
const WITHDRAWAL_SHARE =
  `Your right to withdraw (if you are a consumer in the EU, the EEA or the UK): within 14 days of the day your share is charged you can withdraw ${WITHDRAWAL_WAYS}. ` +
  "Before the sector has opened you get your whole share back. Once it has opened, one thirtieth of your share is kept for each started 24 hours it was open and the rest is refunded; you then leave the sector, which keeps running for the others. " +
  "The right ends once its Sector Contest has ended. The attached Terms of Sale (sections 6a and 7) are what count.";

export const orderConfirmationEmail = (appUrl: string, input: { sectorId: string; options: HostedSectorOptions; amountCents: number; currency: string; paidAt: number; consent: ConsentRecord }): RenderedEmail =>
  render(appUrl, {
    subject: "Your hosted sector order is confirmed",
    eyebrow: "Order confirmation",
    headline: "Thank you for your order",
    highlight: { label: "Paid", value: formatMoney(input.amountCents, input.currency) },
    body: [
      "This email confirms your purchase. Please keep it.",
      `What you bought: ${describeSector(input.sectorId, input.options)}.`,
      `Price: ${formatMoney(input.amountCents, input.currency)}, paid on ${formatTime(input.paidAt)}. ${HOSTED_SECTOR_PRICE_FACTS}`,
      ...consentLines(input.consent),
      WITHDRAWAL_IN_FULL,
      "Your sector is being created now. We will email you again when it is ready."
    ],
    linkLabel: "Open My sectors"
  });

export const shareConfirmationEmail = (appUrl: string, input: { sectorId: string; amountCents: number; currency: string; pledgedAt: number; fundingDeadline?: number; consent: ConsentRecord }): RenderedEmail =>
  render(appUrl, {
    subject: "Your share of a hosted sector is confirmed",
    eyebrow: "Order confirmation",
    headline: "Thank you for chipping in",
    highlight: { label: "Held on your card", value: formatMoney(input.amountCents, input.currency) },
    body: [
      "This email confirms your purchase. Please keep it.",
      `What you bought: a share of ${formatMoney(input.amountCents, input.currency)} towards a Border Empires hosted sector (sector ${input.sectorId}), pledged on ${formatTime(input.pledgedAt)}. ${HOSTED_SECTOR_SHARE_PRICE_FACTS}`,
      `Your card is held, not charged. It is charged only if the sector's funding bar fills${input.fundingDeadline !== undefined ? ` before ${formatTime(input.fundingDeadline)}` : " in time"}, and then possibly for less than the hold if less is still needed. If the bar does not fill, the hold is released and you pay nothing. We email you either way.`,
      ...consentLines(input.consent),
      `While your card is only held, you can cancel your share by replying to this email. ${WITHDRAWAL_SHARE}`
    ],
    linkLabel: "Open My sectors"
  });

/** Sent when a held share is charged: the price of the contract is what was charged, and the withdrawal period starts. */
export const shareChargedEmail = (appUrl: string, input: { sectorId: string; amountCents: number; currency: string; chargedAt: number; consent: ConsentRecord }): RenderedEmail =>
  render(appUrl, {
    subject: "Your share of a hosted sector has been charged",
    eyebrow: "Payment confirmation",
    headline: "The funding bar is full",
    highlight: { label: "Charged", value: formatMoney(input.amountCents, input.currency) },
    body: [
      "This email confirms your purchase. Please keep it.",
      `What you bought: a share towards a Border Empires hosted sector (sector ${input.sectorId}). The sector's funding bar filled and ${formatMoney(input.amountCents, input.currency)} was charged on ${formatTime(input.chargedAt)}. ${HOSTED_SECTOR_SHARE_PRICE_FACTS}`,
      "The sector is being created now. You can enter it from My sectors once it is open.",
      ...consentLines(input.consent),
      WITHDRAWAL_SHARE
    ],
    linkLabel: "Open My sectors"
  });

/** Sent when a hold is let go: the bar did not fill in time, or it filled without this share. */
export const shareReleasedEmail = (appUrl: string, input: { sectorId: string; amountCents: number; currency: string }): RenderedEmail =>
  render(appUrl, {
    subject: "Your hold for a hosted sector has been released",
    eyebrow: "Hosted sector",
    headline: "You pay nothing",
    body: [
      `The hold of ${formatMoney(input.amountCents, input.currency)} on your card for sector ${input.sectorId} has been released: the funding bar did not fill in time, or it filled without your share. Nothing was charged.`,
      "Banks usually take a few days to remove a released hold from your statement."
    ],
    linkLabel: "Open My sectors"
  });

export const sectorReadyEmail = (appUrl: string, input: { sectorId: string; options: HostedSectorOptions }): RenderedEmail =>
  render(appUrl, {
    subject: "Your hosted sector is ready",
    eyebrow: "Hosted sector",
    headline: "Your sector is open",
    body: [
      `Your sector is ready: ${describeSector(input.sectorId, input.options)}.`,
      "Enter it from My sectors, and invite players with a link from the same place. Only you and the players you invite can enter."
    ],
    linkLabel: "Open My sectors"
  });

export const idleWarningEmail = (appUrl: string, input: { sectorId: string; lastVisitAt: number; closesAt: number; now: number }): RenderedEmail =>
  render(appUrl, {
    subject: `Sector ${input.sectorId} closes on ${formatTime(input.closesAt)} unless someone visits`,
    eyebrow: "Hosted sector",
    headline: `Nobody has visited for ${Math.floor((input.now - input.lastVisitAt) / 86_400_000)} days`,
    highlight: { label: "Closes", value: formatTime(input.closesAt) },
    body: [
      `No human player has entered sector ${input.sectorId} since ${formatTime(input.lastVisitAt)}.`,
      `If nobody enters it before ${formatTime(input.closesAt)}, it closes and its server is deleted, with no look-around period; its results are kept. AI Houses playing on do not count as a visit (Terms of Sale, section 5).`,
      "To keep it open, enter the sector from My sectors."
    ],
    linkLabel: "Open My sectors"
  });

export const withdrawalAckEmail = (appUrl: string, input: { sectorId: string; share: boolean; currency: string; paidCents: number; deductionCents: number; refundCents: number; requestedAt: number }): RenderedEmail =>
  render(appUrl, {
    subject: "Your withdrawal is confirmed",
    eyebrow: "Withdrawal",
    headline: "We have received your withdrawal",
    highlight: { label: "Refund", value: formatMoney(input.refundCents, input.currency) },
    body: [
      `On ${formatTime(input.requestedAt)} you withdrew from ${input.share ? `your share of sector ${input.sectorId}` : `your purchase of sector ${input.sectorId}`}.`,
      `You paid ${formatMoney(input.paidCents, input.currency)}. For the days the sector was open, ${formatMoney(input.deductionCents, input.currency)} is kept. ${formatMoney(input.refundCents, input.currency)} is being refunded to the payment method you used; banks usually take 5 to 10 days to show it.`,
      input.share ? "You have left the sector. It keeps running for its other members." : "The sector is closed for all its members, and its results are kept.",
      "If anything here looks wrong, reply to this email."
    ],
    linkLabel: "Open My sectors"
  });

/**
 * A cosmetic's confirmation (Terms of Sale section 7a). It confirms the
 * request to deliver at once and the acknowledgement that the right to
 * withdraw is then lost (Directive 2011/83/EU Art. 16(m)(iii)), so the item is
 * granted only after this email has been sent (hosting-cosmetics/cosmetic-orders.ts).
 */
export const cosmeticOrderConfirmationEmail = (appUrl: string, input: { orderId: string; productName: string; contents: string; amountCents: number; currency: string; paidAt: number; consent: ConsentRecord }): RenderedEmail =>
  render(appUrl, {
    subject: `Your order is confirmed: ${input.productName}`,
    eyebrow: "Order confirmation",
    headline: "Thank you for your order",
    highlight: { label: "Paid", value: formatMoney(input.amountCents, input.currency) },
    body: [
      "This email confirms your purchase. Please keep it.",
      `What you bought: ${input.productName} (${input.contents}), a cosmetic for your Border Empires account (order ${input.orderId}). It changes only how your House looks and gives no advantage in play.`,
      `Price: ${formatMoney(input.amountCents, input.currency)}, tax included, paid on ${formatTime(input.paidAt)}. One single payment.`,
      ...consentLines(input.consent),
      "As you asked, it is added to your account now, during the 14-day withdrawal period. Because you asked for this and acknowledged it, you lose your right to withdraw once it has been added (Terms of Sale section 7a). If it is not added within 24 hours, we refund you in full.",
      "You keep it for as long as Border Empires is operated and your account exists. If you delete your account, it is deleted with it."
    ],
    linkLabel: "Open Border Empires"
  });
