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
  version: "2026.06.26.4",
  title: "What's New",
  summary: "Shards on expanded tiles are now preserved, and shard rain avoids re-using recently-sharded tiles.",
  entries: [
    {
      introducedIn: "2026.06.26.4",
      title: "Shards no longer vanish when you expand onto a shard tile",
      why: "Expanding to a tile that had a shard silently deleted the shard — the server returned COLLECT_EMPTY even though the client still showed the shard overlay.",
      changes: [
        "Expanding onto a tile with a shard now preserves the shard so you can collect it afterward."
      ]
    },
    {
      introducedIn: "2026.06.26.4",
      title: "Shard rain avoids re-using the same tiles",
      why: "When the eligible tile pool was small, the same tiles got shards dropped on them every rain cycle. This made collection too predictable and rewarded camping known shard spawns.",
      changes: [
        "Tiles that have hosted a shard fall site are no longer eligible for future shard rain events.",
        "Over time the rain spreads to fresh tiles instead of concentrating on the same spots."
      ]
    },
    {
      introducedIn: "2026.06.26.3",
      title: "Muster flags now supply attacks through connected territory up to 20 tiles away",
      why: "Setting a muster flag to advance and letting it capture tiles pushed the front forward, but auto-attacks from distant frontier tiles failed with 'Attack blocked: stage manpower' even though the flag had plenty of manpower.",
      changes: [
        "Muster-advance auto-attacks now correctly use the flag's manpower regardless of distance from the attack source tile.",
        "Manual attacks (Launch Attack) can draw from flags within 20 tiles of the origin instead of the previous 4-tile limit.",
        "The 'Attack blocked: stage manpower on this tile first' error no longer appears when attacking through connected owned territory with a mustered flag in range."
      ]
    },
    {
      introducedIn: "2026.06.26.2",
      title: "No more 'Combat result delayed' spam from auto-attacks",
      why: "Setting a muster flag to advance and leaving it caused a 'Combat result delayed locally; continuing queue.' error after every attack, even though the result was delivered.",
      changes: [
        "Muster-advance auto-attacks now resolve cleanly without showing the 'Combat result delayed' warning.",
        "Combat results from server-initiated attacks appear in the activity feed as expected."
      ]
    },
    {
      introducedIn: "2026.06.26.1",
      title: "No more fake range circle on muster flags",
      why: "Selecting a muster flag showed a small red radius box, implying attacks are limited to that range — but muster attacks have unlimited reach from any flag.",
      changes: [
        "The red reach indicator no longer appears when you tap a muster flag, since the flag can attack any tile regardless of distance."
      ]
    },
    {
      introducedIn: "2026.06.25.2",
      title: "Season-end screen",
      why: "When a season ended there was no real wrap-up — you were just left on a frozen map with a small leaderboard panel.",
      changes: [
        "A full season-end screen now appears when a winner is crowned: the victor, final standings, and how every path to victory played out.",
        "\"Start New Season\" begins a fresh season for everyone (only available once the current season has ended).",
        "\"Look Around\" dismisses the screen so you can roam the final map."
      ]
    },
    {
      introducedIn: "2026.06.25.1",
      title: "Clearer reconnect message",
      why: "If the server restarted mid-session, clicking the map showed 'Finish sign-in before interacting with the map.' — confusing, since you were already signed in.",
      changes: [
        "During a mid-game server reconnect, the map now says 'Server is reconnecting. Please wait a moment.' instead of asking you to sign in again.",
        "The original sign-in prompt still appears only when you genuinely are not signed in yet."
      ]
    },
    {
      introducedIn: "2026.06.24.1",
      title: "Login queue",
      why: "When many players log in at once the server used to reject you with 'Server busy — retry shortly', requiring manual refreshes. Now you wait in a visible queue instead.",
      changes: [
        "If all login slots are taken you are placed in a queue automatically — no refresh needed.",
        "The loading screen shows your position and an estimated wait time.",
        "Your position updates in real time as players ahead of you finish loading.",
        "If you close the tab while waiting your slot is released immediately for the next player."
      ]
    },
    {
      introducedIn: "2026.06.22.2",
      title: "Breakthrough momentum",
      why: "Winning a tile felt disconnected from the next attack — there was no incentive to push into a gap once you made one.",
      changes: [
        "When you capture a tile, the 4 cardinal enemy-owned neighbours enter a 60-second breach window.",
        "Breached tiles have their combat defence reduced by 30%, so a quick follow-up attack is easier to win.",
        "The breach expires naturally — if you don't press the advantage in 60 seconds, the defender's position resets."
      ]
    },
    {
      introducedIn: "2026.06.22.2",
      title: "Empire Integrity",
      why: "Wide, sprawling empires were just as effective as tight blobs — there was no economic reward for building defensible shapes.",
      changes: [
        "Compact empires now earn an income and population-growth bonus proportional to their defensibility score.",
        "At 100% defensibility the bonus is +15% income and +10% growth; at 0% it becomes −15% / −10%.",
        "The bonus is visible in the Empire Integrity panel (renamed from Defensibility).",
        "AI players also prefer settling tiles that improve the compactness of their empire."
      ]
    },
    {
      introducedIn: "2026.06.22.1",
      title: "Waterworks boost working",
      why: "Waterworks was not applying its +50% food bonus to Farmstead tiles in range, and there was no way to see which tiles the Waterworks affected.",
      changes: [
        "Waterworks now correctly boosts a Farm+Farmstead tile from 108/day to 162/day when within 10 tiles.",
        "Selecting an active Waterworks you own shows a green range box (radius 10) on the map.",
        "Tile detail panel now shows the correct boosted rate when you click on a Farm+Farmstead tile near an active Waterworks."
      ]
    },
    {
      introducedIn: "2026.06.21.1",
      title: "Muster-advance combat visuals",
      why: "Muster-advance auto-attacks were invisible — there was no way to see where your far-flung colonies were fighting, and the silent capture popup was noisy for automatic actions.",
      changes: [
        "Muster-advance attacks now show a supply line from the muster source to the target tile.",
        "Combat dots appear on the target tile during auto-attack resolution — your empire color vs. a dark defender swarm.",
        "The result popup is suppressed for muster-advance attacks (feed entry still appears)."
      ]
    },
    {
      introducedIn: "2026.06.19.1",
      title: "Barbarian attacks restored",
      why: "Barbarian attacks were being blocked by the player muster requirement, even though barbarians do not stage muster flags.",
      changes: [
        "Barbarian-origin attacks now use their per-tile cooldown instead of looking for staged muster or manpower.",
        "Player attacks still require staged muster, except for the existing cheap raid path against barbarian tiles."
      ]
    },
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
