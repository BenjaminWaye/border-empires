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
  version: "2026.07.08.0",
  title: "What's New",
  summary: "Fog of war: lost territory now freezes at its last-known state instead of vanishing or showing stale ownership.",
  entries: [
    {
      introducedIn: "2026.07.08.0",
      title: "Fog of war (session-only)",
      why: "Losing a tile you could no longer see previously either left it looking like you still owned it (stale data) or silently disappeared from the map, because the server had no way to tell the client exactly which tiles left vision and what they looked like the instant before.",
      changes: [
        "Tiles that leave your vision now freeze at their last-witnessed state (including who captured them) and render fogged, instead of going stale or vanishing.",
        "Tiles you've never seen render as unexplored; tiles you can currently see render normally.",
        "Actions that require live vision (build, settle, collect, expand, uncapture) are blocked on fogged/unexplored tiles with a clear notice.",
        "Fog memory is session-only for this release — it resets on reconnect and re-reveals from your current vision."
      ]
    },
    {
      introducedIn: "2026.07.06.0",
      title: "Barbarian plunder capped to prevent gold inflation",
      why: "Capturing a settled tile from Barbarians was awarding massive gold (up to 108 trillion in one capture) because barbarians were initialized with Number.MAX_SAFE_INTEGER gold and the plunder formula divided their 9-quadrillion stash by the tile count.",
      changes: [
        "Plunder from barbarian capture is now fixed at 10 gold per tile, down from a share of their quadrillion-gold pool.",
        "Barbarian initial gold value reduced from MAX_SAFE_INTEGER to 100 to prevent any future inflation vectors."
      ]
    },

    {
      introducedIn: "2026.07.06.4",
      title: "Galaxy launcher button is simpler and no longer spins",
      why: "The rotating-planet launcher button was too visually prominent for a cosmetic feature — it competed with the game's main UI rather than quietly indicating access to the galaxy view.",
      changes: [
        "The launcher button is now a simple 🪐 emoji on a transparent background instead of a full rotating gas giant, making it much less obtrusive on the game screen.",
        "The button still opens the full planet-view starfield overlay when clicked."
      ]
    },
    {
      introducedIn: "2026.07.06.3",
      title: "Fish tiles now produce more food than grain",
      why: "Fish was strictly worse than grain — lower production, can't be improved, can't be banked. Swapping the production rates gives fish a clear strategic niche: high flow for immediate population feeding, but still perishable and unimprovable. Grain is now the lower-rate option but bankable and improvable with Farmsteads and Waterworks.",
      changes: [
        "Fish tile production increased from 48 to 72 FOOD/day; farm tile production reduced from 72 to 48 FOOD/day.",
        "Farmstead bonus on farm tiles updated accordingly (48 + 24 = 72/day with Farmstead).",
        "All structures and techs that reference food rates have been updated to match."
      ]
    },
    {
      introducedIn: "2026.07.06.3",
      title: "Waypoint replacement from any neutral tile",
      why: "Setting a waypoint locked you into it — tapping another neutral tile while a waypoint was active did nothing. You had to manually cancel the old waypoint first, then tap the new tile again to set a new one, which was frustrating in fast-paced expansion.",
      changes: [
        "Tapping a reachable neutral tile while a waypoint is active now shows 'Clear Waypoint and Expand Here' as the first menu action.",
        "Selecting it cancels the existing waypoint and immediately starts expansion toward the new tile in a single tap."
      ]
    },
    {
      introducedIn: "2026.07.06.2",
      title: "Galaxy planet is now an animated world, and never blocks the login screen",
      why: "The planet was a single flat gradient circle with no motion, and the launcher/overlay were mounted as siblings of #hud instead of inside it — #hud's position:fixed makes it its own CSS stacking context, so anything outside it with an explicit z-index always painted above #hud's entire contents, including the login screen, no matter what number was used.",
      changes: [
        "Your planet is now a slowly rotating gas-giant-style sphere with cloud bands, shading, and a tilted ring, instead of a flat circle.",
        "The launcher and its overlay are now mounted inside the game's HUD layer so their stacking order is correctly computed against the rest of the UI — the login screen (and any other overlay) can never be hidden behind them again."
      ]
    },
    {
      introducedIn: "2026.07.06.1",
      title: "Galaxy planet launcher no longer overlaps other controls",
      why: "The new 🪐 planet launcher button was fixed to the bottom-right corner of the screen, the same corner already used by the desktop minimap and, on mobile, directly over the bottom navigation bar's rightmost tab.",
      changes: [
        "On mobile, the launcher now sits just above the bottom navigation bar and respects the device's safe-area inset instead of sitting under the home-indicator gesture zone.",
        "On desktop, the launcher now sits above the minimap instead of overlapping it, and shifts further left automatically while the side panel is open."
      ]
    },
    {
      introducedIn: "2026.07.05.4",
      title: "The galaxy: your planet, permanently",
      why: "Winning a season only mattered until the world reset — there was no lasting record of who won, so victories vanished the moment a new season began.",
      changes: [
        "Season winners can christen a permanent planet, viewable in a new starfield view via the small planet launcher (visible once your account has won at least one season).",
        "Planet names are permanent and can only be set once.",
        "Accounts with multiple season wins can switch between their planets in the same view."
      ]
    },
    {
      introducedIn: "2026.07.06.0",
      title: "Waterworks, Foundry, and Harbor Exchange bonuses now display correctly",
      why: "Waterworks/Foundry radius bonuses and the advanced synthesizer upgrades were computed correctly on the server but never sent to the client, so the map under-reported a boosted Farmstead's food (108 instead of 162) or a boosted Mine's iron. Mine and Camp were also missing their own output bonus entirely, and Harbor Exchange charged upkeep with no income to offset it.",
      changes: [
        "Farmsteads within range of an active Waterworks now show their true boosted food rate (162/day) immediately, including the moment the Farmstead itself is built.",
        "Mines within range of an active Foundry now show their true boosted iron/crystal rate, and Mine/Camp now correctly get their own +50% output bonus.",
        "Advanced Fur Synthesizer, Advanced Ironworks, and Advanced Crystal Synthesizer now show their real (higher) output instead of the same rate as the basic version.",
        "Toggling a Waterworks, Foundry, or Harbor Exchange (build, remove, capture, or destroy) now instantly refreshes every affected nearby tile's displayed yield — no more waiting for an unrelated update to notice the change.",
        "Harbor Exchange now grants +1 gold/minute per connected owned dock instead of costing upkeep for no benefit."
      ]
    },
    {
      introducedIn: "2026.07.05.3",
      title: "Barbarian ghost tiles cleaned up on territory movement",
      why: "When barbarians moved their territory, about 10 tiles visually remained barbarian-owned on the client forever — the ownership-clearing tile delta was filtered out by the visibility check because the tiles had fallen out of the player's visible area, so the client never learned the tiles were abandoned and showed stale barbarian owners.",
      changes: [
        "The simulation's visibility filter now lets an ownership-clearing signal through even for non-visible tiles, so the client always receives the signal to clear stale barbarian (or other player) ownership."
      ]
    },
    {
      introducedIn: "2026.07.05.2",
      title: "Captured tiles no longer flash neutral when they carried an enemy muster flag",
      why: "Capturing a tile that had an enemy muster flag on it sent a follow-up 'clear the flag' update that omitted the tile's owner fields entirely, instead of including the new owner like every other muster-clearing update in the codebase does. Depending on how a client merged that update, the freshly captured tile could render unowned right after the correct capture update.",
      changes: [
        "The muster-flag-clear update fired on capture (and on losing your own origin tile in a counter-attack) now always includes the tile's current owner and ownership state, matching the two other call sites that already did this correctly."
      ]
    },
    {
      introducedIn: "2026.07.05.2",
      title: "Waterworks food bonus now applies to live tile collection and tile updates, not just background income ticks",
      why: "The Waterworks +50% Farmstead food radius bonus was correctly modeled and applied during periodic background income accrual, but the code path used when a player actually clicks Collect on a tile, and the code path used to build the live tile-update broadcast, both built their own copy of the yield context and forgot to forward the Waterworks tile set into it -- silently dropping the bonus for anything except the background tick. The initial map snapshot/bootstrap view had the same gap.",
      changes: [
        "Collecting a Farmstead tile's yield, the live tile-update broadcast, and the initial map snapshot all now apply the Waterworks +50% food bonus consistently with background income ticks."
      ]
    },
    {
      introducedIn: "2026.07.05.2",
      title: "Attacking undefended frontier land now costs much less mustered manpower",
      why: "Frontier-owned tiles (claimed but not yet settled) have zero effective defense in combat -- they always fall to any attack, fort or no fort, until the tile is actually settled. Despite that, attacking one under the mustering system still charged the full settled-attack manpower floor (60), the same cost as attacking a heavily fortified settled town.",
      changes: [
        "Attacking a frontier (un-settled) target now costs a low flat mustered-manpower amount, similar to a barbarian raid, regardless of any fort built on that tile -- forts only raise the attack cost once their tile is actually settled."
      ]
    },
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
