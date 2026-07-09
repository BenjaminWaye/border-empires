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
  version: "2026.07.09.5",
  title: "What's New",
  summary: "Fogged tiles now show who last held them instead of losing their ownership tint entirely.",
  entries: [
    {
      introducedIn: "2026.07.09.5",
      title: "Fogged tiles keep a dim ownership tint",
      why: "Fog-of-war rendering dropped ownership color entirely once a tile went fogged, so a captured-then-fogged tile just looked neutral instead of showing who actually held it last — you couldn't tell at a glance whether a lost tile went to a rival or a barbarian.",
      changes: [
        "Fogged tiles now render a dim, static tint of their last-witnessed owner (no live blink/breach-shock animation, since that state is frozen)."
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
      why: "The gateway assigns every player a color by hashing their id, but barbarian-1 was never excluded from that hashing, so it got a hashed hue (turquoise) that overrode the client's intended dark-grey barbarian fallback.",
      changes: [
        "Barbarian territory now always renders with the fixed dark grey (#2f3842) fill, regardless of any color the server sends for that id.",
        "The gateway now assigns barbarian ids a fixed color instead of a hashed one, so this can't drift again."
      ]
    },
    {
      introducedIn: "2026.07.09.2",
      title: "Fixed truce offers appearing on barbarian tiles",
      why: "Settled barbarian territory is owned by the id \"barbarian-1\", but the truce menu only excluded the literal id \"barbarian\", so the Offer Truce/Break Truce actions incorrectly showed up on barbarian-controlled tiles.",
      changes: [
        "Offer Truce and Break Truce no longer appear on any barbarian-owned tile.",
        "The gateway now also rejects a TRUCE_REQUEST targeting a barbarian player id server-side, as defense in depth."
      ]
    },
    {
      introducedIn: "2026.07.09.1",
      title: "Truce-break lockout",
      why: "Breaking a truce before its 12h/24h window ended had no consequence, so players could use truces as a free, revocable shield with no downside for reneging.",
      changes: [
        "Breaking an active truce early now locks you out of requesting or accepting any new truce for 24 hours.",
        "The player you broke the truce with is not penalized and can offer or accept truces normally.",
        "The Break Truce action tooltip now warns about the lockout before you confirm."
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
    },
    {
      introducedIn: "2026.07.08.2",
      title: "Fixed mustered attacks on a connected dock never firing",
      why: "Launching an attack on an enemy dock reachable only via your own connected dock's sea route would stage a muster flag and wait for it to fill, but once it reached full strength the attack would silently re-stage instead of launching — the range check that decides whether a muster flag is close enough measured raw grid distance, which a sea crossing between two docks can never satisfy no matter how much muster was staged.",
      changes: [
        "A muster flag on a dock tile that is sea-linked to the target now counts as in range once full, so the attack launches instead of getting stuck in an endless staging loop."
      ]
    },
    {
      introducedIn: "2026.07.08.1",
      title: "Season Victory cards now show your progress, not just the leader's",
      why: "The leaderboard's Season Victory cards always showed the current leader's progress on each objective, but the server never actually sent your own comparison numbers unless you were the leader, so the \"You: ...\" line under a non-led objective silently never appeared, even though the client already had code to render it.",
      changes: [
        "When you're not leading a Season Victory objective, the leaderboard now shows a \"You: ...\" line with your own progress alongside the leader's, so you can see how far behind (or close) you are."
      ]
    },
    {
      introducedIn: "2026.07.08.0",
      title: "New Development tab shows what's using your build slots",
      why: "The HUD already showed a \"Development X/3\" counter for the shared slot limit on simultaneous settles and constructions, but there was no way to see what was actually occupying those slots or what was queued waiting for one to free up — you had to remember or hunt across the map.",
      changes: [
        "Tap the Development counter in the top HUD bar to open a new panel listing every active slot (settlement or structure, its location, and time remaining) plus everything queued behind the cap."
      ]
    },
    {
      introducedIn: "2026.07.07.7",
      title: "Structures no longer randomly vanish from tiles",
      why: "Any tile update unrelated to a fort, observatory, siege outpost, economic structure, sabotage marker, town, or naval muster order could still wipe that structure from view — the server's wire format couldn't tell 'this delta didn't touch that structure' apart from 'this structure was removed', so an unrelated change to the same tile (a yield tick, a nearby capture, etc.) would blank it out.",
      changes: [
        "Structures, towns, and muster orders now stay visible through unrelated tile updates instead of disappearing until the next full sync."
      ]
    },
    {
      introducedIn: "2026.07.07.6",
      title: "Fixed development slot bonuses not applying",
      why: "Frontier Doctrine (and other domains/techs like Iron Bastions and Supply Raiding) set a developmentProcessCapacityAdd effect that the tech tooltip correctly displayed as \"Development slots +1\", but the actual slot limit sent to the client — and enforced by the server when starting a new settlement — was always the flat base of 3, regardless of what a player had researched.",
      changes: [
        "Development slot limits now include the developmentProcessCapacityAdd bonus from all owned techs and domains, both in the HUD toolbar and in server-side settlement validation."
      ]
    },
    {
      introducedIn: "2026.07.07.5",
      title: "Settlements now grow population over time",
      why: "The population-growth tick explicitly skipped any town at SETTLEMENT tier, so a Settlement's population stayed frozen at its starting value (typically 800) forever, even though the tile-detail view already displayed a projected growth rate and ETA to Town tier as if it were growing. Settlements can already be upgraded to Town tier via a free manual command regardless of population, but players had no way to grow their Settlement's population beforehand or watch it develop naturally.",
      changes: [
        "Settlement-tier towns now accumulate population using the same boosted growth-rate formula the tile-detail view already projected (4x the base rate, to reach the 10,000-population Town threshold in a comparable timeframe), plus the same food-fed check, war-pause, and long-peace bonus rules as Town-tier and above.",
        "Settlements still upgrade to Town tier via a free manual command regardless of population — this only fixes population growth while still at Settlement tier."
      ]
    },
    {
      introducedIn: "2026.07.07.4",
      title: "Muster flags are now easier to find",
      why: "Unfed towns already got a pulsing edge-of-screen arrow so you could find them from anywhere on the map, but active muster flags (holding or advancing manpower) had no equivalent — they were only visible if you happened to be looking at the right tile in the 3D view.",
      changes: [
        "Active muster flags you own now show a pulsing locator arrow at the screen edge when off-screen, click it to jump straight to the flag, just like the unfed-town warning.",
        "The manpower detail panel now lists every active muster flag (location, hold/advance mode, and staged manpower); click a row to center the camera on it."
      ]
    },
    {
      introducedIn: "2026.07.07.3",
      title: "Fixed fog-of-war lifting on unrelated map tiles",
      why: "When a barbarian walked off a tile anywhere on the map, the server broadcast a tiny ownership-clearing update to every connected player so stale ghost ownership wouldn't linger in the client's cache. The client couldn't tell that stub apart from a real visible-tile update, so it treated it as proof the tile was now visible and permanently lifted fog-of-war on random, distant tiles it had never actually seen.",
      changes: [
        "The server now marks these broadcast-only ownership clears with an explicit flag instead of relying on the shape of the update.",
        "The client uses that flag to update stale ownership without discovering the tile or lifting its fog — fog-of-war now only lifts for tiles you've actually observed."
      ]
    },
    {
      introducedIn: "2026.07.07.2",
      title: "AI empires stopped earning gold entirely once inactive for too long",
      why: "AI empires only submit a command when their planner decides on something other than \"wait\" — and a broke AI stuck waiting never submits anything. Gold income was gated behind the same 12-hour away-from-keyboard cap used for human players, so an AI that went 12 hours without submitting a command (which happens automatically the moment it gets stuck waiting) had its income permanently switched off, with no way back — confirmed on staging, where AI gold was frozen bit-for-bit identical across polls minutes apart.",
      changes: [
        "AI empires are now exempt from the human away-from-keyboard income cap, so they keep earning gold regardless of how long they've been stuck waiting for something worthwhile to do."
      ]
    },
    {
      introducedIn: "2026.07.07.0",
      title: "Warbands tech grants +5% attack and defense",
      why: "Unlocking the Warbands technology previously gave no direct combat stat bonus — its only effect was the attack-vs-settled multiplier, which didn't affect overall attack or defense values. This meant researching an early military tech felt underwhelming compared to economic alternatives.",
      changes: [
        "The Warbands (tribal-warfare) tech now applies +5% attack and +5% defense modifiers globally, matching the stat bonuses that the tech UI has always displayed."
      ]
    },
    {
      introducedIn: "2026.07.06.5",
      title: "AI empires no longer get stuck permanently broke",
      why: "AI-controlled empires were claiming frontier land automatically every tick, which spent gold faster than their income could replenish it. That kept their gold pinned near zero forever, so they could never afford to actually settle any of the land they'd claimed into a producing town — they'd sit with hundreds of claimed tiles but almost no real economy.",
      changes: [
        "AI empires now hold back a small gold reserve before auto-claiming more frontier land, so gold can build up enough to actually settle claimed tiles into towns.",
        "AI empires now favor claiming land diagonally when scouting, which reveals more of the map per tile claimed.",
        "AI empires no longer waste a claim on a tile that has no resource, dock, or town and reveals no new map — they'll wait for a better option instead."
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
