// Nothing is sold without the two consents the Terms of Sale rely on, and what
// was agreed is kept with the order (docs/legal-drafts/README.md, items 2–3).
import { HOSTED_SECTOR_CONSENT_EARLY_START, HOSTED_SECTOR_CONSENT_TERMS, HOSTED_SECTOR_TERMS_VERSION } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { account, CONSENT, createHostingHarness } from "../hosting-test-support.js";
import { openBar } from "./funding-test-support.js";

const STANDARD = { mapStyle: "continents", mapSize: "standard" } as const;
const NOT_ENOUGH = [
  undefined,
  { termsVersion: HOSTED_SECTOR_TERMS_VERSION, acceptedTerms: true },
  { termsVersion: HOSTED_SECTOR_TERMS_VERSION, requestedEarlyStart: true },
  { termsVersion: HOSTED_SECTOR_TERMS_VERSION, acceptedTerms: "yes", requestedEarlyStart: true },
  { termsVersion: "2020-01-01", acceptedTerms: true, requestedEarlyStart: true }
];

describe("consent at checkout", () => {
  it("refuses an order unless both boxes were ticked for the current terms, and starts no payment", async () => {
    const h = await createHostingHarness();
    for (const consent of NOT_ENOUGH) {
      expect(await h.service.createOrder(account("host"), STANDARD, consent)).toMatchObject({ ok: false, code: "CONSENT_REQUIRED" });
    }
    expect(h.service.listSectors(account("host"))).toEqual([]);
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
    expect(h.store.listContributions(sectorId)).toEqual([]);
    expect(await h.service.contribute(account("friend"), sectorId, 500, CONSENT)).toMatchObject({ ok: true });
    expect(h.store.listContributions(sectorId)[0]?.consent).toMatchObject({ at: h.clock.now, termsVersion: HOSTED_SECTOR_TERMS_VERSION });
  });
});
