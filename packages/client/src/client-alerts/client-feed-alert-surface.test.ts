import { describe, expect, it } from "vitest";

import { pushFeed, pushFeedEntry, showCaptureAlert, showCaptureTimeoutAlert } from "./client-alerts.js";
import { surfaceFeedEntryAsAlert } from "./client-feed-alert-surface.js";
import { seedFeedFromEventLog } from "../client-event-log-html.js";
import { battleOutcomeFromAlert } from "../client-hud-v2/client-hud-v2-battle-runtime.js";
import type { ClientState } from "../client-state/client-state.js";
import type { FeedEntry } from "../client-types.js";

// The Alerts feed panel is admin-only (#2392). Before this, warn/error
// rejections written via pushFeed (crystal abilities, domain picks, muster
// gates, profile errors...) never reached a normal player at all.
const freshState = (): { feed: FeedEntry[] } & Pick<ClientState, "captureAlert"> => ({ feed: [], captureAlert: undefined });

describe("feed warn/error entries surface on the alert card", () => {
  it("shows a warn written only to the feed", () => {
    const state = freshState();
    pushFeed(state, "Worldbreaker Shot needs 1,000 coin.", "combat", "warn");
    expect(state.feed[0]?.text).toBe("Worldbreaker Shot needs 1,000 coin.");
    expect(state.captureAlert).toMatchObject({ title: "Combat", detail: "Worldbreaker Shot needs 1,000 coin.", tone: "warn", fromFeed: true });
  });

  it("shows an error with the error tone", () => {
    const state = freshState();
    pushFeed(state, "Cannot choose a domain while disconnected.", "tech", "error");
    expect(state.captureAlert).toMatchObject({ title: "Research", tone: "error" });
  });

  it("keeps info and success entries feed-only", () => {
    const state = freshState();
    pushFeed(state, "Waypoint at (1, 2) cancelled.", "info", "info");
    pushFeed(state, "Display name updated.", "info", "success");
    expect(state.feed).toHaveLength(2);
    expect(state.captureAlert).toBeUndefined();
  });

  it("keeps feedOnly background notices (incoming attacks, muster combat) off the card", () => {
    const state = freshState();
    pushFeedEntry(state, { text: "Under attack: Rival is striking (3, 4).", type: "combat", severity: "error", at: Date.now(), feedOnly: true });
    expect(state.feed).toHaveLength(1);
    expect(state.captureAlert).toBeUndefined();
  });

  it("carries an entry's own title and focus target", () => {
    const state = freshState();
    pushFeedEntry(state, { title: "Flag lost", text: "Flag overrun.", type: "combat", severity: "warn", at: Date.now(), focusX: 4, focusY: 9 });
    expect(state.captureAlert).toMatchObject({ title: "Flag lost", focusX: 4, focusY: 9, actionLabel: "Center" });
  });

  it("never replaces an explicit alert that is still showing", () => {
    const state = freshState();
    showCaptureAlert(state, "Town lost", "Aetherwick fell.", "error");
    pushFeed(state, "Waypoint cancelled at (1, 2).", "info", "warn");
    expect(state.captureAlert).toMatchObject({ title: "Town lost", tone: "error" });
  });

  it("keeps a timeout alert's Report bug button", () => {
    const state = freshState();
    showCaptureTimeoutAlert(state, "No server response", "Try again.");
    pushFeed(state, "Siphon requires Transposition Array Module.", "combat", "warn");
    expect(state.captureAlert?.timeout).toBe(true);
  });

  it("replaces an explicit alert once it has expired", () => {
    const state = freshState();
    const now = 1_000_000;
    state.captureAlert = { title: "Old", detail: "old", tone: "success", until: now - 1 };
    surfaceFeedEntryAsAlert(state, { text: "new", type: "alliance", severity: "warn", at: now }, now);
    expect(state.captureAlert).toMatchObject({ title: "Diplomacy", detail: "new" });
  });

  it("lets the latest mirrored rejection replace an earlier mirrored one", () => {
    const state = freshState();
    pushFeed(state, "Aether EMP cooling down for 2m.", "combat", "warn");
    pushFeed(state, "Select your Sky Dock first.", "combat", "warn");
    expect(state.captureAlert?.detail).toBe("Select your Sky Dock first.");
  });

  it("does not replay server event-log history (login backfill) as alerts", () => {
    const state = freshState();
    const now = Date.now();
    seedFeedFromEventLog(state, [{ id: "e1", type: "TOWN_LOST", text: "Town Aetherwick was lost.", occurredAt: now - 1_000 }], now);
    expect(state.feed[0]?.severity).toBe("error");
    expect(state.captureAlert).toBeUndefined();
  });

  it("is never read by the battle screen as a fight's outcome", () => {
    const state = freshState();
    pushFeed(state, "Capture blocked.", "combat", "warn");
    expect(battleOutcomeFromAlert(state.captureAlert, undefined, Date.now())).toBeUndefined();
  });
});
