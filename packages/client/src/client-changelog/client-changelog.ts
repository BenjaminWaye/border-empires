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
  version: "2026.07.13.7",
  title: "What's New",
  summary: "AI empires stop endlessly re-proposing a fort build the server just rejected. AI empires under sustained attack no longer monopolize the planner and starve out other AI opponents. Building placement preview: preview and confirm Waterworks/Foundry placement, with beneficiary tiles highlighted green. Town Captured popup now also fires when peacefully claiming a neutral town or when combat destroys a Settlement-tier town.",
  entries: [
    {
      introducedIn: "2026.07.13.7",
      title: "Fixed AI empires spamming rejected fort builds",
      why: "An AI empire whose Build Fort proposal was rejected by the server had no memory of the rejection, so it re-proposed the exact same build on the very next tick — over and over, burning planner cycles instead of doing anything productive.",
      changes: [
        "A rejected build now puts that decision on a 10-second cooldown for that empire, so the planner picks a different action (or waits) instead of immediately retrying the same rejected build."
      ]
    },
    {
      introducedIn: "2026.07.13.6",
      title: "Fixed AI opponents going idle for extended periods",
      why: "An AI empire under continuous attack could cut to the front of the turn queue every tick with no fairness limit, occupying every turn indefinitely and leaving other AI empires unable to act — including ones with large gold reserves and clear expansion opportunities.",
      changes: [
        "An AI empire that hasn't taken a turn in 2 seconds is now guaranteed to go next, even ahead of one under active attack."
      ]
    },
    {
      introducedIn: "2026.07.13.5",
      title: "Placement preview highlights the structures that will actually benefit",
      why: "The Waterworks/Foundry placement radius preview showed the affected area, but not which of your existing structures inside it would actually receive the bonus — you had to know the mechanic and count tiles yourself.",
      changes: [
        "While placing a Foundry, every active Mine you own within its radius now highlights green.",
        "While placing a Waterworks, every active Farmstead you own within its radius now highlights green.",
        "Works in both the flat map and 3D view."
      ]
    },
    {
      introducedIn: "2026.07.13.4",
      title: "Building placement mode for Waterworks and Foundry",
      why: "Placing a radius-based structure like Waterworks or Foundry was a blind commitment — you tapped Build and hoped the tile you picked was valid, with no visibility into the actual affected area or whether the location was strategically optimal.",
      changes: [
        "Tapping Build on a Waterworks or Foundry now enters placement mode instead of immediately building — a radius preview appears on the map showing the affected area.",
        "Click any valid tile to move the building there; the preview updates in real time with the correct radius for each structure.",
        "Valid placements show the structure's color; invalid placements (wrong surface type, conflicts, missing tech) show red.",
        "Confirm to finalize, press Escape or right-click to cancel — no commitment until you're satisfied."
      ]
    },
    {
      introducedIn: "2026.07.13.3",
      title: "Town Captured popup now fires for neutral towns too",
      why: "The popup only fired when the tile's previous owner was a real, different player id, to avoid firing on first-time map reveals. That over-excluded a legitimate case: claiming an already-known but unowned (neutral) town peacefully via Expand — e.g. one that decayed back to neutral, or a vacated barbarian town — never showed the popup at all.",
      changes: [
        "Claiming a previously-known neutral town via Expand now shows the Town Captured popup, not just combat captures from another empire.",
        "First-time map reveals (a tile you've never seen before) still correctly don't trigger the popup, since there's no earlier state to compare against."
      ]
    },
    {
      introducedIn: "2026.07.13.2",
      title: "Town Captured popup now fires for destroyed settlements too",
      why: "The Town Captured popup only fired when the captured tile still had town data afterward. Combat destroys a Settlement-tier town on capture — its population disperses instead of joining the empire — so the tile legitimately ends up with no town, and the popup silently never showed for what's usually the majority of captures.",
      changes: [
        "Capturing a Settlement-tier town via combat now shows a 'Settlement Destroyed' variant of the popup using the town's pre-capture name, tier, and population, instead of showing nothing.",
        "The destroyed variant explains the population dispersed rather than joining your empire, and drops the Manpower Cap/Regen stats since nothing was actually gained.",
        "Towns that survive capture (Town tier and above) keep showing the original 'Town Captured' popup with full stats."
      ]
    },
    {
      introducedIn: "2026.07.13.1",
      title: "Town Captured popup",
      why: "Capturing a shard site already celebrated the moment with a popup, but capturing a town — a much bigger empire event — was silent, easy to miss in the middle of a fight, and gave no quick way to jump back to the new town.",
      changes: [
        "Capturing an enemy or barbarian town now shows a hero popup with town art, its name, coordinates, and tier.",
        "The popup shows the town's population, the Manpower Cap and Manpower Regen it will add to your empire, and a note that full production resumes once it's settled and supported.",
        "A Jump to Town button recenters the map on the captured town in case it's off-screen."
      ]
    },
    {
      introducedIn: "2026.07.13.0",
      title: "Supply Raiding reworked into Dewildernisation — bonus vs barbarians",
      why: "The original Supply Raiding domain boosted outpost deployment speed and reduced outpost supply upkeep, which pigeonholed it into a niche siege-outpost role that felt disconnected from its raiding theme. The domain now lives up to its name as a focused barbarian offensive bonus.",
      changes: [
        "Supply Raiding has been renamed to Dewildernisation — a concerted imperial campaign to push back the wilds.",
        "Iron Bastions has been renamed to Dwarf Kingdom.",
        "Dewildernisation now grants +50% attack power against barbarian tiles instead of the old outpost deployment and upkeep bonuses."
      ]
    },
    {
      introducedIn: "2026.07.12.7",
      title: "Rail Depot reworked into a mustering hub",
      why: "The Rail Depot was previously a dead structure with no real effect. It now serves as a mustering logistics hub that boosts manpower regen and speeds up outpost muster within a 50-tile radius.",
      changes: [
        "Each Rail Depot built adds +0.5 global manpower regen per minute.",
        "Outposts within 50 tiles of a Rail Depot now muster at 2x speed instead of the base 1.25x.",
        "Rail Depot has no gold upkeep — it costs 4,000 gold + 100 crystal to build."
      ]
    },
    {
      introducedIn: "2026.07.12.7",
      title: "Fixed inaccurate siege outpost attack multiplier text",
      why: "The client displayed stale attack multiplier values (1.25x, 2x, 3x) that didn't match the actual game constants (1.6x, 1.8x, 2.0x).",
      changes: [
        "Siege Outpost now correctly shows +60% offense (was +25%).",
        "Siege Tower upgrade text now shows 1.6x to 1.8x (was 1.25x to 2x).",
        "Dread Tower upgrade text now shows 1.8x to 2.0x (was 2x to 3x).",
        "Tile overview badges now show the correct attack multiplier per siege variant."
      ]
    },
    {
      introducedIn: "2026.07.12.6",
      title: "Fixed fog of war not clearing while expanding",
      why: "A recent fix that made expand actions faster (skipping a redundant full-area rescan on every expand) accidentally also skipped sending the newly-visible fringe of land around each expand. The result: expanding into unexplored territory revealed nothing, while unrelated background activity elsewhere on the map occasionally leaked through as disconnected fogged-then-cleared patches.",
      changes: [
        "Expanding into unexplored territory now correctly reveals the newly-visible edge of land around your new tile again, without bringing back the slow full-area rescan that caused the original expand speed issue."
      ]
    },
    {
      introducedIn: "2026.07.12.5",
      title: "Diagnostics bundle now includes performance metrics and frame-phase breakdown",
      why: "When users report lag, the diagnostics download had no performance data — just connection state and identity bits. Without FPS history, frame phase timing, or load-time waterfall, there was no way to triage whether the problem was server-side, network, or client rendering.",
      changes: [
        "The diagnostics download (triggered via the Settings tab) now includes a load-waterfall section showing how long each login step took relative to navigation start.",
        "Performance metrics are now collected every 2 seconds under the hood: FPS distribution (min, max, avg, p50, p95, p99), memory usage samples (last 60 snapshots), connection type, and device info. All appear in the diagnostics file.",
        "Each rendered frame is now broken into three phases (frame setup, tile render, overlay post) measured as elapsed milliseconds, so lag can be traced to a specific phase of the draw loop."
      ]
    },
    {
      introducedIn: "2026.07.12.4",
      title: "Auto-fill now settles enclosed frontier tiles",
      why: "When territory sealed off a pocket of land, auto-fill was only claiming unowned tiles inside it — any of your own frontier tiles trapped in the same pocket stayed frontier and could still decay back to unowned, even though the pocket was fully enclosed by your own settled territory.",
      changes: [
        "Frontier tiles inside a pocket sealed off by your territory are now promoted to settled along with the unowned tiles, instead of being left as decay-vulnerable frontier."
      ]
    },
    {
      introducedIn: "2026.07.12.3",
      title: "Emperor's Endorsement and the Imperial Ward",
      why: "Phase 1 of the galactic meta-layer crowns the winner of the most recently ended season as \"Emperor\" for a one-hour window, letting them endorse another player who then gets Imperial Ward charges next season — a real bonus with teeth, not just a resource head start.",
      changes: [
        "If you're the reigning Emperor, opening your galaxy view now shows an endorsement form with a live countdown to when the window closes.",
        "You can endorse a player by email or player ID, and change your pick as many times as you like before the window closes. If you don't act, the next season starts automatically after the hour anyway — nothing is ever blocked on the Emperor.",
        "The endorsed player starts next season with 3 Imperial Ward charges. Activating one (from the new shield chip in your stat bar) makes every tile you own completely un-attackable for 10 minutes — you can still attack out, and there's no cooldown between charges.",
        "The endorsement section is only visible to the Emperor — everyone else's galaxy view is unchanged."
      ]
    },
    {
      introducedIn: "2026.07.12.2",
      title: "New Settings tab",
      why: "Account controls (logout, debug info) were bolted onto the bottom of the Sharding panel, which had nothing to do with account settings. There was also no way to change your display name after initial setup.",
      changes: [
        "Added a Settings tab (gear icon) after Sharding in both the desktop panel bar and mobile nav.",
        "Moved sign-in status, client build version, bridge/auth debug info, map reveal, and Log Out into the new Settings tab.",
        "Added a Display Name field in Settings so you can change your name at any time, not just during initial profile setup."
      ]
    },
    {
      introducedIn: "2026.07.12.1",
      title: "Fixed Aegis Lock and Astral Dock Launch not doing anything",
      why: "The gateway kept two separate lists of which commands it forwards to the simulation. The two lists had drifted apart, so Aegis Lock and Astral Dock Launch actions were quietly discarded before they ever reached the simulation — no error, just nothing happened.",
      changes: [
        "Aegis Lock and Astral Dock Launch commands are now correctly submitted to the simulation instead of being silently ignored."
      ]
    },
    {
      introducedIn: "2026.07.11.4",
      title: "Fixed lingering ghost ownership after barbarians move",
      why: "When a barbarian vacated a tile, the server correctly told the client the tile was now neutral, but a tile-merge bug quietly restored the barbarian's old ownership — so the map kept showing the tile as owned indefinitely.",
      changes: [
        "Tiles that lose their owner (e.g. a barbarian walking away) now clear their ownership color immediately instead of staying stuck on the previous owner."
      ]
    },
    {
      introducedIn: "2026.07.11.3",
      title: "Fixed black gap at the shoreline",
      why: "At low camera angles you could see a black crack where the land met the water — the terrain surface had no thickness and stopped exactly at the coast.",
      changes: [
        "Coastal land tiles now drop a solid wall down to below the waterline so grazing camera angles never show through to empty space at the shore."
      ]
    },
    {
      introducedIn: "2026.07.11.2",
      title: "Shard rain countdown on the domain panel",
      why: "There was no persistent way to see when the next shard rain was coming — only a one-time dismissible alert.",
      changes: [
        "The Shard Network card now shows 'Next shard rain in Xh Ym' while waiting, or 'Shard rain active — N sites — X left' while it's underway."
      ]
    },
    {
      introducedIn: "2026.07.11.2",
      title: "Missions tab hidden",
      why: "Missions are paused for rebalance; the tab was showing stale placeholder content.",
      changes: [
        "The Missions button and panel are hidden from desktop and mobile navigation. Mission state is untouched so the feature can return later."
      ]
    },
    {
      introducedIn: "2026.07.11.1",
      title: "Fixed truce offers to AI empires in seasonal default games",
      why: "Social state used seasonal names (e.g. \"Freja Sund\") while client sent \"AI N\" format for truce target names, causing all truce offers to AI empires to fail with \"target not found\".",
      changes: [
        "Aligned gateway social state AI names to \"AI N\" format matching client display names."
      ]
    },
    {
      introducedIn: "2026.07.09.9",
      title: "Season-end overlay now scrolls on macOS trackpad",
      why: "Nested scroll containers (.se-scroll-body wrapping .se-tab-panels) confused macOS trackpad — neither scrolled.",
      changes: [
        "Removed overflow-y: auto from .se-scroll-body so only .se-tab-panels is the scroll container.",
      ]
    },
    {
      introducedIn: "2026.07.09.8",
      title: "Fog of war now renders in the 3D map",
      why: "3D renderer skipped drawing any tile not currently visible, so fogged tiles were empty black.",
      changes: [
        "Fogged 3D tiles now render frozen terrain, darkened, with dim owner tint."
      ]
    },
    {
      introducedIn: "2026.07.09.7",
      title: "Season-end overlay scrolling works everywhere, not just in the tab panel area",
      why: "Removing the outer scroll container (2026.07.09.6) fixed the tab panels but made scrolling over the header/tabs do nothing.",
      changes: [
        "Kept outer scroll on header/tab bar while tab panels scroll independently."
      ]
    },
    {
      introducedIn: "2026.07.09.5",
      title: "Fogged tiles keep a dim ownership tint",
      why: "Fog-of-war dropped ownership color once a tile went fogged, so you couldn't tell who held it last.",
      changes: [
        "Fogged tiles now render a dim, static tint of their last-witnessed owner."
      ]
    },
    {
      introducedIn: "2026.07.09.4",
      title: "Fixed minimap shard-rain pings not rendering on fogged tiles",
      why: "The minimap ping loop skipped any tile that wasn't a currently-visible FALL shard site, so pings on fogged or unexplored tiles never animated even though the ping itself was active.",
      changes: [
        "Minimap shard-rain pings now render for the duration they're active, regardless of the tile's fog or exploration state."
      ]
    },
    {
      introducedIn: "2026.07.09.3",
      title: "Fixed barbarian tiles rendering turquoise instead of dark grey",
      why: "The gateway hashed barbarian-1 for a color, overriding the client's intended dark-grey fallback with a bright hue.",
      changes: [
        "Barbarian territory now always renders dark grey (#2f3842), regardless of server color."
      ]
    },
    {
      introducedIn: "2026.07.09.2",
      title: "Fixed truce offers appearing on barbarian tiles",
      why: "Truce menu only excluded id \"barbarian\", not \"barbarian-1\", so truce actions appeared on barbarian territory.",
      changes: [
        "Offer/Break Truce no longer appear on any barbarian-owned tile."
      ]
    },
    {
      introducedIn: "2026.07.09.1",
      title: "Truce-break lockout",
      why: "Breaking a truce early had no consequence, so players used truces as free, revocable shields.",
      changes: [
        "Breaking an active truce now locks you out of new truces for 24 hours."
      ]
    },
    {
      introducedIn: "2026.07.09.0",
      title: "Leaderboard scrolling works normally on mobile",
      why: "The leaderboard panel and other mobile panels would not scroll with normal touch gestures — you could only scroll them by pressing and holding the tab navigation bar at the bottom of the screen. The panel was missing standard mobile scroll CSS properties.",
      changes: [
        "Mobile panels now have proper touch-action, momentum scrolling, and overscroll-behavior CSS so they scroll with normal finger swipes."
      ]
    },
    {
      introducedIn: "2026.07.09.0",
      title: "Login probes no longer inflate the season-end empire count",
      why: "Health-check login probes that briefly connect to verify the server is alive were creating game-world empires with no tiles, income, or techs — and counting toward the 'N empires vied for the crown' tally at season end, making empty seasons look busier than they were.",
      changes: [
        "Players with zero settled tiles, zero income, and zero techs are now excluded from leaderboard rankings and the seasonal empire-count display, automatically filtering out login probes and other zero-activity empires."
      ]
    },
    {
      introducedIn: "2026.07.08.6",
      title: "Fixed fogged tiles looking unexplored",
      why: "A tile only rendered as fog (dimmed, last-known state) if its key was in the client's discoveredTiles set — but several code paths (the login chunk-stream, live TILE_DELTA updates, and optimistic-action reverts) only added a tile to that set when it wasn't fogged, a leftover check from before fog-of-war existed. So any tile whose first-ever appearance was already fogged, or that got reverted while fogged, rendered solid black exactly like terrain you'd never seen — fog and unexplored were visually indistinguishable.",
      changes: [
        "Fogged tiles are now always marked as discovered, regardless of which code path first delivers them, so they correctly render dimmed instead of pitch black."
      ]
    },
    {
      introducedIn: "2026.07.08.4",
      title: "Breakthrough Momentum: a captured tile's neighbours are briefly weaker",
      why: "For 60 seconds after you lose a tile to an attacker, its still-held cardinal neighbours were meant to show a 30% defence penalty (Breakthrough Momentum) — but the breach timer never actually reached the client over the network (the field was missing from the wire schema), the attack preview never accounted for it, and neighbours breached across the world's east/west or north/south seam were missed entirely.",
      changes: [
        "The breach timer now reliably reaches the client, so weakened neighbouring tiles show a torn, paper-like amber border for the full 60-second window instead of never appearing.",
        "The torn edge only appears on the side of the tile actually missing a friendly neighbour, not the whole tile perimeter.",
        "The attack preview's win chance now reflects a target's active breach penalty before you commit to an attack.",
        "Breaching now correctly wraps across the world's edge, so a capture near the map seam weakens neighbours on the far side too.",
        "This mechanic remains behind the BREAKTHROUGH_ENABLED flag (off by default) until it's enabled for a season."
      ]
    },
    {
      introducedIn: "2026.07.08.3",
      title: "Fog of war (session-only)",
      why: "Losing a tile you could no longer see previously either left it looking like you still owned it (stale data) or silently disappeared from the map, because the server had no way to tell the client exactly which tiles left vision and what they looked like the instant before.",
      changes: [
        "Tiles that leave your vision now freeze at their last-witnessed state (including who captured them) and render fogged, instead of going stale or vanishing.",
        "Tiles you've never seen render as unexplored; tiles you can currently see render normally.",
        "Actions that require live vision (build, settle, collect, expand, uncapture) are blocked on fogged/unexplored tiles with a clear notice.",
        "Fog memory is session-only for this release — it resets on reconnect and re-reveals from your current vision."
      ]
    }
    // Older entries (2026.07.08.2 and earlier) trimmed: the release-day
    // window test only keeps entries within the latest 6 days of
    // LATEST_CLIENT_CHANGELOG.version -- see git history for the full changelog.
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
