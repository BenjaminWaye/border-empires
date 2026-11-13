import { describe, expect, it } from "vitest";

import { pushFeed, pushFeedEntry, showCaptureAlert } from "./client-alerts.js";
import { FEED_SURFACE_DEDUPE_MS, FEED_SURFACE_MAX_AGE_MS, surfaceFeedEntryAsAlert } from "./client-feed-alert-surface.js";
import { seedFeedFromEventLog } from "../client-event-log-html.js";
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
    expect(state.captureAlert).toMatchObject({ title: "Combat", detail: "Worldbreaker Shot needs 1,000 coin.", tone: "warn" });
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

  it("carries an entry's own title and focus target", () => {
    const state = freshState();
    pushFeedEntry(state, { title: "Flag lost", text: "Flag overrun.", type: "combat", severity: "warn", at: Date.now(), focusX: 4, focusY: 9 });
    expect(state.captureAlert).toMatchObject({ title: "Flag lost", focusX: 4, focusY: 9, actionLabel: "Center" });
  });

  it("does not overwrite an alert the call site just raised itself", () => {
    const state = freshState();
    showCaptureAlert(state, "Attack blocked", "Muster flags full.", "warn");
    pushFeed(state, "Muster flags full.", "combat", "warn");
    expect(state.captureAlert?.title).toBe("Attack blocked");
  });

  it("replaces an older alert once the dedupe window has passed", () => {
    const state = freshState();
    const now = 1_000_000;
    state.captureAlert = { title: "Old", detail: "old", tone: "warn", shownAt: now - FEED_SURFACE_DEDUPE_MS - 1, until: now + 5_000 };
    surfaceFeedEntryAsAlert(state, { text: "new", type: "alliance", severity: "warn", at: now }, now);
    expect(state.captureAlert).toMatchObject({ title: "Diplomacy", detail: "new" });
  });

  it("does not replay login-backfilled event-log history as a fresh alert", () => {
    const state = freshState();
    const now = Date.now();
    seedFeedFromEventLog(state, [{ id: "e1", type: "TOWN_LOST", text: "Town Aetherwick was lost.", occurredAt: now - 3_600_000 }], now);
    expect(state.feed[0]?.severity).toBe("error");
    expect(state.captureAlert).toBeUndefined();
  });

  it("still surfaces a live event that is only slightly behind the client clock", () => {
    const state = freshState();
    const now = 2_000_000;
    surfaceFeedEntryAsAlert(state, { text: "Town lost.", type: "combat", severity: "error", at: now - FEED_SURFACE_MAX_AGE_MS + 1 }, now);
    expect(state.captureAlert?.tone).toBe("error");
  });
});
