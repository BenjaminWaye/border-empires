import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_CHANGELOG_STORAGE_KEY,
  LATEST_CLIENT_CHANGELOG,
  compareReleaseVersions,
  clientChangelogRenderSignature,
  markClientChangelogSeen,
  shouldShowClientChangelog,
  shouldRebuildClientChangelogOverlay,
  syncClientChangelogVisibility,
  unseenClientChangelogEntries
} from "./client-changelog.js";

const createState = (overrides?: {
  authSessionReady?: boolean;
  profileSetupRequired?: boolean;
  seenVersion?: string;
  open?: boolean;
}) => ({
  authSessionReady: overrides?.authSessionReady ?? true,
  profileSetupRequired: overrides?.profileSetupRequired ?? false,
  changelog: {
    open: overrides?.open ?? false,
    seenVersion: overrides?.seenVersion ?? "",
    scrollTop: 0
  }
});

describe("client changelog", () => {
  it("stores visibility against the explicit changelog release version instead of the build sha", () => {
    expect(LATEST_CLIENT_CHANGELOG.version).toMatch(/^\d{4}\.\d{2}\.\d{2}\.\d+$/);
  });

  it("shows the latest release only after the session is fully ready and the build is unseen", () => {
    const releaseVersion = LATEST_CLIENT_CHANGELOG.version;

    expect(shouldShowClientChangelog(createState(), releaseVersion)).toBe(true);
    expect(shouldShowClientChangelog(createState({ seenVersion: releaseVersion }), releaseVersion)).toBe(false);
    expect(shouldShowClientChangelog(createState({ authSessionReady: false }), releaseVersion)).toBe(false);
    expect(shouldShowClientChangelog(createState({ profileSetupRequired: true }), releaseVersion)).toBe(false);
  });

  it("persists the seen build version when the popup is dismissed", () => {
    const releaseVersion = LATEST_CLIENT_CHANGELOG.version;
    const state = createState({ open: true });
    const persistSeenVersion = vi.fn<(key: string, value: string) => void>();

    markClientChangelogSeen(state, releaseVersion, persistSeenVersion);

    expect(state.changelog.open).toBe(false);
    expect(state.changelog.seenVersion).toBe(releaseVersion);
    expect(persistSeenVersion).toHaveBeenCalledWith(CLIENT_CHANGELOG_STORAGE_KEY, releaseVersion);
  });

  it("keeps the visibility flag in sync with auth readiness and the last seen version", () => {
    const releaseVersion = LATEST_CLIENT_CHANGELOG.version;
    const unseenState = createState();
    const seenState = createState({ seenVersion: releaseVersion, open: true });

    expect(syncClientChangelogVisibility(unseenState, releaseVersion)).toBe(true);
    expect(unseenState.changelog.open).toBe(true);
    expect(syncClientChangelogVisibility(seenState, releaseVersion)).toBe(false);
    expect(seenState.changelog.open).toBe(false);
  });

  it("requires every changelog entry to explain why the release shipped and what changed", () => {
    expect(LATEST_CLIENT_CHANGELOG.version.trim().length).toBeGreaterThan(0);
    expect(LATEST_CLIENT_CHANGELOG.entries.length).toBeGreaterThan(0);
    for (const entry of LATEST_CLIENT_CHANGELOG.entries) {
      expect(entry.introducedIn.trim().length).toBeGreaterThan(0);
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.why.trim().length).toBeGreaterThan(0);
      expect(entry.changes.length).toBeGreaterThan(0);
      expect(entry.changes.every((change) => change.trim().length > 0)).toBe(true);
    }
  });

  it("compares release versions numerically instead of lexically", () => {
    expect(compareReleaseVersions("2026.04.13.2", "2026.04.13.1")).toBeGreaterThan(0);
    expect(compareReleaseVersions("2026.04.12.9", "2026.04.13.1")).toBeLessThan(0);
    expect(compareReleaseVersions("2026.04.13.2", "2026.04.13.2")).toBe(0);
  });

  it("filters the popup to only entries newer than the last seen release", () => {
    const entries = unseenClientChangelogEntries("2026.04.13.1");

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => compareReleaseVersions(entry.introducedIn, "2026.04.13.1") > 0)).toBe(true);
  });

  it("reuses the existing overlay DOM while the same release/build stays open", () => {
    const renderSignature = clientChangelogRenderSignature("2026.04.13.2", "deadbeef");

    expect(shouldRebuildClientChangelogOverlay({ innerHTML: "", dataset: {} }, renderSignature)).toBe(true);
    expect(shouldRebuildClientChangelogOverlay({ innerHTML: "<div></div>", dataset: { renderSig: renderSignature } }, renderSignature)).toBe(false);
    expect(shouldRebuildClientChangelogOverlay({ innerHTML: "<div></div>", dataset: { renderSig: "older" } }, renderSignature)).toBe(true);
  });
});
