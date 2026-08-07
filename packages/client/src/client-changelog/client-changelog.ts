import type { ClientState, storageSet } from "../client-state/client-state.js";
import { CLIENT_CHANGELOG_ENTRIES, type ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_STORAGE_KEY = "border-empires-client-changelog-seen-v2";
export const CLIENT_CHANGELOG_TITLE = "What's New";
const CLIENT_CHANGELOG_SCROLL_SELECTOR = ".changelog-modal-scroll";

// Release entry data lives in client-changelog-data.ts (kept separate so
// this rendering/visibility module stays well under the file line cap).
export { CLIENT_CHANGELOG_ENTRIES };
export type { ClientChangelogEntry };

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

// Entries are authored in any order (append-only, no merge conflicts over
// list position). This is the single place that imposes newest-first order
// for display.
export const sortedClientChangelogEntries = (
  entries: ClientChangelogEntry[] = CLIENT_CHANGELOG_ENTRIES
): ClientChangelogEntry[] => [...entries].sort((left, right) => right.createdAt - left.createdAt);

export const latestClientChangelogTimestamp = (entries: ClientChangelogEntry[] = CLIENT_CHANGELOG_ENTRIES): number =>
  entries.reduce((latest, entry) => Math.max(latest, entry.createdAt), 0);

export const unseenClientChangelogEntries = (
  seenAt: number,
  entries: ClientChangelogEntry[] = CLIENT_CHANGELOG_ENTRIES
): ClientChangelogEntry[] => sortedClientChangelogEntries(entries).filter((entry) => entry.createdAt > seenAt);

export const shouldShowClientChangelog = (
  state: Pick<ClientState, "authSessionReady" | "profileSetupRequired" | "changelog">,
  latestAt: number = latestClientChangelogTimestamp()
): boolean => state.authSessionReady && !state.profileSetupRequired && state.changelog.seenAt < latestAt;

export const syncClientChangelogVisibility = (
  state: Pick<ClientState, "authSessionReady" | "profileSetupRequired" | "changelog">,
  latestAt: number = latestClientChangelogTimestamp()
): boolean => {
  state.changelog.open = shouldShowClientChangelog(state, latestAt);
  return state.changelog.open;
};

export const markClientChangelogSeen = (
  state: Pick<ClientState, "changelog">,
  latestAt: number = latestClientChangelogTimestamp(),
  persistSeenAt: typeof storageSet
): void => {
  state.changelog.open = false;
  state.changelog.seenAt = latestAt;
  state.changelog.scrollTop = 0;
  persistSeenAt(CLIENT_CHANGELOG_STORAGE_KEY, String(latestAt));
};

const changelogBodyHtml = (entries: ClientChangelogEntry[]): string =>
  entries
    .map(
      (entry) => `
        <article class="changelog-entry">
          <div class="changelog-entry-version">Release ${escapeHtml(entry.introducedIn)}</div>
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

export const clientChangelogRenderSignature = (latestAt: number, buildVersion: string): string =>
  `${latestAt}:${buildVersion}`;

export const shouldRebuildClientChangelogOverlay = (
  overlayEl: Pick<HTMLDivElement, "innerHTML" | "dataset">,
  renderSignature: string
): boolean => overlayEl.innerHTML === "" || overlayEl.dataset.renderSig !== renderSignature;

const changelogSummary = (unseenCount: number, totalCount: number): string => {
  if (unseenCount === totalCount) return `Here's what's changed recently — ${totalCount} update${totalCount === 1 ? "" : "s"}.`;
  if (unseenCount === 1) return "This popup shows the single release-note entry you haven't seen yet.";
  return `This popup shows the ${unseenCount} release-note entries you haven't seen yet.`;
};

export const renderClientChangelogOverlay = (deps: {
  state: Pick<ClientState, "authSessionReady" | "profileSetupRequired" | "changelog">;
  changelogOverlayEl: HTMLDivElement;
  buildVersion: string;
  persistSeenAt: typeof storageSet;
  renderHud: () => void;
}): void => {
  const latestAt = latestClientChangelogTimestamp();
  const renderSignature = clientChangelogRenderSignature(latestAt, deps.buildVersion);
  const unseenEntries = unseenClientChangelogEntries(deps.state.changelog.seenAt);
  const summary = changelogSummary(unseenEntries.length, CLIENT_CHANGELOG_ENTRIES.length);
  const isOpen = syncClientChangelogVisibility(deps.state, latestAt);
  deps.changelogOverlayEl.style.display = isOpen ? "grid" : "none";
  if (!isOpen) {
    if (deps.changelogOverlayEl.innerHTML) deps.changelogOverlayEl.innerHTML = "";
    delete deps.changelogOverlayEl.dataset.renderSig;
    return;
  }

  if (shouldRebuildClientChangelogOverlay(deps.changelogOverlayEl, renderSignature)) {
    const latestEntry = unseenEntries[0] ?? sortedClientChangelogEntries()[0];
    deps.changelogOverlayEl.innerHTML = `
      <div class="changelog-backdrop" id="changelog-backdrop"></div>
      <div class="changelog-modal card" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
        <div class="changelog-topbar">
          <div class="changelog-topbar-copy">
            <div class="changelog-kicker">Release ${escapeHtml(latestEntry?.introducedIn ?? "")} • Build ${escapeHtml(deps.buildVersion)}</div>
            <span class="changelog-unseen-count">${unseenEntries.length} new ${unseenEntries.length === 1 ? "entry" : "entries"}</span>
          </div>
          <button id="changelog-close" class="panel-btn changelog-primary-btn" type="button">Continue</button>
        </div>
        <div class="changelog-modal-scroll">
          <h2 id="changelog-title" class="changelog-title">${escapeHtml(CLIENT_CHANGELOG_TITLE)}</h2>
          <p class="changelog-summary">${escapeHtml(summary)}</p>
          <div class="changelog-entry-list">
            ${changelogBodyHtml(unseenEntries)}
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
    markClientChangelogSeen(deps.state, latestAt, deps.persistSeenAt);
    // Hide the overlay directly instead of relying solely on the follow-up
    // renderHud() call to do it. renderClientHud() is a huge, single
    // function covering the whole HUD; if anything else in that render
    // pass throws (and it's wrapped in a catch-and-log at the bootstrap
    // level), this overlay update would never happen and "Continue" would
    // appear to do nothing even though the seen timestamp was correctly
    // persisted. Closing here first makes the button's own effect
    // unconditional; renderHud() still runs afterward for everything else.
    deps.changelogOverlayEl.style.display = "none";
    if (deps.changelogOverlayEl.innerHTML) deps.changelogOverlayEl.innerHTML = "";
    delete deps.changelogOverlayEl.dataset.renderSig;
    try {
      deps.renderHud();
    } catch (error) {
      console.error("[changelog-close-renderhud-failed]", error);
    }
  };

  const closeBtn = deps.changelogOverlayEl.querySelector("#changelog-close") as HTMLButtonElement | null;
  const backdropBtn = deps.changelogOverlayEl.querySelector("#changelog-backdrop") as HTMLDivElement | null;
  if (closeBtn) closeBtn.onclick = close;
  if (backdropBtn) backdropBtn.onclick = close;
};
