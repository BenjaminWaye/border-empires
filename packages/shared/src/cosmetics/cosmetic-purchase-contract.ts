// What a buyer of a cosmetic product ticks before paying (Terms of Sale §7a;
// docs/legal-drafts/ai-review-2026-11-28.md section 7, item 5). Two separate
// boxes, unticked by default, shown and stored word for word. The second is
// the digital-content request and acknowledgement (Directive 2011/83/EU
// Art. 16(m)): without it, or without the confirmation email that repeats
// it, the buyer keeps the right to withdraw.
import { consentWordingFingerprint, HOSTED_SECTOR_TERMS_VERSION } from "../hosted-sector/hosted-sector-contract.js";

export const COSMETIC_CONSENT_TERMS = "I am 18 or older and I accept the Terms of Sale.";
export const COSMETIC_CONSENT_IMMEDIATE = "I ask for this item to be added to my account now, and I understand that I then lose my right to withdraw.";

/** The client sends it with the consent; the hosting service accepts only its own (see HOSTED_SECTOR_CONSENT_WORDING). */
export const COSMETIC_CONSENT_WORDING = consentWordingFingerprint(`${COSMETIC_CONSENT_TERMS}\n${COSMETIC_CONSENT_IMMEDIATE}`);

export type CosmeticPurchaseConsent = { termsVersion: string; wording: string; acceptedTerms: true; requestedImmediateDelivery: true };

/** As checkHostedSectorConsent: "outdated" means both ticked on a page loaded before the terms or wording changed. */
export const checkCosmeticConsent = (value: unknown): "ok" | "outdated" | "missing" => {
  if (typeof value !== "object" || value === null) return "missing";
  const consent = value as Record<string, unknown>;
  if (consent.acceptedTerms !== true || consent.requestedImmediateDelivery !== true) return "missing";
  return consent.termsVersion === HOSTED_SECTOR_TERMS_VERSION && consent.wording === COSMETIC_CONSENT_WORDING ? "ok" : "outdated";
};

/** The consent the client sends for the current terms and wording. */
export const currentCosmeticConsent = (): CosmeticPurchaseConsent => ({
  termsVersion: HOSTED_SECTOR_TERMS_VERSION, wording: COSMETIC_CONSENT_WORDING, acceptedTerms: true, requestedImmediateDelivery: true
});
