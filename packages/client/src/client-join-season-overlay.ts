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

// renderJoinSeasonOverlay is called on every renderHud() pass -- which fires
// many times a second from ordinary socket/state traffic, not just when this
// overlay's own content changes. Rebuilding overlayEl.innerHTML on every one
// of those calls tore down and recreated the war-room shell's cog element
// each time, restarting its CSS animation from frame 0 before it ever
// completed a visible rotation -- the "vibrating instead of turning" bug.
// This tracks what was actually rendered last time so the expensive rebuild
// (and the animation restart that comes with it) only happens when the
// overlay's actual content changes -- a new roster entry, the count ticking
// up, the branch switching -- not on every unrelated render pass. The live
// countdown digits still update every second via the tick() below, which
// only touches #join-season-countdown's text and never touches the cog.
//
// Stored as a dataset attribute on overlayEl itself, not a module-level
// variable -- this module has no per-instance state otherwise, and a plain
// module-level `let` would leak between independent render sequences (e.g.
// two different overlay elements, or successive unrelated test cases in the
// same module instance) instead of tracking "what THIS element last showed".
const RENDER_KEY_ATTR = "seasonLobbyRenderKey";

const computeRenderKey = (state: JoinSeasonOverlayDeps["state"], visible: boolean): string =>
  !visible
    ? "hidden"
    : JSON.stringify([
        state.seasonPending,
        state.joinSeasonId,
        state.seasonPendingScheduledStartAt,
        state.joinSeasonPending,
        state.seasonLobbyWaitingCount,
        state.seasonLobbyMaxPlayers,
        state.seasonLobbyRoster
      ]);

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
    delete overlayEl.dataset[RENDER_KEY_ATTR];
    return;
  }

  setSeasonLobbyFullscreen(true);

  const renderKey = computeRenderKey(state, visible);
  if (renderKey === overlayEl.dataset[RENDER_KEY_ATTR]) return;
  overlayEl.dataset[RENDER_KEY_ATTR] = renderKey;

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
          <p class="respawn-summary">Everyone begins together so the first move isn't decided by timezone. Starting at <strong>${localStartLabel}</strong> your local time.</p>
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
