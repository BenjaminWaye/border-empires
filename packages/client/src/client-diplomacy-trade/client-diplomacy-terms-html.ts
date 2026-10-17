// The "Terms:" line on a pending truce/alliance offer card in the Alliances
// panel, worded from the viewer's side of the deal.
import { describeDiplomacyTermsForProposer, describeDiplomacyTermsForRecipient, type DiplomacyTerms } from "@border-empires/shared";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

/** incoming: the other player proposed it; outgoing: you did. */
export const diplomacyTermsLineHtml = (terms: DiplomacyTerms | undefined, kind: "incoming" | "outgoing", otherName: string): string => {
  const text = kind === "incoming" ? describeDiplomacyTermsForRecipient(terms, otherName) : describeDiplomacyTermsForProposer(terms, otherName);
  if (!text) return "";
  return `<div class="alliance-reference-meta alliance-reference-terms"><span class="alliance-reference-meta-label">Terms:</span> <span>${escapeHtml(text)}</span></div>`;
};
