import { beforeEach, describe, expect, it } from "vitest";
import { markRelicSiteReached, relicSiteReached, resetRelicSitesReachedForTest } from "./relic-site-reached.js";

describe("relic sites reached", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetRelicSitesReachedForTest();
  });
  it("stops the edge tab once the site has been on screen, across reloads", () => {
    expect(relicSiteReached("rival", "440,165")).toBe(false);
    markRelicSiteReached("rival", "440,165");
    resetRelicSitesReachedForTest();
    expect(relicSiteReached("rival", "440,165")).toBe(globalThis.localStorage !== undefined);
  });
  it("shows the tab again when another House runs the site", () => {
    markRelicSiteReached("rival", "440,165");
    expect(relicSiteReached("other", "440,165")).toBe(false);
  });
});
