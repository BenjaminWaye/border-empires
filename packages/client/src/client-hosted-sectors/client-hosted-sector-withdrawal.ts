// Withdrawing from a hosted-sector purchase (Terms of Sale section 7): a
// clearly labelled button, a confirmation step with the amounts, and an
// acknowledgement. The hosting service computes the amounts and does the
// refund; this module only draws the two steps.
import type { HostedWithdrawalQuote } from "./client-hosted-sectors-api.js";
import { usd } from "./client-hosted-sector-funding.js";

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The wording the Terms of Sale and the review ask for (ai-review-2026-11-28 section 7, item 3). */
export const WITHDRAW_BUTTON_LABEL = "Withdraw from contract here";

export const withdrawButtonHtml = (sectorId: string): string =>
  `<button type="button" class="panel-btn" data-hosted-sector-withdraw="${escapeHtml(sectorId)}">${WITHDRAW_BUTTON_LABEL}</button>`;

/** The confirmation step. Nothing has happened yet. */
export const withdrawalConfirmHtml = (sectorId: string, quote: HostedWithdrawalQuote): string => {
  const id = escapeHtml(sectorId);
  const days = quote.daysOpen === 1 ? "1 day" : `${quote.daysOpen} days`;
  const deduction = quote.deductionCents > 0
    ? `We keep ${usd(quote.deductionCents)} for the ${days} it has been open (one thirtieth of what you paid per started day).`
    : "It has not opened yet, so nothing is kept.";
  return `
    <div class="hosted-sector-withdrawal" data-hosted-sector-withdrawal="${id}">
      <h3>Withdraw from contract</h3>
      <p>You paid ${usd(quote.paidCents)}. ${deduction} You get back <strong>${usd(quote.refundCents)}</strong> to the card you paid with, within 14 days.</p>
      <p>Your purchase ends now: if you paid for the whole sector and it is still running, it closes for every member once its results are saved; if you paid a share, the sector keeps running for the others.</p>
      <div class="hosted-sector-form-actions">
        <button type="button" class="panel-btn" data-hosted-sector-withdraw-cancel>Keep my purchase</button>
        <button type="button" class="panel-btn" data-hosted-sector-withdraw-confirm="${id}" data-hosted-sector-purchase="${escapeHtml(quote.purchaseKey)}">Confirm withdrawal</button>
      </div>
      <p class="hosted-sector-error" data-hosted-sector-withdrawal-error role="alert" hidden></p>
    </div>`;
};

/** Shown after the withdrawal is recorded. The emailed copy follows (plan 8c). */
export const withdrawalReceivedNotice = (refundCents: number, at: number, refundPending: boolean): string =>
  `We received your withdrawal on ${new Date(at).toISOString().slice(0, 16).replace("T", " ")} UTC. ` +
  (refundPending
    ? `${usd(refundCents)} will be refunded to your card within 14 days; the refund could not be sent yet and is retried automatically.`
    : `${usd(refundCents)} has been sent back to your card.`);
