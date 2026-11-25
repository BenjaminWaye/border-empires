// The proof kept of what a buyer agreed to (docs/legal-drafts/README.md, items
// 2 and 3): both statements, ticked separately, against one version of the
// Terms of Sale. The wording stored is the shared wording the form shows.
import {
  HOSTED_SECTOR_CONSENT_EARLY_START,
  HOSTED_SECTOR_CONSENT_TERMS,
  HOSTED_SECTOR_TERMS_VERSION,
  isHostedSectorConsent
} from "@border-empires/shared";

import type { ConsentRecord } from "../hosting-store/hosting-store.js";

export const CONSENT_REQUIRED_MESSAGE = "Tick both boxes to continue: accepting the Terms of Sale, and asking for the sector to start now.";

/** The record to store, or undefined when the consent sent is missing, incomplete or for other terms. */
export const consentRecord = (consent: unknown, now: number): ConsentRecord | undefined =>
  isHostedSectorConsent(consent)
    ? { at: now, termsVersion: HOSTED_SECTOR_TERMS_VERSION, text: `${HOSTED_SECTOR_CONSENT_TERMS}\n${HOSTED_SECTOR_CONSENT_EARLY_START}` }
    : undefined;
