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
  version: "2026.06.29.6",
  title: "What's New",
  summary: "Crystal targeting now shows highlighted target tiles and connection lines in 3D mode. 2D overlays no longer render on top of 3D terrain.",
  entries: [
    {
      introducedIn: "2026.06.29.6",
      title: "Crystal targeting overlay and range circles are more visible in 3D",
      why: "The 3D crystal targeting overlay (semi-transparent tiles) and the 3D range circles (airport bombard, observatory, waterworks, sweep) were too faint to see clearly.",
      changes: [
        "Crystal targeting overlay fill opacity increased from 12% to 30%.",
        "Crystal targeting overlay valid target tiles now have a colored border (stroke) matching the 2D overlay style.",
        "Airport Bombard range circle border increased from 40% to 55% and fill from 2.5% to 10%.",
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
    {
      introducedIn: "2026.06.28.3",
      title: "Sky Dock Bombard range now visible in 3D",
      why: "After selecting a Sky Dock and choosing the bombard action, you could not see which tiles were in range — the crystal targeting mode highlighted targets but there was no range overlay on the dock itself.",
      changes: [
        "Selecting an active, owned Sky Dock now shows a red 3D range circle (radius 30 tiles) around it, matching the Observatory and Waterworks range overlays."
      ]
    },
    {
      introducedIn: "2026.06.28.3",
      title: "Hit animations for Sky Dock Bombard",
      why: "Sending a bombard gave no visual feedback — the targeted 3x3 area just disappeared with no impact effect.",
      changes: [
        "When bombard strikes land, the targeted tiles now show a brief orange flash and expanding ring animation lasting 1.5 seconds."
      ]
    },
    {
      introducedIn: "2026.06.28.2",
      title: "Sky Dock Bombard moved to Actions tab (was in Crystal tab)",
      why: "Sky Dock Bombard is tied to a specific tile (Sky Dock) — the same pattern as Worldbreaker Shot. Putting it in the Crystal tab (reserved for global abilities like Aether Bridge or Siphon) was confusing.",
      changes: [
        "Sky Dock Bombard now appears in the Actions tab of the tile menu, not the Crystal tab.",
        "Icon and tooltip description added for the action."
      ]
    },
    {
      introducedIn: "2026.06.28.1",
      title: "Sky Dock Bombard targeting works",
      why: "Clicking an owned Sky Dock tile showed no bombard action — the tile action generator, crystal targeting type, isCrystal filter, and action-flow handler were all missing the airport_bombard case, even though the server's command handler was complete.",
      changes: [
        "Clicking your Sky Dock now shows a 'Sky Dock Bombard' action in the tile menu (costs 1 CRYSTAL, requires active Sky Dock and nearby Aether Tower).",
        "Selecting the action enters crystal targeting mode, highlighting enemy land tiles within 30 tiles as valid targets.",
        "Tapping a highlighted target sends AIRPORT_BOMBARD to the server, clearing the 3×3 area around the target."
      ]
    },
    {
      introducedIn: "2026.06.28.0",
      title: "Season-end overlay — scrolling finally works",
      why: "The .se-scroll-body and .se-scroll-footer elements existed in HTML markup but had zero CSS rules, so the scrollable list never actually scrolled. The overlay also inherited pointer-events: none from #hud, letting wheel events zoom the hidden map underneath.",
      changes: [
        "Added CSS for .se-scroll-body (flex: 1; overflow-y: auto; min-height: 0) and .se-scroll-footer (flex-shrink: 0) — .se-scroll is now a flex column so the body scrolls while the action buttons stay sticky at the bottom",
        "Added pointer-events: auto to #season-end-overlay so wheel/touch events are captured by the overlay instead of passing through to the map",
        "Added touch-action: pan-y to .se-scroll-body so mobile touch scrolling works natively",
        "Added tab bar styling (.se-tab-bar, .se-tab, .se-tab-panel) with brass accents matching the overlay theme",
        "Fixed wheel listener accumulation — guarded by dataset.seWheelReady so the listener is only ever attached once; re-queries .se-scroll-body inside the handler to survive innerHTML rebuilds"
      ]
    },
    {
      introducedIn: "2026.06.27.3",
      title: "Dock-pair attacks now validate the dock connection as a valid attack path",
      why: "Launching an attack from a dock tile to its paired dock on the other side of the water showed the Launch Attack button (via the dockId fallback) but the server rejected it with NOT_ADJACENT because it only checked geometric adjacency and the dockId property on the tile data.",
      changes: [
        "The server's attack validation now checks the authoritative dock link map when deciding if the origin can reach the target. If the origin tile is dock-paired with the target tile, the adjacency requirement is satisfied.",
        "This fixes attacks that were visible in the UI but silently rejected by the server."
      ]
    },
    {
      introducedIn: "2026.06.27.4",
      title: "Season-end overlay gets tabs and sticky buttons",
      why: "The season-end screen was too tall — action buttons scrolled off-screen and you couldn't scroll the leaderboard list in the available space.",
      changes: [
        "Final Standings and Victory Paths are now switchable tabs, keeping the overlay compact.",
        "Start New Season and Look Around buttons are sticky at the bottom and always visible."
      ]
    },
    {
      introducedIn: "2026.06.27.4",
      title: "Stop scroll/zoom leaking to the map behind the overlay",
      why: "Wheel and scroll gestures on the season-end screen were zooming the hidden map underneath, causing disorienting camera jumps when the overlay was dismissed.",
      changes: [
        "The overlay now captures wheel events outside its scrollable area so they no longer reach the map."
      ]
    },
    {
      introducedIn: "2026.06.27.2",
      title: "Season-end overlay no longer stuck invisible",
      why: "The season-end overlay was always present in the DOM but never visible after a season ended — only the initial snapshot carried the season winner, so the overlay stayed hidden.",
      changes: [
        "Live world-status updates now broadcast the season winner too, so the overlay appears the moment a season ends."
      ]
    },
    {
      introducedIn: "2026.06.27.2",
      title: "'You' marker restored in victory conditions",
      why: "The victory condition summary stopped showing the 'You' prefix next to your own empire after a refactor, making it impossible to tell at a glance whether you were leading a given victory path.",
      changes: [
        "The season-end overlay now correctly shows 'You' on the objective gauge you are leading.",
        "When you are not the leader, your personal progress still appears on a separate 'You:' line."
      ]
    },
    {
      introducedIn: "2026.06.27.2",
      title: "Crown now awarded to the season winner, not rank 1",
      why: "The standings table was putting the crown glyph on the row with rank 1 instead of the actual declared season winner — when the winner finished outside first place the crown appeared on the wrong player.",
      changes: [
        "The ♔ crown now appears beside the season winner's name in the final standings, regardless of their leaderboard rank."
      ]
    },
    {
      introducedIn: "2026.06.27.2",
      title: "Muster-advance attacks now consume the correct manpower pool",
      why: "Advance-mode barbarian raids were drawing from the player's global manpower pool instead of the muster flag's staged manpower. The waypoint planner always showed a flat 60 MP cost even when the actual cost differed for barbarian raids (10 MP) or fort targets (garrison-dependent). Activity feed entries were missing entirely for advance-mode attacks.",
      changes: [
        "Advance-mode barbarian attacks now drain the muster flag's staged manpower instead of the player's global pool.",
        "Manual barbarian raids (no muster flag) still draw from the global pool as before.",
        "Waypoint planner manpower cost now shows the correct amount: 10 for barbarian tiles, the fort garrison for fort targets (minimum 60), or 60 for other enemy tiles.",
        "Advance-mode combat results now appear in the activity feed as expected."
      ]
    },
    {
      introducedIn: "2026.06.27.2",
      title: "Food upkeep in economy panel now accurate",
      why: "The economy panel showed lower food upkeep than the server actually deducted (e.g. 0.2/m per City instead of 0.3/m), making it seem like food was inexplicably draining.",
      changes: [
        "Town food upkeep rates in the economy panel now match the actual server-side deduction: City 0.3/m, Great City 0.6/m, Metropolis 1.0/m.",
        "The food net rate in the HUD ribbon and economy cards now correctly reflects what your stockpile will actually lose each tick."
      ]
    },
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
      title: "Muster flags now supply attacks through connected territory up to 10 tiles away",
      why: "Setting a muster flag to advance and letting it capture tiles pushed the front forward, but auto-attacks from distant frontier tiles failed with 'Attack blocked: stage manpower' even though the flag had plenty of manpower.",
      changes: [
        "Muster-advance auto-attacks now correctly use the flag's manpower regardless of distance from the attack source tile.",
        "Manual attacks (Launch Attack) can draw from flags within 10 tiles of the origin instead of the previous 4-tile limit.",
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
