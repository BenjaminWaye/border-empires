import type { ClientState, storageSet } from "./client-state.js";

export const CLIENT_CHANGELOG_STORAGE_KEY = "border-empires-client-changelog-seen-v1";

export type ClientChangelogEntry = {
  title: string;
  why: string;
  changes: string[];
};

export type ClientChangelogRelease = {
  version: string;
  title: string;
  summary: string;
  entries: ClientChangelogEntry[];
};

// Update this object for every user-facing client release.
export const LATEST_CLIENT_CHANGELOG: ClientChangelogRelease = {
  version: "2026.04.12.2",
  title: "What's New",
  summary: "Recent updates now explain why they shipped, and fortified border fights now rely more on proper siege support.",
  entries: [
    {
      title: "Forts now demand real siege support",
      why: "Fortified border tiles were still too easy to brute-force, so forts now anchor territory more reliably unless the attacker stages from an outpost.",
      changes: [
        "Raised fort and wooden fort defensive strength so fortified tiles hold much more consistently.",
        "Buffed siege outposts, kept light outposts weaker than wooden forts, and heavily penalized attacks into fortified tiles that do not originate from an active outpost."
      ]
    },
    {
      title: "Versioned release notes now appear after login",
      why: "Players could miss important changes between sessions, so each release now gets an in-game summary the next time that build loads.",
      changes: [
        "Added a changelog popup that opens after authentication when the current client build has not been seen on this device yet.",
        "Stored the latest seen changelog version in local storage so the popup stays hidden until a newer release is deployed."
      ]
    },
    {
      title: "Release note updates now have a dedicated source file",
      why: "Keeping release copy in one client module makes it much harder to ship UI changes without updating the player-facing summary.",
      changes: [
        "Centralized release note content in a dedicated changelog module used by the popup renderer.",
        "Added test coverage and README guidance so future updates keep the changelog current."
      ]
    }
  ]
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const shouldShowClientChangelog = (
  state: Pick<ClientState, "authSessionReady" | "profileSetupRequired" | "changelog">,
  releaseVersion: string = LATEST_CLIENT_CHANGELOG.version
): boolean => state.authSessionReady && !state.profileSetupRequired && state.changelog.seenVersion !== releaseVersion;

export const syncClientChangelogVisibility = (
  state: Pick<ClientState, "authSessionReady" | "profileSetupRequired" | "changelog">,
  releaseVersion: string = LATEST_CLIENT_CHANGELOG.version
): boolean => {
  state.changelog.open = shouldShowClientChangelog(state, releaseVersion);
  return state.changelog.open;
};

export const markClientChangelogSeen = (
  state: Pick<ClientState, "changelog">,
  releaseVersion: string = LATEST_CLIENT_CHANGELOG.version,
  persistSeenVersion: typeof storageSet
): void => {
  state.changelog.open = false;
  state.changelog.seenVersion = releaseVersion;
  persistSeenVersion(CLIENT_CHANGELOG_STORAGE_KEY, releaseVersion);
};

const changelogBodyHtml = (): string =>
  LATEST_CLIENT_CHANGELOG.entries
    .map(
      (entry) => `
        <article class="changelog-entry">
          <h3 class="changelog-entry-title">${escapeHtml(entry.title)}</h3>
          <div class="changelog-section">
            <span class="changelog-section-label">Why</span>
            <p class="changelog-section-copy">${escapeHtml(entry.why)}</p>
          </div>
          <div class="changelog-section">
            <span class="changelog-section-label">Changed</span>
            <ul class="changelog-list">
              ${entry.changes.map((change) => `<li>${escapeHtml(change)}</li>`).join("")}
            </ul>
          </div>
        </article>
      `
    )
    .join("");

export const renderClientChangelogOverlay = (deps: {
  state: Pick<ClientState, "authSessionReady" | "profileSetupRequired" | "changelog">;
  changelogOverlayEl: HTMLDivElement;
  buildVersion: string;
  persistSeenVersion: typeof storageSet;
  renderHud: () => void;
}): void => {
  const releaseVersion = LATEST_CLIENT_CHANGELOG.version;
  const isOpen = syncClientChangelogVisibility(deps.state, releaseVersion);
  deps.changelogOverlayEl.style.display = isOpen ? "grid" : "none";
  if (!isOpen) {
    if (deps.changelogOverlayEl.innerHTML) deps.changelogOverlayEl.innerHTML = "";
    return;
  }

  deps.changelogOverlayEl.innerHTML = `
    <div class="changelog-backdrop" id="changelog-backdrop"></div>
    <div class="changelog-modal card" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
      <div class="changelog-modal-scroll">
        <div class="changelog-kicker">Release ${escapeHtml(releaseVersion)} • Build ${escapeHtml(deps.buildVersion)}</div>
        <h2 id="changelog-title" class="changelog-title">${escapeHtml(LATEST_CLIENT_CHANGELOG.title)}</h2>
        <p class="changelog-summary">${escapeHtml(LATEST_CLIENT_CHANGELOG.summary)}</p>
        <div class="changelog-entry-list">
          ${changelogBodyHtml()}
        </div>
        <div class="changelog-actions">
          <button id="changelog-close" class="panel-btn changelog-primary-btn" type="button">Continue</button>
        </div>
      </div>
    </div>
  `;

  const close = (): void => {
    markClientChangelogSeen(deps.state, releaseVersion, deps.persistSeenVersion);
    deps.renderHud();
  };

  const closeBtn = deps.changelogOverlayEl.querySelector("#changelog-close") as HTMLButtonElement | null;
  const backdropBtn = deps.changelogOverlayEl.querySelector("#changelog-backdrop") as HTMLDivElement | null;
  if (closeBtn) closeBtn.onclick = close;
  if (backdropBtn) backdropBtn.onclick = close;
};
