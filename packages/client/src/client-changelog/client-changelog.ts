import type { ClientState, storageSet } from "../client-state/client-state.js";

export const CLIENT_CHANGELOG_STORAGE_KEY = "border-empires-client-changelog-seen-v1";
const CLIENT_CHANGELOG_SCROLL_SELECTOR = ".changelog-modal-scroll";

export type ClientChangelogEntry = {
  introducedIn: string;
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
  version: "2026.06.18.2",
  title: "What's New",
  summary: "Foundries now boost mines in a tighter local radius, and production buildings explain their cap impact.",
  entries: [
    {
      introducedIn: "2026.06.18.2",
      title: "Foundry radius tightened",
      why: "A 10-tile Foundry radius covered too much territory and made mine planning less local than intended.",
      changes: [
        "Foundries now double active Mine production within 5 tiles instead of 10.",
        "Foundry build text, structure details, and map previews now show the 5-tile radius.",
        "Farmstead, Camp, Mine, Market, Waterworks, and Foundry copy now explains that production gains also raise storage caps, with exact cap gains in build previews where the input is unambiguous."
      ]
    },
    {
      introducedIn: "2026.06.18.1",
      title: "Military builds on resources",
      why: "Upgraded siege and fort placements could be rejected on owned resource tiles even though their base structures were allowed there.",
      changes: [
        "Siege Towers and Dread Towers can now be placed on valid owned resource tiles.",
        "Iron Bastions and Thunder Bastions now share the Fort family's resource-tile placement rules."
      ]
    },
    {
      introducedIn: "2026.06.17.1",
      title: "Storage cap in economy panel",
      why: "There was no way for players to see how much of each resource they could hold without inspecting tile descriptions.",
      changes: [
        "Each resource card in the economy panel now shows your current stock alongside the storage cap (e.g. 4,312 / 7.2k).",
        "The cap is sent only when it changes, so there is no extra server load on each tick.",
        "Caps scale with production: 12 hours of income is the formula, with a minimum floor for new empires."
      ]
    },
    {
      introducedIn: "2026.06.17.1",
      title: "Collect All button restored",
      why: "The HUD Collect All button was present but silently rejected — the server handler had been removed when passive income was introduced.",
      changes: [
        "Collect All now flushes up to 12 hours of accumulated passive income immediately.",
        "A 20-second cooldown prevents rapid double-collecting.",
        "The per-tile Collect Yield button and the Stored Yield line in the tile panel have been removed (passive income bypasses the old per-tile yield system)."
      ]
    },
    {
      introducedIn: "2026.06.16.5",
      title: "Live manpower drain while mustering",
      why: "The global manpower bar stayed frozen while a muster flag was filling, making it look like staging cost nothing until the next 30-second server snapshot arrived.",
      changes: [
        "Each 1-second muster tick now pushes your updated manpower total alongside the tile delta, so the HUD reflects the drain immediately."
      ]
    },
    {
      introducedIn: "2026.06.16.3",
      title: "Tile panel tab stays put during muster ticks",
      why: "Opening the Structures or Overview tab while a muster flag tile was selected caused the panel to jump back to Actions every second as the server pushed updated muster amounts.",
      changes: [
        "Server-side tile delta updates (including the 1-second muster tick) now refresh the panel content without resetting the active tab or scroll position.",
        "Only a direct user tap on the tile resets the tab back to Actions."
      ]
    },
    {
      introducedIn: "2026.06.16.2",
      title: "Live muster amount in tile panel",
      why: "The staged manpower count in the tile panel was frozen until you re-clicked the tile, making it impossible to watch a flag fill up.",
      changes: [
        "While a muster flag tile is open, the server ticks it every second and pushes the updated amount to your client.",
        "Muster cap now scales with your town tier — City players can accumulate up to 300 manpower at a flag instead of being hard-capped at 150.",
        "If you already have a muster flag placed elsewhere, queuing an attack from a tile with no nearby flag will no longer drop a duplicate flag — it shows 'Not enough manpower at nearest flag' instead."
      ]
    },
    {
      introducedIn: "2026.06.16.1",
      title: "Town tier upgrade button",
      why: "The 'Upgrade to City / Great City / Metropolis' button was never appearing because the simulation was not emitting the upgrade-available signal.",
      changes: [
        "The upgrade button now appears when your town reaches the required population (City: 100k, Great City: 1M, Metropolis: 5M).",
        "Cleaned up diagnostic messages (dock count, town count) that were leaking into the player activity feed on login."
      ]
    },
    {
      introducedIn: "2026.06.15.1",
      title: "Outpost sweep removed",
      why: "The outpost sweep auto-attack has been fully superseded by the muster system, which is now the single way to stage and launch attacks from a structure.",
      changes: [
        "Removed the Start/Stop Sweep action from siege outposts and light outposts.",
        "Outposts no longer auto-attack nearby enemy tiles on their own — use muster to stage manpower and launch attacks."
      ]
    },
    {
      introducedIn: "2026.06.14.1",
      title: "Login progress messages",
      why: "Large empire logins could take several seconds with no feedback, leaving players wondering if the game had stalled.",
      changes: [
        "The loading screen now shows a live status message while the server builds your snapshot.",
        "After 3 seconds: 'Exporting your territory'. After 8 seconds: elapsed time is shown.",
        "Server-side Phase 4b fix also cuts starvation for large-empire logins significantly."
      ]
    },
    {
      introducedIn: "2026.06.12.6",
      title: "Enemy muster flags visible",
      why: "You couldn't see where enemies were staging manpower, making it impossible to respond before the attack launched.",
      changes: [
        "Muster flags placed by enemies now appear on your map in their empire color.",
        "Flags disappear when an enemy clears their muster or the tile is captured.",
        "Flag fills to show a ready-to-attack level — exact amount is hidden."
      ]
    },
    {
      introducedIn: "2026.06.12.5",
      title: "Cleaner bulk action warnings",
      why: "Bulk settlement and frontier-claim actions should not overwrite useful warning details with duplicate summary alerts.",
      changes: [
        "Connected-frontier settlement now suppresses per-tile warning popups while scanning the bulk selection, then shows one summary warning if nothing queued.",
        "Bulk frontier claims now use the same visible warning path as single-tile claims."
      ]
    },
    {
      introducedIn: "2026.06.12.4",
      title: "Muster system overhaul",
      why: "Mustering was too slow (288 min to fill 60 instead of 20 s), cleared manpower was lost rather than returned, and the flag rendered under the settled overlay.",
      changes: [
        "Muster speed raised to 180 manpower/min per tile — 60 manpower stages in ~20 seconds.",
        "Clearing or losing a mustered tile now returns banked manpower to your pool instead of discarding it.",
        "Maximum 5 simultaneous muster tiles per player; flags planted more than 2 days ago auto-clear with a full refund.",
        "Muster flag z-index fixed — the pennant now renders above all tile overlays including the settled animation.",
        "Muster status (amount staged) moved from the tile overview into the action button descriptions."
      ]
    },
    {
      introducedIn: "2026.06.12.3",
      title: "Action blockers are visible",
      why: "Important action failures were too easy to miss when they only appeared in the activity feed.",
      changes: [
        "Blocked settlement, frontier claim, expansion-path, fort, siege outpost, and uncapture actions now show an immediate warning popup.",
        "The activity feed still keeps the short history entry, but it is no longer the only place players see these blockers."
      ]
    },
    {
      introducedIn: "2026.06.12.2",
      title: "Persistent alerts stay on the map",
      why: "The activity feed had become a catch-all error log, so important gameplay problems competed with routine history and debug-style rejection messages. Persistent problems are easier to fix when the map remains the source of truth.",
      changes: [
        "Unfed towns now use the existing map badge plus a clickable edge locator when the affected town is off-screen.",
        "Town-unfed server rejections no longer add activity-feed error spam; they show a short warning and point players back to the persistent town badge.",
        "The existing activity button now shows unread counts and briefly nudges for noteworthy history, without adding another mobile HUD icon."
      ]
    },
    {
      introducedIn: "2026.06.12.1",
      title: "Survey Sweep covers its full range",
      why: "Survey Sweep wrapped around the world correctly, but the positive X and Y edges of the advertised range were excluded from the scan.",
      changes: [
        "Survey Sweep now checks the full centered square from -range through +range, including both positive boundary edges."
      ]
    },
  ]
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const parseReleaseVersion = (releaseVersion: string): number[] =>
  releaseVersion
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));

export const compareReleaseVersions = (left: string, right: string): number => {
  const leftParts = parseReleaseVersion(left);
  const rightParts = parseReleaseVersion(right);
  const width = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < width; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
};

export const unseenClientChangelogEntries = (
  seenVersion: string,
  entries: ClientChangelogEntry[] = LATEST_CLIENT_CHANGELOG.entries
): ClientChangelogEntry[] => {
  if (!seenVersion) return entries;
  return entries.filter((entry) => compareReleaseVersions(entry.introducedIn, seenVersion) > 0);
};

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
  state.changelog.scrollTop = 0;
  persistSeenVersion(CLIENT_CHANGELOG_STORAGE_KEY, releaseVersion);
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
  const unseenEntries = unseenClientChangelogEntries(deps.state.changelog.seenVersion);
  const summary =
    unseenEntries.length === LATEST_CLIENT_CHANGELOG.entries.length
      ? LATEST_CLIENT_CHANGELOG.summary
      : unseenEntries.length === 1
        ? "This popup now shows only the single release-note entry you have not seen yet."
        : `This popup now shows the ${unseenEntries.length} release-note entries you have not seen yet.`;
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
        <div class="changelog-topbar">
          <div class="changelog-topbar-copy">
            <div class="changelog-kicker">Release ${escapeHtml(releaseVersion)} • Build ${escapeHtml(deps.buildVersion)}</div>
            <span class="changelog-unseen-count">${unseenEntries.length} new ${unseenEntries.length === 1 ? "entry" : "entries"}</span>
          </div>
          <button id="changelog-close" class="panel-btn changelog-primary-btn" type="button">Continue</button>
        </div>
        <div class="changelog-modal-scroll">
          <h2 id="changelog-title" class="changelog-title">${escapeHtml(LATEST_CLIENT_CHANGELOG.title)}</h2>
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
    markClientChangelogSeen(deps.state, releaseVersion, deps.persistSeenVersion);
    deps.renderHud();
  };

  const closeBtn = deps.changelogOverlayEl.querySelector("#changelog-close") as HTMLButtonElement | null;
  const backdropBtn = deps.changelogOverlayEl.querySelector("#changelog-backdrop") as HTMLDivElement | null;
  if (closeBtn) closeBtn.onclick = close;
  if (backdropBtn) backdropBtn.onclick = close;
};
