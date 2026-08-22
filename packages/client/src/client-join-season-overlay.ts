import type { ClientState } from "./client-state/client-state.js";

type JoinSeasonOverlayDeps = {
  state: Pick<ClientState, "needsSeasonJoin" | "joinSeasonOverlayOpen" | "joinSeasonId" | "joinSeasonPending">;
  overlayEl: HTMLDivElement;
  renderHud: () => void;
  joinSeason: () => void;
};

// Modeled on client-respawn-overlay.ts: a simple full-screen modal reusing
// the generic .card / .panel-btn / .guide-close-btn classes rather than a
// bespoke themed component.
export const renderJoinSeasonOverlay = (deps: JoinSeasonOverlayDeps): void => {
  const { state, overlayEl, renderHud, joinSeason } = deps;
  const visible = state.needsSeasonJoin && state.joinSeasonOverlayOpen;
  overlayEl.style.display = visible ? "grid" : "none";
  if (!visible) {
    if (overlayEl.innerHTML) overlayEl.innerHTML = "";
    return;
  }

  const seasonLabel = state.joinSeasonId ? `Season ${state.joinSeasonId}` : "the current season";

  overlayEl.innerHTML = `
    <div class="respawn-backdrop" id="join-season-backdrop"></div>
    <div class="respawn-modal card" role="dialog" aria-modal="true" aria-labelledby="join-season-title">
      <button id="join-season-close" class="guide-close-btn" type="button" aria-label="Close join season prompt">×</button>
      <div class="respawn-modal-scroll">
        <div class="respawn-kicker">New season</div>
        <h2 id="join-season-title" class="respawn-title">Join ${seasonLabel}?</h2>
        <p class="respawn-summary">A new season has started. Join now to get your empire?</p>
        <section class="respawn-section respawn-actions">
          <button id="join-season-confirm" class="panel-btn" type="button" ${state.joinSeasonPending ? "disabled" : ""}>
            ${state.joinSeasonPending ? "Joining..." : `Join ${seasonLabel}`}
          </button>
        </section>
      </div>
    </div>
  `;

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
      state.joinSeasonPending = true;
      renderHud();
      joinSeason();
    };
  }
};
