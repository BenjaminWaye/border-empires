// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { LANDING_WAIT_DELAY_MS, LANDING_WAIT_TEXT, resetLandingWaitForTests, syncLandingWaitNotice } from "./client-landing-wait.js";

// A House knocked out on a full map waits for a landing site; its player used
// to see an empty map with no word of why (owner decision 2026-11-27 follow-up).
const landless = { me: "p1", authSessionReady: true, needsSeasonJoin: false, seasonPending: false, hasOwnedTileInCache: false };
const notice = () => document.getElementById("landing-wait-notice");

afterEach(() => {
  resetLandingWaitForTests();
  notice()?.remove();
});

describe("landing wait notice", () => {
  it("appears once the player has had no land for the delay, and goes when the House lands", () => {
    syncLandingWaitNotice(landless, 1_000);
    expect(notice()).toBeNull();
    syncLandingWaitNotice(landless, 1_000 + LANDING_WAIT_DELAY_MS);
    expect(notice()?.textContent).toBe(LANDING_WAIT_TEXT);
    syncLandingWaitNotice({ ...landless, hasOwnedTileInCache: true }, 2_000 + LANDING_WAIT_DELAY_MS);
    expect(notice()).toBeNull();
  });

  it("is not shown before joining, during the countdown, after the contest is won, or before sign-in", () => {
    for (const state of [
      { ...landless, needsSeasonJoin: true },
      { ...landless, seasonPending: true },
      { ...landless, seasonWinner: { playerId: "x" } },
      { ...landless, authSessionReady: false },
      { ...landless, me: "" }
    ]) {
      resetLandingWaitForTests();
      syncLandingWaitNotice(state, 0);
      syncLandingWaitNotice(state, LANDING_WAIT_DELAY_MS * 2);
      expect(notice()).toBeNull();
    }
  });

  it("restarts the delay after the player held land again", () => {
    syncLandingWaitNotice(landless, 0);
    syncLandingWaitNotice({ ...landless, hasOwnedTileInCache: true }, 10_000);
    syncLandingWaitNotice(landless, 12_000);
    syncLandingWaitNotice(landless, 12_000 + LANDING_WAIT_DELAY_MS - 1);
    expect(notice()).toBeNull();
  });
});
