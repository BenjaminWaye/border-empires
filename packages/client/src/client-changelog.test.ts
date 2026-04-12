import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_CHANGELOG_STORAGE_KEY,
  LATEST_CLIENT_CHANGELOG,
  markClientChangelogSeen,
  shouldShowClientChangelog,
  syncClientChangelogVisibility
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
    seenVersion: overrides?.seenVersion ?? ""
  }
});

describe("client changelog", () => {
  it("stores visibility against the explicit changelog release version instead of the build sha", () => {
    expect(LATEST_CLIENT_CHANGELOG.version).toBe("2026.04.12.2");
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
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.why.trim().length).toBeGreaterThan(0);
      expect(entry.changes.length).toBeGreaterThan(0);
      expect(entry.changes.every((change) => change.trim().length > 0)).toBe(true);
    }
  });
});
