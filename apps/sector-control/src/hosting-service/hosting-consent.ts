// The proof kept of what a buyer agreed to (docs/legal-drafts/README.md, items
// 2 and 3): both statements, ticked separately, against one version of the
// Terms of Sale. The wording stored is the shared wording the form shows.
import {
  HOSTED_SECTOR_CONSENT_EARLY_START,
  HOSTED_SECTOR_CONSENT_TERMS,
  HOSTED_SECTOR_TERMS_VERSION,
  checkHostedSectorConsent
} from "@border-empires/shared";

import type { ConsentRecord } from "../hosting-store/hosting-store.js";

export const CONSENT_REQUIRED_MESSAGE = "Tick both boxes to continue: accepting the Terms of Sale, and asking for the sector to start now.";

export const TERMS_OUTDATED_MESSAGE = "The Terms of Sale have changed since this page was opened. Reload the page, read them, and tick both boxes again.";

/**
 * The record to store, or why there is none: "missing" when a box was not
 * ticked, "outdated" when the page showed older terms or wording.
 */
export const consentRecord = (consent: unknown, now: number): { ok: true; record: ConsentRecord } | { ok: false; code: "CONSENT_REQUIRED" | "TERMS_OUTDATED"; message: string } => {
  const checked = checkHostedSectorConsent(consent);
  if (checked === "missing") return { ok: false, code: "CONSENT_REQUIRED", message: CONSENT_REQUIRED_MESSAGE };
  if (checked === "outdated") return { ok: false, code: "TERMS_OUTDATED", message: TERMS_OUTDATED_MESSAGE };
  return { ok: true, record: { at: now, termsVersion: HOSTED_SECTOR_TERMS_VERSION, text: `${HOSTED_SECTOR_CONSENT_TERMS}\n${HOSTED_SECTOR_CONSENT_EARLY_START}` } };
};
