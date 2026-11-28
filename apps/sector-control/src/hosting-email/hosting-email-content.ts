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
      "Your right to withdraw: for 14 days from payment you can withdraw with the Withdraw from contract button on your sector in My sectors, or by replying to this email. You then get back the price less a proportionate part for the days your sector was open, and the sector closes. The right ends once its Sector Contest has ended (Terms of Sale, section 7).",
      "Your sector is being created now. We will email you again when it is ready."
    ],
    linkLabel: "Open My sectors"
  });

export const shareConfirmationEmail = (appUrl: string, input: { sectorId: string; amountCents: number; currency: string; pledgedAt: number; charged: boolean; fundingDeadline?: number; consent: ConsentRecord }): RenderedEmail =>
  render(appUrl, {
    subject: "Your share of a hosted sector is confirmed",
    eyebrow: "Order confirmation",
    headline: "Thank you for chipping in",
    highlight: { label: "Your share", value: formatMoney(input.amountCents, input.currency) },
    body: [
      "This email confirms your purchase. Please keep it.",
      `What you bought: a share of ${formatMoney(input.amountCents, input.currency)} towards a Border Empires hosted sector (sector ${input.sectorId}), pledged on ${formatTime(input.pledgedAt)}. ${HOSTED_SECTOR_SHARE_PRICE_FACTS}`,
      input.charged
        ? "The sector's funding bar has filled and your share has been charged."
        : input.fundingDeadline !== undefined
        ? `Your card is held, not charged. It is charged only if the sector's funding bar fills before ${formatTime(input.fundingDeadline)}; if it does not, the hold is released and you pay nothing.`
        : "Your card is held, not charged. It is charged only if the sector's funding bar fills in time; if it does not, the hold is released and you pay nothing.",
      ...consentLines(input.consent),
      "Your right to withdraw: while your card is only held, you can cancel your share by replying to this email. Once it is charged, you can withdraw for 14 days with the Withdraw from contract button on the sector in My sectors, or by replying to this email. You then get back your share less a proportionate part for the days the sector was open, and you leave the sector, which keeps running for the others. The right ends once its Sector Contest has ended (Terms of Sale, sections 6a and 7)."
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
      `If nobody enters it before ${formatTime(input.closesAt)}, it closes and its server is deleted, with no look-around period. Its results are kept. AI Houses playing on do not count as a visit (Terms of Sale, section 5).`,
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
      `You paid ${formatMoney(input.paidCents, input.currency)}. For the days the sector was open, ${formatMoney(input.deductionCents, input.currency)} is kept. ${formatMoney(input.refundCents, input.currency)} is refunded to the card you paid with; banks usually take 5 to 10 days to show it.`,
      input.share ? "You have left the sector. It keeps running for its other members." : "The sector is closed for all its members, and its results are kept.",
      "If anything here looks wrong, reply to this email."
    ],
    linkLabel: "Open My sectors"
  });
