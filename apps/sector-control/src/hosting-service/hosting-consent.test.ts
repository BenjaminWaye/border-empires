// Nothing is sold without the two consents the Terms of Sale rely on, and what
// was agreed is kept with the order (docs/legal-drafts/README.md, items 2–3).
import { HOSTED_SECTOR_CONSENT_EARLY_START, HOSTED_SECTOR_CONSENT_TERMS, HOSTED_SECTOR_CONSENT_WORDING, HOSTED_SECTOR_TERMS_VERSION } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { account, CONSENT, createHostingHarness } from "../hosting-test-support.js";
import { openBar } from "./funding-test-support.js";

const STANDARD = { mapStyle: "continents", mapSize: "standard" } as const;
const NOT_ENOUGH = [
  undefined,
  { termsVersion: HOSTED_SECTOR_TERMS_VERSION, wording: HOSTED_SECTOR_CONSENT_WORDING, acceptedTerms: true },
  { termsVersion: HOSTED_SECTOR_TERMS_VERSION, wording: HOSTED_SECTOR_CONSENT_WORDING, requestedEarlyStart: true },
  { termsVersion: HOSTED_SECTOR_TERMS_VERSION, wording: HOSTED_SECTOR_CONSENT_WORDING, acceptedTerms: "yes", requestedEarlyStart: true }
];
/** Both boxes ticked, but on a page that showed other terms or other wording. */
const OUTDATED = [
  { termsVersion: "2020-01-01", wording: HOSTED_SECTOR_CONSENT_WORDING, acceptedTerms: true, requestedEarlyStart: true },
  { termsVersion: HOSTED_SECTOR_TERMS_VERSION, wording: "0badc0de", acceptedTerms: true, requestedEarlyStart: true },
  { termsVersion: HOSTED_SECTOR_TERMS_VERSION, acceptedTerms: true, requestedEarlyStart: true }
];

describe("consent at checkout", () => {
  it("refuses an order unless both boxes were ticked for the current terms, and starts no payment", async () => {
    const h = await createHostingHarness();
    for (const consent of NOT_ENOUGH) {
      expect(await h.service.createOrder(account("host"), STANDARD, consent)).toMatchObject({ ok: false, code: "CONSENT_REQUIRED" });
    }
    // Ticked on a page with older terms or wording: the stored proof would not match what was shown.
    for (const consent of OUTDATED) {
      expect(await h.service.createOrder(account("host"), STANDARD, consent)).toMatchObject({ ok: false, code: "TERMS_OUTDATED" });
    }
    expect(h.service.listSectors(account("host"))).toEqual([]);
  });

  it("checks the account before the consent", async () => {
    const h = await createHostingHarness();
    expect(await h.service.createOrder(account("g", { isGuest: true }), STANDARD, undefined)).toMatchObject({ ok: false, code: "ACCOUNT_REQUIRED" });
  });

  it("keeps when the host agreed, to which terms, and the exact wording", async () => {
    const h = await createHostingHarness();
    const ordered = await h.service.createOrder(account("host"), STANDARD, CONSENT);
    if (!ordered.ok) throw new Error(ordered.code);
    expect(h.store.getSector(ordered.sector.sectorId)?.consent).toEqual({
      at: h.clock.now,
      termsVersion: HOSTED_SECTOR_TERMS_VERSION,
      text: `${HOSTED_SECTOR_CONSENT_TERMS}\n${HOSTED_SECTOR_CONSENT_EARLY_START}`
    });
    // The statement about losing the right to withdraw is part of what is kept.
    expect(h.store.getSector(ordered.sector.sectorId)?.consent?.text).toMatch(/lose the right to withdraw once its Sector Contest has ended/);
  });

  it("asks each person chipping in for the same consent, and keeps it with their share", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    for (const consent of NOT_ENOUGH) {
      expect(await h.service.contribute(account("friend"), sectorId, 500, consent)).toMatchObject({ ok: false, code: "CONSENT_REQUIRED" });
    }
    for (const consent of OUTDATED) {
      expect(await h.service.contribute(account("friend"), sectorId, 500, consent)).toMatchObject({ ok: false, code: "TERMS_OUTDATED" });
    }
    expect(h.store.listContributions(sectorId)).toEqual([]);
    expect(await h.service.contribute(account("friend"), sectorId, 500, CONSENT)).toMatchObject({ ok: true });
    expect(h.store.listContributions(sectorId)[0]?.consent).toMatchObject({ at: h.clock.now, termsVersion: HOSTED_SECTOR_TERMS_VERSION });
  });
});
