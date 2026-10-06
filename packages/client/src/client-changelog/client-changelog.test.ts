// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_CHANGELOG_ENTRIES,
  CLIENT_CHANGELOG_STORAGE_KEY,
  clientChangelogRenderSignature,
  latestClientChangelogTimestamp,
  markClientChangelogSeen,
  renderClientChangelogOverlay,
  shouldShowClientChangelog,
  shouldRebuildClientChangelogOverlay,
  sortedClientChangelogEntries,
  syncClientChangelogVisibility,
  unseenClientChangelogEntries
} from "./client-changelog.js";

const createState = (overrides?: {
  authSessionReady?: boolean;
  profileSetupRequired?: boolean;
  seenAt?: number;
  open?: boolean;
  guideCompleted?: boolean;
}) => ({
  guide: { completed: overrides?.guideCompleted ?? true },
  authSessionReady: overrides?.authSessionReady ?? true,
  profileSetupRequired: overrides?.profileSetupRequired ?? false,
  changelog: {
    open: overrides?.open ?? false,
    seenAt: overrides?.seenAt ?? 0,
    scrollTop: 0
  }
});

describe("client changelog", () => {
  it("has at least one entry with a valid createdAt timestamp", () => {
    expect(CLIENT_CHANGELOG_ENTRIES.length).toBeGreaterThan(0);
    for (const entry of CLIENT_CHANGELOG_ENTRIES) {
      expect(Number.isFinite(entry.createdAt)).toBe(true);
      expect(entry.createdAt).toBeGreaterThan(0);
    }
  });

  it("shows the latest entries only after the session is fully ready and unseen", () => {
    const latestAt = latestClientChangelogTimestamp();

    expect(shouldShowClientChangelog(createState(), latestAt)).toBe(true);
    expect(shouldShowClientChangelog(createState({ seenAt: latestAt }), latestAt)).toBe(false);
    expect(shouldShowClientChangelog(createState({ authSessionReady: false }), latestAt)).toBe(false);
    expect(shouldShowClientChangelog(createState({ profileSetupRequired: true }), latestAt)).toBe(false);
    // New players (tutorial not completed) never get release notes.
    expect(shouldShowClientChangelog(createState({ guideCompleted: false }), latestAt)).toBe(false);
  });

  it("persists the seen timestamp when the popup is dismissed", () => {
    const latestAt = latestClientChangelogTimestamp();
    const state = createState({ open: true });
    const persistSeenAt = vi.fn<(key: string, value: string) => void>();

    markClientChangelogSeen(state, latestAt, persistSeenAt);

    expect(state.changelog.open).toBe(false);
    expect(state.changelog.seenAt).toBe(latestAt);
    expect(persistSeenAt).toHaveBeenCalledWith(CLIENT_CHANGELOG_STORAGE_KEY, String(latestAt));
  });

  it("keeps the visibility flag in sync with auth readiness and the last seen timestamp", () => {
    const latestAt = latestClientChangelogTimestamp();
    const unseenState = createState();
    const seenState = createState({ seenAt: latestAt, open: true });

    expect(syncClientChangelogVisibility(unseenState, latestAt)).toBe(true);
    expect(unseenState.changelog.open).toBe(true);
    expect(syncClientChangelogVisibility(seenState, latestAt)).toBe(false);
    expect(seenState.changelog.open).toBe(false);
  });

  it("requires every changelog entry to explain why the release shipped and what changed", () => {
    expect(CLIENT_CHANGELOG_ENTRIES.length).toBeGreaterThan(0);
    for (const entry of CLIENT_CHANGELOG_ENTRIES) {
      expect(entry.introducedIn.trim().length).toBeGreaterThan(0);
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.why.trim().length).toBeGreaterThan(0);
      expect(entry.changes.length).toBeGreaterThan(0);
      expect(entry.changes.every((change) => change.trim().length > 0)).toBe(true);
    }
  });

  // Regression: two entries used `createdAt: Date.now()`, so the "latest"
  // timestamp tracked the page-load clock and every login looked like it had
  // unseen release notes -- What's New reopened on every login.
  it("derives the latest timestamp from frozen literals, not the clock", async () => {
    const before = latestClientChangelogTimestamp();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(before + 30 * 24 * 60 * 60 * 1000);
      vi.resetModules();
      const reloaded = await import("./client-changelog.js");
      expect(reloaded.latestClientChangelogTimestamp()).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps only the latest week of entries in the client bundle", () => {
    const latestAt = latestClientChangelogTimestamp();
    const oldestAllowedAt = latestAt - 6 * 24 * 60 * 60 * 1000;

    for (const entry of CLIENT_CHANGELOG_ENTRIES) {
      expect(entry.createdAt).toBeGreaterThanOrEqual(oldestAllowedAt);
    }
  });

  it("sorts entries newest-first regardless of source order", () => {
    const unordered = [
      { createdAt: 100, introducedIn: "a", title: "a", why: "a", changes: ["a"] },
      { createdAt: 300, introducedIn: "b", title: "b", why: "b", changes: ["b"] },
      { createdAt: 200, introducedIn: "c", title: "c", why: "c", changes: ["c"] }
    ];

    expect(sortedClientChangelogEntries(unordered).map((entry) => entry.createdAt)).toEqual([300, 200, 100]);
  });

  it("filters the popup to only entries newer than the last seen timestamp", () => {
    const latestAt = latestClientChangelogTimestamp();
    const someOlderTimestamp = latestAt - 1;
    const entries = unseenClientChangelogEntries(someOlderTimestamp);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.createdAt > someOlderTimestamp)).toBe(true);
  });

  it("reuses the existing overlay DOM while the same latest timestamp/build stays open", () => {
    const renderSignature = clientChangelogRenderSignature(1700000000000, "deadbeef");

    expect(shouldRebuildClientChangelogOverlay({ innerHTML: "", dataset: {} }, renderSignature)).toBe(true);
    expect(shouldRebuildClientChangelogOverlay({ innerHTML: "<div></div>", dataset: { renderSig: renderSignature } }, renderSignature)).toBe(false);
    expect(shouldRebuildClientChangelogOverlay({ innerHTML: "<div></div>", dataset: { renderSig: "older" } }, renderSignature)).toBe(true);
  });

  it("hides the overlay when Continue is clicked even if the follow-up renderHud() throws", () => {
    // Regression: "Continue does nothing" — renderClientChangelogOverlay used
    // to rely entirely on the caller's renderHud() re-render to flip the
    // overlay's display back to "none". renderHud() is one single huge
    // function covering the whole HUD and is wrapped in a catch-and-log at
    // the bootstrap level; if anything else in that render pass throws, the
    // overlay update never happens even though the click was otherwise
    // handled correctly (seen-timestamp persisted). The close handler must
    // now hide the overlay itself first, independent of renderHud() succeeding.
    const state = createState({ seenAt: 0 });
    const changelogOverlayEl = document.createElement("div");
    const persistSeenAt = vi.fn();
    const throwingRenderHud = vi.fn(() => {
      throw new Error("simulated unrelated HUD render failure");
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderClientChangelogOverlay({
      state: state as any,
      changelogOverlayEl: changelogOverlayEl as any,
      buildVersion: "deadbeef",
      persistSeenAt,
      renderHud: throwingRenderHud
    });

    expect(changelogOverlayEl.style.display).toBe("grid");
    const closeBtn = changelogOverlayEl.querySelector<HTMLButtonElement>("#changelog-close");
    expect(closeBtn).not.toBeNull();

    expect(() => closeBtn?.dispatchEvent(new MouseEvent("click"))).not.toThrow();

    expect(changelogOverlayEl.style.display).toBe("none");
    expect(changelogOverlayEl.innerHTML).toBe("");
    expect(persistSeenAt).toHaveBeenCalledWith(CLIENT_CHANGELOG_STORAGE_KEY, String(latestClientChangelogTimestamp()));
    expect(throwingRenderHud).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("baselines a brand-new player at the latest release instead of showing the backlog", () => {
    const state = createState({ seenAt: 0, guideCompleted: false });
    const changelogOverlayEl = document.createElement("div");
    const persistSeenAt = vi.fn();
    const args = { state: state as any, changelogOverlayEl: changelogOverlayEl as any, buildVersion: "deadbeef", persistSeenAt, renderHud: vi.fn() };

    renderClientChangelogOverlay(args);

    expect(changelogOverlayEl.style.display).toBe("none");
    expect(state.changelog.seenAt).toBe(latestClientChangelogTimestamp());
    expect(persistSeenAt).toHaveBeenCalledWith(CLIENT_CHANGELOG_STORAGE_KEY, String(latestClientChangelogTimestamp()));

    // Finishing the tutorial must not surface the backlog they were baselined past.
    state.guide.completed = true;
    renderClientChangelogOverlay(args);
    expect(changelogOverlayEl.style.display).toBe("none");
  });
});
