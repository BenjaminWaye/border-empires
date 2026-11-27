import type { ClientState } from "./client-state/client-state.js";
import type { FeedType, FeedSeverity } from "./client-types.js";
import { renderSeasonLobbyPanelHtml, bindSeasonLobbyPanel } from "./client-season-lobby-panel.js";
import { joinClosedHtml, lateJoinFacts, lateJoinWarningHtml, waitButtonHtml } from "./client-join-season-late-join/client-join-season-late-join.js";
import { sectorListHtml } from "./client-sector-list/client-sector-list.js";
import { syncJoinSeasonReopenButton } from "./client-join-season-reopen/client-join-season-reopen.js";
import { canFundSectors, refreshSectorListIfNeeded } from "./client-sector-list/client-sector-list-loader.js";
import { joinNowHtml } from "./client-join-now-html/client-join-now-html.js";
import { joinWaitingHtml, waitingEmailHtml, waitingEmailStatus } from "./client-join-season-waiting/client-join-season-waiting.js";
import { bindJoinWaiting, JOIN_WAITING_TAB_ATTR } from "./client-join-season-waiting/client-join-season-waiting-bind.js";
import { standingsLedger } from "./client-season-end-overlay/client-standings-html.js";
import { getEmailNotificationPrefs } from "./client-email-notifications/client-email-notification-prefs-storage.js";

type JoinSeasonOverlayDeps = {
  state: Pick<
    ClientState,
    | "needsSeasonJoin"
    | "joinSeasonOverlayOpen"
    | "joinSeasonId"
    | "joinSeasonPending"
    | "joinSeasonWaiting"
    | "authIsGuest"
    | "authEmail"
    | "leaderboard"
    | "playerColors"
    | "me"
    | "seasonPending"
    | "seasonPendingScheduledStartAt"
    | "seasonLobbyWaitingCount"
    | "seasonLobbyMaxPlayers"
    | "seasonLobbyRoster"
    | "profileSetupRequired"
    | "seasonWinner"
    | "seasonStartedAt"
    | "singleContest"
    | "joinSeasonClosedMessage"
    | "sectorListRows"
    | "sectorListLoadedFor"
  >;
  overlayEl: HTMLDivElement;
  renderHud: () => void;
  joinSeason: () => boolean;
  /** The main gateway's WebSocket URL; with it the card lists the running Sector Contests (client-sector-list/). */
  wsUrl?: string;
  pushFeed?: ((message: string, type: FeedType, severity?: FeedSeverity) => void) | undefined;
};

const formatCountdown = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

// One shared interval driving every live countdown tick + auto-retry, so a
// re-render of the overlay never leaks a duplicate timer.
let countdownTimer: ReturnType<typeof setInterval> | undefined;

// Dataset key caching what the overlay last rendered; see the note above
// renderJoinSeasonOverlay for why the rebuild is skipped when unchanged.
const RENDER_KEY_ATTR = "seasonLobbyRenderKey";

// The "Joining..." state clears only on JOIN_SEASON_ACK / ERROR. If neither ever
// arrives (dropped socket, stalled simulation) the button used to stay disabled
// forever with no explanation, so a stuck join is given up on after this long.
// It sits above the gateway's own join timeouts so a real error normally wins.
export const JOIN_SEASON_PENDING_WATCHDOG_MS = 30_000;
const JOIN_SLOW_HINT_AFTER_SECONDS = 10;
let joinPendingWatchdog: ReturnType<typeof setTimeout> | undefined;
let joinWaitTicker: ReturnType<typeof setInterval> | undefined;
let joinPendingStartedAt = 0;
let joinPendingOverlay: HTMLDivElement | undefined;

// Wait-time copy shown under the animated button. The first wait after a click
// is normally a couple of seconds; past that the sim is busy, and saying so
// stops a slow join from reading as a frozen page.
export const joinWaitHint = (elapsedSeconds: number): string =>
  elapsedSeconds >= JOIN_SLOW_HINT_AFTER_SECONDS
    ? `Taking longer than usual, still working... ${elapsedSeconds}s`
    : `Usually takes just a few seconds... ${elapsedSeconds}s`;

const currentJoinWaitHint = (): string =>
  joinWaitHint(joinPendingStartedAt ? Math.max(0, Math.floor((Date.now() - joinPendingStartedAt) / 1000)) : 0);

const clearJoinPendingWatchdog = (): void => {
  if (joinPendingWatchdog) clearTimeout(joinPendingWatchdog);
  if (joinWaitTicker) clearInterval(joinWaitTicker);
  joinPendingWatchdog = undefined;
  joinWaitTicker = undefined;
  joinPendingStartedAt = 0;
  joinPendingOverlay = undefined;
};

// Starts the give-up timer and the once-a-second hint update. The ticker only
// rewrites the hint's text -- never the overlay's innerHTML -- so it can't
// restart the join button's spinner/sheen animation (see the render-key note).
const armJoinPendingWatchdog = (deps: JoinSeasonOverlayDeps): void => {
  const { state, overlayEl, renderHud, pushFeed } = deps;
  // Idempotent per overlay: a re-render mid-join (e.g. a roster update) must
  // not restart the wait, but a different overlay element starts fresh.
  if (joinPendingStartedAt && joinPendingOverlay === overlayEl) return;
  clearJoinPendingWatchdog();
  joinPendingStartedAt = Date.now();
  joinPendingOverlay = overlayEl;
  // The spinner is drawn from cached HTML (see RENDER_KEY_ATTR), so if the
  // pending flag is cleared somewhere that never re-renders the overlay (an
  // ERROR path that returns early), the "Joining..." button would spin on
  // forever. Both timers force a fresh render once the flag is gone.
  const rerenderSettled = (): void => {
    clearJoinPendingWatchdog();
    delete overlayEl.dataset[RENDER_KEY_ATTR];
    renderHud();
  };
  joinPendingWatchdog = setTimeout(() => {
    if (state.joinSeasonPending) {
      state.joinSeasonPending = false;
      pushFeed?.("Joining the Sector Contest is taking too long. Try again.", "error", "warn");
    }
    rerenderSettled();
  }, JOIN_SEASON_PENDING_WATCHDOG_MS);
  joinWaitTicker = setInterval(() => {
    if (!state.joinSeasonPending) {
      rerenderSettled();
      return;
    }
    const hintEl = overlayEl.querySelector("#join-season-wait-hint");
    if (hintEl) hintEl.textContent = currentJoinWaitHint();
  }, 1_000);
};

const clearCountdownTimer = (): void => {
  if (!countdownTimer) return;
  clearInterval(countdownTimer);
  countdownTimer = undefined;
};

// renderJoinSeasonOverlay is called on every renderHud() pass -- which fires
// many times a second from ordinary socket/state traffic, not just when this
// overlay's own content changes. Rebuilding overlayEl.innerHTML on every one
// of those calls tore down and recreated every animated element (originally
// a decorative cog, now the join button's spinner and sheen) each time,
// restarting its CSS animation from frame 0 before it ever completed a
// visible rotation -- the "vibrating instead of turning" bug.
// This tracks what was actually rendered last time so the expensive rebuild
// (and the animation restart that comes with it) only happens when the
// overlay's actual content changes -- a new roster entry, the count ticking
// up, the branch switching -- not on every unrelated render pass. The live
// countdown digits still update every second via the tick() below, which
// only touches #join-season-countdown's text and never rebuilds the panel.
//
// Stored as a dataset attribute on overlayEl itself, not a module-level
// variable -- this module has no per-instance state otherwise, and a plain
// module-level `let` would leak between independent render sequences (e.g.
// two different overlay elements, or successive unrelated test cases in the
// same module instance) instead of tracking "what THIS element last showed".

const computeRenderKey = (state: JoinSeasonOverlayDeps["state"], visible: boolean): string =>
  !visible
    ? "hidden"
    : JSON.stringify([
        state.seasonPending,
        state.joinSeasonId,
        state.seasonPendingScheduledStartAt,
        state.joinSeasonPending,
        // The lobby count/roster is only shown in the pending countdown; in
        // the running-contest card an update must not rebuild the spinner.
        state.seasonPending ? [state.seasonLobbyWaitingCount, state.seasonLobbyMaxPlayers, state.seasonLobbyRoster] : null,
        // The honest card's day/bonus lines and the closed card (client-join-season-late-join.ts).
        state.seasonPending ? null : [state.seasonStartedAt, state.singleContest, state.joinSeasonClosedMessage, state.sectorListRows],
        // The waiting view (client-join-season-waiting/) and its email line.
        state.joinSeasonWaiting
          ? [state.authIsGuest, state.authEmail, getEmailNotificationPrefs().seasonStart, waitingStandingsKey(state)]
          : null
      ]);

// The waiting view's standings change with every leaderboard push; only what it draws counts.
const waitingStandingsKey = (state: Pick<ClientState, "leaderboard" | "playerColors">): unknown => [
  state.leaderboard.overall.map((e) => [e.id, e.name, e.rank, e.score, e.tiles, e.incomePerMinute, e.techs, state.playerColors.get(e.id)]),
  state.leaderboard.selfOverall?.id,
  state.leaderboard.selfOverall?.rank
];

// Closes the card and leaves the HUD reachable (the close and wait buttons).
const bindDismiss = (overlayEl: HTMLDivElement, selector: string, state: { joinSeasonOverlayOpen: boolean }, renderHud: () => void): void => {
  const button = overlayEl.querySelector(selector) as HTMLButtonElement | null;
  if (!button) return;
  button.onclick = () => {
    state.joinSeasonOverlayOpen = false;
    renderHud();
  };
};

// "Wait for the next contest" (and ×) switch the card to the waiting view.
const bindWait = (overlayEl: HTMLDivElement, selector: string, state: { joinSeasonWaiting: boolean }, renderHud: () => void): void => {
  const button = overlayEl.querySelector(selector) as HTMLButtonElement | null;
  if (!button) return;
  button.onclick = () => {
    state.joinSeasonWaiting = true;
    renderHud();
  };
};

// Land now (the join card) and Land now instead (the waiting view).
const bindConfirm = (overlayEl: HTMLDivElement, state: { joinSeasonPending: boolean; joinSeasonWaiting: boolean }, joinSeason: () => boolean, renderHud: () => void): void => {
  const confirmBtn = overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement | null;
  if (!confirmBtn) return;
  confirmBtn.onclick = () => {
    if (state.joinSeasonPending) return;
    // Only flip the pending flag if the message actually sent -- sendGameMessage
    // returns false without sending when the session isn't authed yet, and
    // no JOIN_SEASON_ACK/ERROR would ever arrive to clear the flag otherwise.
    if (!joinSeason()) return;
    state.joinSeasonPending = true;
    state.joinSeasonWaiting = false;
    renderHud();
  };
};

// While the join-season overlay is up (either branch), this becomes the ONLY
// thing on screen: client-runtime-loop.ts checks it to skip canvas/world
// rendering entirely, and client-season-lobby-style.css uses it to hide
// #game-surface and every other #hud child. Cleared as soon as the overlay
// stops being the active view (join succeeds or the overlay closes).
const setSeasonLobbyFullscreen = (active: boolean): void => {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("season-lobby-active", active);
};

// Two branches share the full-screen shell (client-season-lobby-style.css,
// scoped under #join-season-overlay / body.season-lobby-active):
// state.seasonPending shows a live countdown to scheduledStartAt with the
// lobby panel (count/roster, Discord, invite) and auto-retries JOIN_SEASON
// once it elapses; the plain branch (contest already running) joins the
// player automatically and only shows a short "joining" card.
export const renderJoinSeasonOverlay = (deps: JoinSeasonOverlayDeps): void => {
  const { state, overlayEl, renderHud, joinSeason } = deps;
  // Profile setup (name/color) must complete before the join-season overlay
  // ever takes over the screen -- a brand-new player needs both a name and a
  // tile color before joining a season and appearing in its roster. Without
  // this check, a new player hitting a pending/newly-started season saw the
  // join-season overlay go full-screen (see setSeasonLobbyFullscreen below)
  // and hide #auth-overlay along with the rest of #hud, silently skipping
  // the name/color picker entirely -- there was simply no screen left to
  // show it on.
  // Once the season has a winner it is over: nobody can join it (the
  // simulation rejects JoinSeason), so the season-end screen is shown
  // instead of a "Let's go!" prompt that could only ever fail.
  const visible = state.needsSeasonJoin && state.joinSeasonOverlayOpen && !state.profileSetupRequired && !state.seasonWinner;
  overlayEl.style.display = visible ? "grid" : "none";
  syncJoinSeasonReopenButton({ ...state, profileSetupRequired: state.profileSetupRequired === true }, () => {
    state.joinSeasonWaiting = false; // the reopen button reads "Join this Sector Contest": back to the join card
    state.joinSeasonOverlayOpen = true;
    renderHud();
  });
  if (!visible) {
    if (overlayEl.innerHTML) overlayEl.innerHTML = "";
    clearCountdownTimer();
    clearJoinPendingWatchdog();
    setSeasonLobbyFullscreen(false);
    delete overlayEl.dataset[RENDER_KEY_ATTR];
    return;
  }

  setSeasonLobbyFullscreen(true);
  // Before the render-key check, so the once-a-minute refresh runs while the card sits unchanged.
  if (!state.seasonPending && deps.wsUrl) refreshSectorListIfNeeded({ state, wsUrl: deps.wsUrl, renderHud });

  const renderKey = computeRenderKey(state, visible);
  if (renderKey === overlayEl.dataset[RENDER_KEY_ATTR]) return;
  overlayEl.dataset[RENDER_KEY_ATTR] = renderKey;

  if (state.joinSeasonPending) armJoinPendingWatchdog(deps);
  else clearJoinPendingWatchdog();

  if (state.seasonPending) {
    const scheduledStartAt = state.seasonPendingScheduledStartAt;
    const localStartLabel = new Date(scheduledStartAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
    overlayEl.innerHTML = `
      <div class="respawn-backdrop" id="join-season-backdrop"></div>
      <div class="respawn-modal card" role="dialog" aria-modal="true" aria-labelledby="join-season-title">
        <div class="respawn-modal-scroll">
          <div class="respawn-kicker">Beta Sector Contest</div>
          <h2 id="join-season-title" class="respawn-title">Sector Contest starts soon</h2>
          <p class="respawn-summary">Same starting line for everyone — the whole Sector Contest kicks off in one shot, no head starts. (Your timezone still decides how early you're up to seize it.) Gates open <strong>${localStartLabel}</strong> your local time.</p>
          <section class="respawn-section respawn-actions">
            <div id="join-season-countdown" class="respawn-title" style="font-variant-numeric: tabular-nums;">
              ${formatCountdown(scheduledStartAt - Date.now())}
            </div>
          </section>
          ${renderSeasonLobbyPanelHtml(state)}
        </div>
      </div>
    `;

    bindSeasonLobbyPanel({ overlayEl });
    clearCountdownTimer();
    const tick = (): void => {
      const countdownEl = overlayEl.querySelector("#join-season-countdown") as HTMLElement | null;
      const remainingMs = scheduledStartAt - Date.now();
      if (countdownEl) countdownEl.textContent = formatCountdown(remainingMs);
      // A few seconds of slack past the scheduled time before retrying, so
      // the gateway/simulation aren't hammered by every held client retrying
      // in the exact same instant the clock hits zero.
      if (remainingMs <= -3_000 && !state.joinSeasonPending) {
        clearCountdownTimer();
        if (joinSeason()) {
          state.joinSeasonPending = true;
          renderHud();
        }
      }
    };
    tick();
    countdownTimer = setInterval(tick, 1_000);
    return;
  }

  clearCountdownTimer();
  // The contest is running. GDD §6: the player chooses, after an honest
  // warning (contest day, landing manpower, high difficulty), to land now
  // or wait for the next contest. This replaced sending every player
  // straight in. A NO_LANDING_SITE reply turns the card into the closed one.
  // The running Sector Contests, full ones greyed out, and funding a new one when none has room.
  const sectorRows = state.sectorListRows ?? [];
  const listHtml = sectorListHtml(sectorRows, canFundSectors());
  if (state.joinSeasonClosedMessage) {
    overlayEl.innerHTML = joinClosedHtml(state.joinSeasonClosedMessage, listHtml);
    bindDismiss(overlayEl, "#join-season-close", state, renderHud);
    return;
  }
  const landDisabled = sectorRows.some((row) => row.here && row.noLandingSite);
  if (state.joinSeasonWaiting && !state.joinSeasonPending && !state.singleContest) {
    const emailStatus = waitingEmailStatus({ authIsGuest: state.authIsGuest, authEmail: state.authEmail, seasonStartEmailOn: getEmailNotificationPrefs().seasonStart });
    overlayEl.innerHTML = joinWaitingHtml({
      emailHtml: waitingEmailHtml(emailStatus, state.authEmail),
      sectorListHtml: sectorListHtml(sectorRows, canFundSectors(), true),
      standingsHtml: state.leaderboard.overall.length > 0
        ? standingsLedger(state.leaderboard, state.playerColors, state.leaderboard.selfOverall?.id || state.me || undefined, undefined, "Current Standings")
        : "",
      landDisabled,
      tab: overlayEl.dataset[JOIN_WAITING_TAB_ATTR] === "standings" ? "standings" : "sectors"
    });
    bindJoinWaiting(overlayEl, { state, renderHud });
    bindConfirm(overlayEl, state, joinSeason, renderHud);
    return;
  }
  if (state.joinSeasonPending) armJoinPendingWatchdog(deps);
  const joining = state.joinSeasonPending;
  overlayEl.innerHTML = joinNowHtml({
    joining,
    waitHintHtml: joining ? `<p id="join-season-wait-hint" class="season-lobby-join-wait-hint">${currentJoinWaitHint()}</p>` : "",
    warningHtml: lateJoinWarningHtml(lateJoinFacts(Date.now(), state.seasonStartedAt), state.singleContest),
    waitButtonHtml: waitButtonHtml(state.singleContest),
    sectorListHtml: listHtml,
    landDisabled
  });
  // On a hosted sector there is no next contest: "Not now" and × just close the card.
  // Otherwise both lead to the waiting view, since the unjoined map is all fog.
  if (state.singleContest) {
    bindDismiss(overlayEl, "#join-season-wait", state, renderHud);
    bindDismiss(overlayEl, "#join-season-close", state, renderHud);
  } else {
    bindWait(overlayEl, "#join-season-wait", state, renderHud);
    bindWait(overlayEl, "#join-season-close", state, renderHud);
  }

  bindConfirm(overlayEl, state, joinSeason, renderHud);
};
