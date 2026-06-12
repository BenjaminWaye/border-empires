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
  version: "2026.06.12.3",
  title: "What's New",
  summary: "Blocked gameplay actions now surface as visible warnings instead of only activity-feed messages.",
  entries: [
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
    {
      introducedIn: "2026.06.11.7",
      title: "AI planning covers more of large empires",
      why: "Large AI empires could keep scanning the same frontier origin and miss activity near wrapped map edges or diagonally connected territory.",
      changes: [
        "AI spatial planning now uses wrapping 8-way territory fronts, rotates through multiple origins per category, and caps active-focus extensions at 10 minutes."
      ]
    },
    {
      introducedIn: "2026.06.11.6",
      title: "AI build planning prices structures correctly",
      why: "AI planning could evaluate fort and siege outpost affordability from only the current build-candidate slice, undercounting existing structures elsewhere in a large empire.",
      changes: [
        "AI structure planning now uses the simulation's cached per-player structure counts, matching the final server-side build-cost validation."
      ]
    },
    {
      introducedIn: "2026.06.11.5",
      title: "Town plunder respects capture shock",
      why: "Back-and-forth town captures could repeatedly drain player stocks even though the town had already been pillaged moments earlier.",
      changes: [
        "Capturing a town that is still marked Recently captured changes ownership as usual, but no longer pays another plunder reward."
      ]
    },
    {
      introducedIn: "2026.06.11.4",
      title: "Building contribution details",
      why: "Clearing Houses were visible on the map but their Market/Bank economy bonus was not applied in the rewrite snapshot, and clicked buildings did not explain what they were contributing.",
      changes: [
        "Clearing Houses now boost covered Market and Bank towns.",
        "Clicking an active town support building now shows the town it contributes to and the active bonus."
      ]
    },
    {
      introducedIn: "2026.06.11.3",
      title: "Clearer sign-in retry feedback",
      why: "When the realtime server returned SERVER_STARTING during sign-in, the client said it was disconnected even though the socket was still open, and the retry timer was invisible.",
      changes: [
        "Server-starting sign-in errors now keep the connection state accurate while retrying the auth payload.",
        "The loading overlay and auth progress logs now show the retry attempt and countdown instead of repeating vague server-starting copy."
      ]
    },
    {
      introducedIn: "2026.06.11.2",
      title: "Muster button works",
      why: "The simulation was building its gRPC tile-delta responses without the muster_json field, so the SET_MUSTER result arrived at the client as an empty clear signal every time — the muster state was set on the server but the client never saw it.",
      changes: [
        "Simulation now includes muster data in tile-delta gRPC responses so SET_MUSTER and CLEAR_MUSTER take effect in the client tile state."
      ]
    },
    {
      introducedIn: "2026.06.11.1",
      title: "Muster state updates correctly",
      why: "The muster field was normalized from the server's JSON payload but never applied to the local tile state during tile-delta processing, so clicking Stage Muster or Clear Muster appeared to do nothing.",
      changes: [
        "Muster flag (mode, amount) now correctly reflects on the tile after SET_MUSTER or CLEAR_MUSTER is processed by the server."
      ]
    },
    {
      introducedIn: "2026.06.10.1",
      title: "Faster map exploration",
      why: "Resource and dock tiles were each triggering a server round-trip as they scrolled into view, even though the client already had all the data it needed.",
      changes: [
        "Unowned resource and dock tiles are now marked as fully loaded locally — no round-trip to the server."
      ]
    },
    {
      introducedIn: "2026.06.06.4",
      title: "Passive empire income replaces manual COLLECT_VISIBLE",
      why: "The COLLECT_VISIBLE command required scanning every settled tile on each AI turn, causing 500–2000ms main-thread stalls on large empires and blocking player actions during those windows.",
      changes: [
        "Gold and strategic resources now accrue automatically via a server-side 15-second tick.",
        "Storage caps are computed from empire production rates: 12 hours of gold, food, iron, crystal, supply, oil, and shard.",
        "Fish-tile food fills the food storage cap but does not extend it (fish food is perishable).",
        "Ironworks, Crystal Synthesizer, and Fur Synthesizer buildings add a flat bonus to their resource cap.",
        "Players inactive for more than 12 hours stop receiving passive income until they reconnect.",
        "Combat tile capture now steals a proportional share of the defender's resources.",
      ]
    },
    {
      introducedIn: "2026.06.06.3",
      title: "Combat accepts stay responsive under large empires",
      why: "Frontier decay support checks could scan every fort and town anchor for every frontier tile, blocking the simulation thread while players were attacking across dense borders.",
      changes: [
        "Large support-anchor checks now use local radius lookups instead of empire-wide scans.",
        "The frontier decay perf gate now covers thousands of frontier tiles plus thousands of support anchors, keeping the tick well below the combat submit budget."
      ]
    },
    {
      introducedIn: "2026.06.06.2",
      title: "Clearing Houses get their own map art",
      why: "Clearing Houses could appear as generic or Bank-like markers instead of a distinct building, making it harder to scan connected-town economy upgrades on the map.",
      changes: ["Clearing Houses now render with a dedicated 3D building overlay and a matching 2D/info-panel asset."]
    },
    { introducedIn: "2026.06.06.1", title: "Build actions work on the rewrite gateway", why: "The client started sending the unfinished unified BUILD_STRUCTURE command before the rewrite gateway advertised that wire message, so structure builds could be blocked as unavailable.", changes: ["Structure build clicks now send the gateway-supported build message while keeping the internal queued build state intact.", "Queued structure builds replay through the same compatible send path."] }
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
