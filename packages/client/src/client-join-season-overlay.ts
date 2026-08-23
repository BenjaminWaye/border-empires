import type { ClientState } from "./client-state/client-state.js";
import type { FeedType, FeedSeverity } from "./client-types.js";
import { renderSeasonLobbyPanelHtml, bindSeasonLobbyPanel } from "./client-season-lobby-panel.js";

type JoinSeasonOverlayDeps = {
  state: Pick<
    ClientState,
    | "needsSeasonJoin"
    | "joinSeasonOverlayOpen"
    | "joinSeasonId"
    | "joinSeasonPending"
    | "seasonPending"
    | "seasonPendingScheduledStartAt"
    | "seasonLobbyWaitingCount"
    | "seasonLobbyMaxPlayers"
    | "seasonLobbyRoster"
  >;
  overlayEl: HTMLDivElement;
  renderHud: () => void;
  joinSeason: () => boolean;
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

const clearCountdownTimer = (): void => {
  if (!countdownTimer) return;
  clearInterval(countdownTimer);
  countdownTimer = undefined;
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

// Both branches below share the same full-screen "war room" shell
// (client-season-lobby-style.css, scoped under #join-season-overlay /
// body.season-lobby-active) and the same lobby panel content
// (renderSeasonLobbyPanelHtml/bindSeasonLobbyPanel: player count + roster).
// They differ only in the join trigger: state.seasonPending shows a live
// countdown to scheduledStartAt and auto-retries JOIN_SEASON once it elapses;
// the plain branch (season already active, player just hasn't joined yet)
// shows a "Join now" button the player clicks themselves -- there's no
// scheduledStartAt to count down to, so its dial reads "Ready" instead.
export const renderJoinSeasonOverlay = (deps: JoinSeasonOverlayDeps): void => {
  const { state, overlayEl, renderHud, joinSeason, pushFeed } = deps;
  const visible = state.needsSeasonJoin && state.joinSeasonOverlayOpen;
  overlayEl.style.display = visible ? "grid" : "none";
  if (!visible) {
    if (overlayEl.innerHTML) overlayEl.innerHTML = "";
    clearCountdownTimer();
    setSeasonLobbyFullscreen(false);
    return;
  }

  setSeasonLobbyFullscreen(true);
  const seasonLabel = state.joinSeasonId ? `Season ${state.joinSeasonId}` : "the current season";

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
          <div class="respawn-kicker">Beta season</div>
          <h2 id="join-season-title" class="respawn-title">Season starts soon</h2>
          <p class="respawn-summary">Same starting line for everyone — the whole season kicks off in one shot, no head starts. (Your timezone still decides how early you're up to seize it.) Gates open <strong>${localStartLabel}</strong> your local time.</p>
          <section class="respawn-section respawn-actions">
            <div id="join-season-countdown" class="respawn-title" style="font-variant-numeric: tabular-nums;">
              ${formatCountdown(scheduledStartAt - Date.now())}
            </div>
          </section>
          ${renderSeasonLobbyPanelHtml(state)}
        </div>
      </div>
    `;

    bindSeasonLobbyPanel({ overlayEl, pushFeed });
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
  overlayEl.innerHTML = `
    <div class="respawn-backdrop" id="join-season-backdrop"></div>
    <div class="respawn-modal card" role="dialog" aria-modal="true" aria-labelledby="join-season-title">
      <button id="join-season-close" class="guide-close-btn" type="button" aria-label="Close join season prompt">×</button>
      <div class="respawn-modal-scroll">
        <div class="respawn-kicker">New season</div>
        <h2 id="join-season-title" class="respawn-title">Join ${seasonLabel}?</h2>
        <p class="respawn-summary">A new season has started. Join now to get your empire?</p>
        <section class="respawn-section respawn-actions">
          <div id="join-season-countdown" class="respawn-title season-lobby-ready-dial">Ready</div>
        </section>
        ${renderSeasonLobbyPanelHtml(state, false)}
        <section class="respawn-section respawn-actions">
          <button id="join-season-confirm" class="panel-btn" type="button" ${state.joinSeasonPending ? "disabled" : ""}>
            ${state.joinSeasonPending ? "Joining..." : `Join ${seasonLabel}`}
          </button>
        </section>
      </div>
    </div>
  `;

  bindSeasonLobbyPanel({ overlayEl, pushFeed });

  const close = (): void => {
    state.joinSeasonOverlayOpen = false;
    renderHud();
  };

  const closeBtn = overlayEl.querySelector("#join-season-close") as HTMLButtonElement | null;
  const backdrop = overlayEl.querySelector("#join-season-backdrop") as HTMLDivElement | null;
  const confirmBtn = overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement | null;

  if (closeBtn) closeBtn.onclick = close;
  if (backdrop) backdrop.onclick = close;
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      if (state.joinSeasonPending) return;
      // Only flip the pending flag if the message actually sent -- sendGameMessage
      // returns false without sending when the session isn't authed yet, and
      // no JOIN_SEASON_ACK/ERROR would ever arrive to clear the flag otherwise.
      if (!joinSeason()) return;
      state.joinSeasonPending = true;
      renderHud();
    };
  }
};
