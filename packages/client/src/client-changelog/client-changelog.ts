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
  version: "2026.07.05.1",
  title: "What's New",
  summary: "Fixed frontier tiles cut off by encirclement not updating on the map until refresh.",
  entries: [
    {
      introducedIn: "2026.07.05.1",
      title: "Cut-off frontier tiles now update the map immediately",
      why: "A tile ownership change delivered outside the main batched tile-sync path (a single-tile detail refresh, or an attack/encirclement result) updated the client's tile data correctly, but never signaled the 3D map's render loop to redraw. The tile silently stayed owned/frontier on screen until an unrelated camera move or a full page refresh forced a redraw.",
      changes: [
        "Any tile update that clears or changes ownership -- including a frontier tile cut off by an encirclement -- now immediately triggers a map redraw, matching the correct data the client already had."
      ]
    },
    {
      introducedIn: "2026.07.02.5",
      title: "Reduced background network traffic for large empires",
      why: "A background sweep continuously pre-fetched enriched tile-detail data for any visible owned tile, including bare settled land with nothing to enrich. For a large empire made mostly of plain settled tiles, this sweep never idled -- it just kept cycling through thousands of tiles as their 60-second freshness window expired, generating constant traffic even with the camera still.",
      changes: [
        "The background sweep now only pre-fetches detail for tiles with a town, since those are the only tiles with real enrichable data (support, food coverage, connected-town bonus). Docks, forts, and other structures still show full detail instantly when clicked -- just via the normal on-demand fetch instead of a continuous background sweep."
      ]
    },
    {
      introducedIn: "2026.07.02.4",
      title: "Owned tiles no longer flash unowned on sparse server updates",
      why: "A tile update from the server that omitted owner fields (because they hadn't changed) was being treated by the client as an explicit signal to clear ownership -- a workaround for a narrow stale-barbarian-ownership case that instead wiped correct ownership on any update missing those fields, including tile-detail responses built from an incomplete server-side cache entry.",
      changes: [
        "The client now correctly treats missing owner fields on an update as \"unchanged\" rather than \"cleared\", matching how the server actually emits these updates.",
        "Owned tiles (including docks and towns) stay correctly marked as yours instead of intermittently appearing neutral."
      ]
    },
    {
      introducedIn: "2026.07.02.3",
      title: "Frozen AI empires are active again",
      why: "A repair pass that runs on startup to fix player records with zero gross income always rebuilt missing records as human players, even for AI ids. Once an AI record got mislabeled this way it was permanently excluded from the AI tick loop (which only acts on players flagged isAi), so that empire froze forever at its starting settlement with no growth, combat, or expansion.",
      changes: [
        "The startup repair now recognizes the \"ai-<n>\" id convention and rebuilds or self-heals those records as AI players instead of human, without resetting any accumulated progress.",
        "Newly repaired AI ids are fed back into the autopilot's active player list immediately, so they resume playing on the same startup instead of staying frozen until a full restart."
      ]
    },
    {
      introducedIn: "2026.07.02.2",
      title: "Frontier territory is easier to see on the map",
      why: "Frontier tiles were tinted at only 32% opacity, which on grass terrain was nearly indistinguishable from unowned land — owned frontier claims (including the tiles supporting farms, docks, and towns) could look neutral even though they were correctly yours.",
      changes: [
        "Frontier ownership tint raised from 32% to 50% opacity so owned-but-unsettled tiles read clearly across all terrain types."
      ]
    },
    {
      introducedIn: "2026.07.02.1",
      title: "Fewer \"Simulation unavailable\" errors for large empires",
      why: "Every tile change (including ones that only touched frontier tiles — territory expansion, muster, population growth) force-rebuilt a large empire's full income/upkeep breakdown before the next Settle. On empires with a couple thousand owned tiles this rebuild could take over two seconds, occasionally blowing past the server's command timeout and surfacing as \"Simulation unavailable.\"",
      changes: [
        "The server now only rebuilds an empire's income/upkeep breakdown when a settled tile actually changes, not on every frontier tile update.",
        "Settle commands in large empires resolve without the added rebuild delay, reducing \"Simulation unavailable\" errors during busy expansion turns."
      ]
    },
    {
      introducedIn: "2026.07.01.2",
      title: "Census Hall has a new building model",
      why: "Census Hall previously reused the Governor's Office icon and had no 3D model, so it was invisible/generic on the map.",
      changes: [
        "3D map: Census Hall now renders as a modest stone records office with a small brass tally drum on the facade, scaled like the other minor support structures.",
        "2D map: Census Hall has its own icon instead of borrowing the Governor's Office icon."
      ]
    },
    {
      introducedIn: "2026.07.01.1",
      title: "Aegis Lock and Launch Satellite are live",
      why: "Both abilities showed a working button in the tile menu, but the gateway silently rejected the command with 'not yet migrated to gateway' because the server-side handler was never built — clicking either button did nothing.",
      changes: [
        "Aegis Lock now actually locks: while active, hostile attacks inside the dome's 30-tile radius can no longer flip ownership of tiles there.",
        "Launch Satellite now actually reveals: while active, your empire sees the whole map instead of only your usual territory/vision radius, for the full 24 hours.",
        "Both abilities have new activation FX: Aegis Lock gets a glowing stasis-field ring (not a solid dome, so it doesn't block your view), and Launch Satellite reuses the beacon-launch effect."
      ]
    },
    {
      introducedIn: "2026.07.01.1",
      title: "Worldbreaker Cannon costs more per shot",
      why: "The Worldbreaker Shot tooltip described a different cost, cooldown, and effect than what the server actually did, and the ability was underpriced for what it does (destroy a structure and cut a town's population 30%, from anywhere on the map, with no miss chance).",
      changes: [
        "Worldbreaker Shot now costs 15,000 gold in addition to its existing 500 crystal.",
        "The World Engine tooltip and Actions tab description now match the real cooldown (60m), cost, and effect instead of the old text.",
        "World Engine Strike, Imperial Exchange Levy, and Astral Dock Launch all have new activation FX at the monument tile."
      ]
    },
    {
      introducedIn: "2026.06.30.3",
      title: "Start New Season no longer shows as unavailable",
      why: "The gateway accepted START_NEW_SEASON but did not advertise it in the rewrite capability list, so the client blocked the season-end button before sending the command.",
      changes: [
        "The rewrite gateway now includes START_NEW_SEASON in its supported client message list.",
        "The client can send the season rollover request from the season-end overlay instead of showing Action unavailable."
      ]
    },
    {
      introducedIn: "2026.06.30.2",
      title: "Sky Dock Bombard shows which tiles hit and which missed",
      why: "Bombarding a target with the airport's Sky Dock gave no indication of why some tiles in the blast radius didn't flip to neutral — players couldn't tell a random miss (forts reduce hit chance) from a bug.",
      changes: [
        "The bombardment explosion FX is now driven by the actual server result instead of firing identically on every tile: tiles that hit get the orange ring/flash explosion, tiles that missed get a gray smoke fizzle instead.",
        "The feed also shows a summary message after each bombardment with the hit/miss counts.",
        "If no enemy tiles were in range, the feed says so instead of leaving the result ambiguous."
      ]
    },
    {
      introducedIn: "2026.06.30.1",
      title: "Capture pop indicator floats once and slower",
      why: "When capturing a city, the floating \"-XXX pop\" indicator re-fired on every camera move instead of floating up once and fading. The 3.2s animation was also too fast to read.",
      changes: [
        "The floating text and its guard map are no longer cleared during terrain rebuild, so the indicator fires only once per capture event.",
        "Floating duration increased from 3.2s to 5s for easier readability."
      ]
    },
    {
      introducedIn: "2026.06.30.1",
      title: "Sky Dock Bombard target overlay no longer persists after execution",
      why: "After executing a Sky Dock Bombard, the red target tile overlay remained visible until browser refresh — the fill mesh and tile borders were only hidden during terrain rebuild, not on every render frame.",
      changes: [
        "The crystal targeting overlay now hides its fill mesh and tile borders every frame when targeting mode is inactive, not just during rebuild."
      ]
    },
    {
      introducedIn: "2026.06.30.0",
      title: "Dock-based 'Launch Attack' no longer silently fails",
      why: "Attacking an enemy dock tile with a connected dock showed 'Queued 1 attacks' in the feed but never resolved — the UI accepted the target because the tile had a dockId, but the action queue couldn't find a valid owned origin and silently used the enemy tile instead, causing muster flag creation to target enemy land and server validation to reject the command.",
      changes: [
        "The 'Launch Attack' button now verifies dock network connectivity before showing — if the client can't resolve a valid owned dock origin linked to the target, the button stays hidden.",
        "The action queue no longer accepts dock targets without a valid reachable origin (previously the dockId property alone was sufficient to bypass the origin check).",
        "The processActionQueue fallback that set the origin to the enemy tile (from=to) is replaced with a clean action drop and log entry."
      ]
    },
    {
      introducedIn: "2026.06.30.0",
      title: "Dock-based 'Launch Attack' no longer silently fails",
      why: "Attacking an enemy dock tile with a connected dock showed 'Queued 1 attacks' in the feed but never resolved — the UI accepted the target because the tile had a dockId, but the action queue couldn't find a valid owned origin and silently used the enemy tile instead, causing muster flag creation to target enemy land and server validation to reject the command.",
      changes: [
        "The 'Launch Attack' button now verifies dock network connectivity before showing — if the client can't resolve a valid owned dock origin linked to the target, the button stays hidden.",
        "The action queue no longer accepts dock targets without a valid reachable origin (previously the dockId property alone was sufficient to bypass the origin check).",
        "The processActionQueue fallback that set the origin to the enemy tile (from=to) is replaced with a clean action drop and log entry."
      ]
    },
    {
      introducedIn: "2026.06.30.0",
      title: "Shard collection animation overlay adapts to mobile screen sizes",
      why: "The shard collection overlay (the brief animation when you collect a shard) used a fixed side-by-side layout with large text and art that overflowed or looked cramped on small phone screens.",
      changes: [
        "On screens narrower than 520px, the overlay stacks the artwork above the text, centers all content, and reduces art size (120→80px) and font sizes proportionally.",
        "The SVG artwork now scales with its container instead of being fixed at 120×120px.",
        "Overlay padding and border-radius reduced on all screen sizes for a tighter fit."
      ]
    },
    {
      introducedIn: "2026.06.29.7",
      title: "Removed confusing origin-to-target line from crystal targeting overlay",
      why: "The connection line drawn from the origin building to the hovered/selected target tile was confusing — it looked like part of the targeting UI but didn't add useful information.",
      changes: [
        "Removed the origin-to-target connection line from the 3D crystal targeting overlay."
      ]
    },
    {
      introducedIn: "2026.06.29.6",
      title: "Crystal targeting overlay and range circles are more visible in 3D",
      why: "The 3D crystal targeting overlay (semi-transparent tiles) and the 3D range circles (airport bombard, observatory, waterworks, sweep) were too faint to see clearly.",
      changes: [
        "Crystal targeting overlay fill opacity increased from 12% to 30%.",
        "Crystal targeting overlay valid target tiles now have a colored border (stroke) matching the 2D overlay style.",
        "Airport Bombard range circle border increased from 40% to 55% and fill from 2.5% to 10%.",
        "Observatory range circle border increased from 35% to 55% and fill from 2% to 10%.",
        "Waterworks and Sweep range circle fills increased from 3-4% to 10%."
      ]
    },
    {
      introducedIn: "2026.06.29.5",
      title: "Crystal targeting overlay now renders in 3D mode",
      why: "When entering crystal targeting mode (Sky Dock Bombard, etc.) in 3D view, the valid target tiles were only highlighted in the 2D overlay — which rendered on top of the 3D scene. You couldn't see which tiles were valid targets in 3D.",
      changes: [
        "Valid target tiles now show a semi-transparent colored overlay on the 3D terrain.",
        "Hovering or selecting a valid target shows a connection line from origin to target tile.",
        "Origin and target tiles get bold outline markers in 3D.",
        "2D crystal targeting highlights and airport range overlay are now hidden when 3D mode is active."
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
