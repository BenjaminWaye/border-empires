import type { ClientState, storageSet } from "./client-state.js";

export const CLIENT_CHANGELOG_STORAGE_KEY = "border-empires-client-changelog-seen-v1";
const CLIENT_CHANGELOG_SCROLL_SELECTOR = ".changelog-modal-scroll";

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
  version: "2026.04.13.1",
  title: "What's New",
  summary: "Recent updates now explain what changed after sign-in, including steadier frontier attack syncing, downloadable debug bundles for sync failures, staged shard-rain reveals, icon-based combat rewards, tougher fortified border fights, and safer server-side AI/runtime maintenance.",
  entries: [
    {
      title: "AI frontier planning was split into smaller server modules",
      why: "The live server still had large AI frontier-planning blocks inside one runtime file, which made future fixes riskier even when gameplay behavior stayed the same.",
      changes: [
        "Split AI frontier territory, scout, settlement, signal, and pressure helpers into focused server modules under the 500-line file target.",
        "Kept full server and client regression coverage green after the refactor so the live AI/runtime path stays behaviorally stable."
      ]
    },
    {
      title: "Frontier attack sync now keeps the original combat alive",
      why: "Repeated border attacks could desync after delayed server acknowledgements, which made capture timers restart, queue duplicate sends, and hid the data needed to debug player reports.",
      changes: [
        "Kept delayed attack acknowledgements bound to the original frontier action instead of re-dispatching duplicate sends after a missed 2-second acceptance window.",
        "Added downloadable debug bundles on sync failure popups so client attack logs, server health, and recent server timing traces can be shared directly for investigation.",
        "Reduced several server-side hot paths around AI scheduling, dock-crossing validation, chunk sync priority, and post-combat follow-up so frontier actions clear more predictably under load."
      ]
    },
    {
      title: "Town names now stay stable across restarts",
      why: "Some towns could come back from a restart with the wrong generated name, which made it look like the town at a tile had changed identity.",
      changes: [
        "Loaded season seed data before filling in any missing town names during snapshot hydrate.",
        "Removed an obsolete legacy town-hydrate normalization path that no longer matched live save data."
      ]
    },
    {
      title: "Under-the-hood server sync was split into safer modules",
      why: "The live server had grown into one large runtime file, which made future fixes riskier than they needed to be even when behavior stayed the same.",
      changes: [
        "Split more of the server's visibility, chunk sync, combat support, realtime sync, and player update wiring into focused modules.",
        "Kept the same gameplay behavior while adding regression coverage around frontier combat results and leaderboard/player-update payloads."
      ]
    },
    {
      title: "Changelog scrolling now stays where you left it",
      why: "The release-notes popup could jump back to the top while the HUD refreshed underneath it, which made longer updates frustrating to read.",
      changes: [
        "Stopped rebuilding the changelog modal on every HUD render while the same release is open.",
        "Preserved the popup scroll position so long changelog entries stay stable while you read them."
      ]
    },
    {
      title: "Shard rain now pings fresh drop spots",
      why: "Shard rain was easy to miss because players had to manually spot each new shardfall tile while the event timer was already ticking down.",
      changes: [
        "Added animated minimap pings for newly revealed shardfall deposits during active shard rain.",
        "Staggered shardfall reveals over the first two minutes of shard rain and let each minimap ping persist for 30 seconds before clearing."
      ]
    },
    {
      title: "Plunder rewards now use resource icons",
      why: "The attack victory popup now lists stolen resources, but reading raw resource names is slower than scanning the same icons used elsewhere in the HUD.",
      changes: [
        "Updated plundered gold in the successful attack popup to use the gold icon.",
        "Updated plundered strategic resources in the same popup to use their matching resource icons."
      ]
    },
    {
      title: "Forts now demand real siege support",
      why: "Fortified border tiles were still too easy to brute-force, so forts now anchor territory more reliably unless the attacker stages from an outpost.",
      changes: [
        "Raised fort and wooden fort defensive strength so fortified tiles hold much more consistently.",
        "Buffed siege outposts, kept light outposts weaker than wooden forts, and heavily penalized attacks into fortified tiles that do not originate from an active outpost."
      ]
    },
    {
      title: "Successful attacks now show what you plundered",
      why: "When an attack succeeded, the battle timer popup confirmed the capture but did not show the gold and resources taken from the defender.",
      changes: [
        "Added plundered gold to the successful attack popup when a settled enemy tile is captured.",
        "Added any stolen strategic resources to the same popup so attack rewards are visible immediately."
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

export const clientChangelogRenderSignature = (releaseVersion: string, buildVersion: string): string =>
  `${releaseVersion}:${buildVersion}`;

export const shouldRebuildClientChangelogOverlay = (
  overlayEl: Pick<HTMLDivElement, "innerHTML" | "dataset">,
  renderSignature: string
): boolean => overlayEl.innerHTML === "" || overlayEl.dataset.renderSig !== renderSignature;

export const renderClientChangelogOverlay = (deps: {
  state: Pick<ClientState, "authSessionReady" | "profileSetupRequired" | "changelog">;
  changelogOverlayEl: HTMLDivElement;
  buildVersion: string;
  persistSeenVersion: typeof storageSet;
  renderHud: () => void;
}): void => {
  const releaseVersion = LATEST_CLIENT_CHANGELOG.version;
  const renderSignature = clientChangelogRenderSignature(releaseVersion, deps.buildVersion);
  const isOpen = syncClientChangelogVisibility(deps.state, releaseVersion);
  deps.changelogOverlayEl.style.display = isOpen ? "grid" : "none";
  if (!isOpen) {
    if (deps.changelogOverlayEl.innerHTML) deps.changelogOverlayEl.innerHTML = "";
    delete deps.changelogOverlayEl.dataset.renderSig;
    return;
  }

  if (shouldRebuildClientChangelogOverlay(deps.changelogOverlayEl, renderSignature)) {
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
    deps.changelogOverlayEl.dataset.renderSig = renderSignature;
  }

  const scrollEl = deps.changelogOverlayEl.querySelector(CLIENT_CHANGELOG_SCROLL_SELECTOR) as HTMLDivElement | null;
  if (scrollEl) {
    if (Math.abs(scrollEl.scrollTop - deps.state.changelog.scrollTop) > 1) {
      scrollEl.scrollTop = deps.state.changelog.scrollTop;
    }
    scrollEl.onscroll = () => {
      deps.state.changelog.scrollTop = scrollEl.scrollTop;
    };
  }

  const close = (): void => {
    markClientChangelogSeen(deps.state, releaseVersion, deps.persistSeenVersion);
    deps.renderHud();
  };

  const closeBtn = deps.changelogOverlayEl.querySelector("#changelog-close") as HTMLButtonElement | null;
  const backdropBtn = deps.changelogOverlayEl.querySelector("#changelog-backdrop") as HTMLDivElement | null;
  if (closeBtn) closeBtn.onclick = close;
  if (backdropBtn) backdropBtn.onclick = close;
};
