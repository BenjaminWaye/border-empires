// Split funding in "My sectors": the funding bar of a sector that friends pay
// for together, the Chip in form, and the host's "Pay the rest". Each share
// only holds the card; nobody is charged until the bar is full, and if it does
// not fill in time every hold is released.
import { HOSTED_SECTOR_SHARE_PRICE_FACTS } from "@border-empires/shared";

import { consentBoxesHtml } from "./client-hosted-sector-order.js";
import type { HostedSectorFunding, HostedSectorSummary } from "./client-hosted-sectors-api.js";

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export const usd = (cents: number): string => `USD ${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** "2 days", "5 hours", "under an hour". */
export const timeLeft = (deadline: number, now: number): string => {
  const hours = Math.floor((deadline - now) / 3_600_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} days`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return "under an hour";
};

/** What is still to pledge: neither held nor in someone's checkout. */
/** What is still needed. Payments in progress do not count: they may never finish, and any surplus is released. */
export const fundingLeftCents = (funding: HostedSectorFunding): number => Math.max(0, funding.targetCents - funding.pledgedCents);

export const fundingRowHtml = (sector: HostedSectorSummary, now: number): string => {
  const funding = sector.funding;
  if (sector.state !== "funding" || !funding) return "";
  const id = escapeHtml(sector.sectorId);
  const percent = Math.min(100, Math.round((funding.pledgedCents / funding.targetCents) * 100));
  const left = fundingLeftCents(funding);
  const minimum = Math.min(funding.minimumCents, left);
  const yours = funding.yourCents > 0 ? ` · Your share: ${usd(funding.yourCents)}` : "";
  const resume = funding.yourCheckoutUrl
    ? `<button type="button" class="panel-btn" data-hosted-sector-resume="${id}">Finish your payment</button>`
    : "";
  const chipIn = !funding.yourCheckoutUrl && left > 0
    ? `<label class="hosted-sector-chip-in">Chip in <span>USD</span>
         <input type="number" inputmode="decimal" min="${minimum / 100}" max="${left / 100}" step="0.01" value="${Math.min(left, Math.max(minimum, 500)) / 100}" data-hosted-sector-amount="${id}" aria-label="Amount in US dollars" />
       </label>
       <button type="button" class="panel-btn" data-hosted-sector-chip-in="${id}">Chip in</button>
       ${sector.role === "host" ? `<button type="button" class="panel-btn" data-hosted-sector-pay-rest="${id}" data-hosted-sector-rest="${left}">Pay the rest · ${usd(left)}</button>` : ""}`
    : "";
  // Each share is a purchase of its own, so it needs both consents too.
  const consent = chipIn
    ? `<div class="hosted-sector-funding-consent">${consentBoxesHtml(id)}<p class="hosted-sector-note" data-hosted-sector-share-facts>${HOSTED_SECTOR_SHARE_PRICE_FACTS}</p></div>`
    : "";
  return `
    <div class="hosted-sector-funding">
      <div class="hosted-sector-funding-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${funding.targetCents}" aria-valuenow="${funding.pledgedCents}"><span style="width:${percent}%"></span></div>
      <span class="hosted-sector-meta">${usd(funding.pledgedCents)} of ${usd(funding.targetCents)} pledged · ${escapeHtml(timeLeft(funding.deadline, now))} left${yours}</span>
      <span class="hosted-sector-note">Cards are only held. Everyone is charged when the bar is full, and the sector starts at once. If it is not full in time, nobody pays.</span>
      ${consent}
      <div class="hosted-sector-actions">${resume}${chipIn}</div>
    </div>`;
};

/** Reads a typed amount in dollars as whole cents; undefined when it is not a usable number. */
export const readChipInCents = (value: string): number | undefined => {
  const dollars = Number(value.replace(",", "."));
  if (!Number.isFinite(dollars) || dollars <= 0) return undefined;
  return Math.round(dollars * 100);
};
