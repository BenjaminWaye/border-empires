import { MUSTER_ATTACK_COST, requiredMusterForFort } from "@border-empires/shared";
import { buildArrowGestureSetMusterPayload } from "./client-arrow-gesture-confirm-payload.js";
import { MUSTER_COMMIT_PRESET_MULTIPLIERS, musterCommitPresetAmount, type MusterCommitPreset } from "./client-muster-commit-tab/client-muster-commit-tab.js";
import type { ArrowGesturePoint } from "./client-arrow-gesture-confirm-payload.js";
import type { ClientState } from "./client-state/client-state.js";
import { triggerWinChancePaintOnMarchArm } from "./client-win-chance-paint-trigger.js";

// F-revision (docs/replenishment-update-plan.md, "the hold-drag gesture is
// replaced by click-to-target"): the confirm sheet shown after a March-To
// target click (client-arrow-gesture-confirm.ts's seam). Self-contained DOM
// overlay, mounted on document.body and torn down on dismiss -- same
// pattern as client-trickle-pick-modal.ts's promptFor* modal (own <div>,
// own inline styles, Escape/backdrop-click to cancel) rather than reusing
// client-tile-action-menu-ui.ts's tile-menu element, since this sheet isn't
// about a tile menu tab and has no fixed tile to anchor to reliably (the
// target tile may be off-screen).
//
// Reuses client-muster-commit-tab.ts's preset multipliers/amount helper for
// the Normal/Extra/Double buttons rather than reimplementing that math, and
// client-win-chance-paint-trigger.ts's label trigger -- called once on open
// and again on every slider/preset change, passing the currently chosen
// commitManpower so the win-chance labels along the arrow are slider-live
// (the old hold-drag version computed them once at the target's base cost
// and never updated them against the chosen commitment).

export type ArrowGestureConfirmSheetDeps = {
  sendGameMessage: (payload: unknown) => boolean;
  renderHud: () => void;
};

/** Slider floor: the target tile's fort requirement if settled, else the generic attack cost -- same rule buildMusterCommitView uses. */
const floorForTarget = (state: Pick<ClientState, "tiles">, target: ArrowGesturePoint, keyFor: (x: number, y: number) => string): number => {
  const targetTile = state.tiles.get(keyFor(target.x, target.y));
  return targetTile?.ownershipState === "SETTLED"
    ? requiredMusterForFort(targetTile.fort?.status === "active" ? targetTile.fort.variant : undefined)
    : MUSTER_ATTACK_COST;
};

let activeSheet: { overlay: HTMLDivElement; onKey: (event: KeyboardEvent) => void } | undefined;

/** Tears down any currently-shown confirm sheet without sending anything. Safe to call when none is shown. */
export const hideArrowGestureConfirmSheet = (): void => {
  if (!activeSheet) return;
  document.removeEventListener("keydown", activeSheet.onKey);
  if (activeSheet.overlay.parentNode) activeSheet.overlay.parentNode.removeChild(activeSheet.overlay);
  activeSheet = undefined;
};

/**
 * Shows the confirm sheet for a just-confirmed arrow-drag gesture from
 * `origin` to `target`. Clears `state.pendingArrowGestureConfirm` on both
 * "Go" and cancel/dismiss -- there is at most one pending confirm at a time.
 */
export const showArrowGestureConfirmSheet = (
  state: Pick<ClientState, "tiles" | "manpowerCap" | "pendingArrowGestureConfirm" | "arrowGesture" | "me" | "winChancePaint">,
  origin: ArrowGesturePoint,
  target: ArrowGesturePoint,
  keyFor: (x: number, y: number) => string,
  deps: ArrowGestureConfirmSheetDeps
): void => {
  if (typeof document === "undefined" || !document.body) return;
  hideArrowGestureConfirmSheet();

  const floor = floorForTarget(state, target, keyFor);
  const cap = Math.max(floor, state.manpowerCap);
  let commitManpower = Math.min(cap, floor);

  const recomputeWinChance = (): void => {
    triggerWinChancePaintOnMarchArm(state, origin.x, origin.y, target.x, target.y, "visible", keyFor, performance.now(), {
      committedManpower: commitManpower,
      baseMusterCost: floor
    });
  };
  recomputeWinChance();

  const dismiss = (): void => {
    state.pendingArrowGestureConfirm = undefined;
    state.arrowGesture = undefined;
    hideArrowGestureConfirmSheet();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") dismiss();
  };

  const overlay = document.createElement("div");
  overlay.className = "arrow-gesture-confirm-overlay";
  overlay.setAttribute("role", "presentation");
  overlay.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:9999",
    "display:flex",
    "align-items:flex-end",
    "justify-content:flex-end"
  ].join(";");

  const card = document.createElement("div");
  card.className = "arrow-gesture-confirm-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "false");
  card.style.cssText = [
    "width:280px",
    "padding:14px 16px",
    "background:#161b29",
    "color:#e6e9f2",
    "border:1px solid #2a3247",
    "border-radius:10px",
    "box-shadow:0 14px 40px rgba(0,0,0,0.55)",
    "font-family:inherit"
  ].join(";");

  card.innerHTML = `
    <h3 style="margin:0 0 6px;font-size:14px;letter-spacing:0.01em;">Commit march to (${target.x}, ${target.y})</h3>
    <p style="margin:0 0 10px;color:#9aa6c2;font-size:12px;line-height:1.4;">From (${origin.x}, ${origin.y})</p>
    <input type="range" data-arrow-confirm-slider min="${floor}" max="${cap}" value="${commitManpower}" style="width:100%;" />
    <div style="display:flex;justify-content:space-between;margin:2px 0 10px;font-size:12px;color:#9aa6c2;">
      <span>Manpower: <span data-arrow-confirm-value>${commitManpower}</span></span>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:12px;">
      ${(Object.keys(MUSTER_COMMIT_PRESET_MULTIPLIERS) as MusterCommitPreset[])
        .map((key) => {
          const amount = Math.min(cap, musterCommitPresetAmount(key, floor));
          const label = key === "normal" ? "Normal" : key === "extra" ? "Extra" : "Double";
          return `<button type="button" data-arrow-confirm-preset="${amount}" style="flex:1;padding:6px 0;background:#1c2335;border:1px solid #2a3247;color:#e6e9f2;border-radius:6px;cursor:pointer;font-size:12px;">${label}</button>`;
        })
        .join("")}
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button type="button" data-arrow-confirm-cancel style="padding:8px 14px;background:transparent;border:1px solid #2a3247;color:#9aa6c2;border-radius:6px;cursor:pointer;">Cancel</button>
      <button type="button" data-arrow-confirm-go style="padding:8px 14px;background:#3a5286;border:1px solid #3a5286;color:#fff;border-radius:6px;cursor:pointer;">Go</button>
    </div>
  `;

  overlay.appendChild(card);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) dismiss();
  });

  const slider = card.querySelector<HTMLInputElement>("[data-arrow-confirm-slider]");
  const valueEl = card.querySelector<HTMLElement>("[data-arrow-confirm-value]");
  if (slider) {
    slider.oninput = () => {
      commitManpower = Number(slider.value);
      if (valueEl) valueEl.textContent = String(commitManpower);
      recomputeWinChance();
    };
  }
  card.querySelectorAll<HTMLButtonElement>("[data-arrow-confirm-preset]").forEach((btn) => {
    btn.onclick = () => {
      const amount = Number(btn.dataset.arrowConfirmPreset);
      if (!Number.isFinite(amount)) return;
      commitManpower = amount;
      if (slider) slider.value = String(amount);
      if (valueEl) valueEl.textContent = String(amount);
      recomputeWinChance();
    };
  });
  const cancelBtn = card.querySelector<HTMLButtonElement>("[data-arrow-confirm-cancel]");
  if (cancelBtn) cancelBtn.onclick = () => dismiss();
  const goBtn = card.querySelector<HTMLButtonElement>("[data-arrow-confirm-go]");
  if (goBtn) {
    goBtn.onclick = () => {
      deps.sendGameMessage(buildArrowGestureSetMusterPayload(origin, target, commitManpower));
      state.pendingArrowGestureConfirm = undefined;
      state.arrowGesture = undefined;
      hideArrowGestureConfirmSheet();
      deps.renderHud();
    };
  }

  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  activeSheet = { overlay, onKey };
};
