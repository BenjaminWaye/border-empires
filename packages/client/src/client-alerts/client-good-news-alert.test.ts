import { describe, expect, it } from "vitest";

import { pushFeed, showCaptureAlert } from "./client-alerts.js";
import { battleOutcomeFromState } from "../client-hud-v2/client-hud-v2-battle-runtime.js";
import type { ClientState } from "../client-state/client-state.js";
import type { FeedEntry } from "../client-types.js";

// Owner call 2026-11-27: good news never takes the alert card. It is kept off-card (goodNewsAlert) so it can
// neither wipe a warning that is showing nor be overwritten before the battle screen reads a fight's win.
type State = { feed: FeedEntry[] } & Pick<ClientState, "captureAlert" | "goodNewsAlert">;
const fresh = (): State => ({ feed: [], captureAlert: undefined, goodNewsAlert: undefined });
const none = { alert: undefined, goodNews: undefined };

describe("good news stays off the alert card", () => {
  it("records a win off-card and leaves a warning that is showing in place", () => {
    const state = fresh();
    showCaptureAlert(state, "Insufficient coin", "Needs 50 coin.", "warn");
    showCaptureAlert(state, "Victory", "Tundra (4, 5) taken.", "success", 0, { x: 4, y: 5 });
    expect(state.captureAlert).toMatchObject({ title: "Insufficient coin", tone: "warn" });
    expect(state.goodNewsAlert).toMatchObject({ title: "Victory", tone: "success", focusX: 4, focusY: 5 });
  });

  it("never mirrors an info or success feed line onto the card", () => {
    const state = fresh();
    pushFeed(state, "March sent.", "combat", "info");
    pushFeed(state, "Alliance formed.", "alliance", "success");
    expect(state.captureAlert).toBeUndefined();
  });
});

describe("battle outcome with the win off-card", () => {
  it("keeps the win when a feed warning lands before the fight settles", () => {
    const state = fresh();
    showCaptureAlert(state, "Victory", "Taken.", "success", 0, { x: 4, y: 5 });
    pushFeed(state, "Not enough coin.", "combat", "warn");
    expect(state.captureAlert?.tone).toBe("warn");
    expect(battleOutcomeFromState(state, none, { x: 4, y: 5 }, Date.now())).toMatchObject({ won: true, headline: "Victory" });
  });

  it("keeps the win when a hostile-flag warning about another tile lands after it", () => {
    const state = fresh();
    showCaptureAlert(state, "Victory", "Taken.", "success", 0, { x: 4, y: 5 });
    showCaptureAlert(state, "Enemy flag", "Near your border.", "warn", undefined, { x: 9, y: 9 });
    expect(battleOutcomeFromState(state, none, { x: 4, y: 5 }, Date.now())).toMatchObject({ won: true });
  });

  it("reports this tile's loss even after a win elsewhere", () => {
    const state = fresh();
    showCaptureAlert(state, "Victory", "Other tile.", "success", 0, { x: 9, y: 9 });
    showCaptureAlert(state, "Attack failed", "Held.", "warn", 30, { x: 4, y: 5 });
    expect(battleOutcomeFromState(state, none, { x: 4, y: 5 }, Date.now())).toMatchObject({ won: false, headline: "Attack failed" });
  });

  it("ignores a win recorded before the fight went live", () => {
    const state = fresh();
    showCaptureAlert(state, "Victory", "Earlier.", "success", 0, { x: 4, y: 5 });
    expect(battleOutcomeFromState(state, { alert: undefined, goodNews: state.goodNewsAlert }, { x: 4, y: 5 }, Date.now())).toBeUndefined();
  });
});
