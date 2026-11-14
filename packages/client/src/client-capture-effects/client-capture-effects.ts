import { shouldFinalizePredictedCombat } from "../client-predicted-combat/client-predicted-combat.js";
import { BATTLE_OVERLAY_TOTAL_MS } from "../client-map-3d-popup-marine/popup-marine-overlay-fx.js";
import { victoryHoldAlertDetail, victoryHoldAlertTitle } from "../client-victory-alert/client-victory-alert.js";
import type { ClientState } from "../client-state/client-state.js";
import { setTextWithResourceIcons } from "../client-resource-icons/client-resource-icons.js";
import { frontierAttackIsUndefended } from "../client-capture-hold/client-capture-hold.js";
import { noteCaptureCardAutoHidden } from "./client-capture-ghost-tap.js";

export const renderCaptureProgress = (
  state: Pick<
    ClientState,
    | "captureAlert"
    | "capture"
    | "tiles"
    | "pendingCombatReveal"
    | "activeBattles"
  >,
  deps: {
    keyFor: (x: number, y: number) => string;
    formatCooldownShort: (ms: number) => string;
    showCaptureAlert: (title: string, detail: string, tone?: "success" | "error" | "warn", manpowerLoss?: number, focus?: { x: number; y: number; actionLabel?: string }) => void;
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    finalizePredictedCombat: (result: Record<string, unknown>) => void;
    captureCardEl: HTMLElement;
    captureWrapEl: HTMLElement;
    captureCancelBtn: HTMLElement;
    captureDismissBtn: HTMLElement;
    captureCloseBtn: HTMLElement;
    captureReportBugBtn: HTMLElement;
    captureBarEl: HTMLElement;
    captureTitleEl: HTMLElement;
    captureTimeEl: HTMLElement;
    captureTargetEl: HTMLElement;
    // "Go to tile" / "Center" button for the capture-alert popup, mirroring
    // the Activity Feed's focus button (client-panel-html.ts) -- driven by
    // the same data-feed-focus-x/-y attributes the generic wiring in
    // client-hud.ts already picks up, so no separate click handler is needed
    // here, only keeping its dataset and visibility in sync with the alert.
    captureGotoBtn: HTMLButtonElement;
  }
): void => {
  if (state.captureAlert && state.captureAlert.until > Date.now()) {
    deps.captureCardEl.dataset.state = state.captureAlert.tone;
    deps.captureCardEl.style.display = "grid";
    deps.captureWrapEl.style.display = "block";
    deps.captureCancelBtn.style.display = "none";
    deps.captureDismissBtn.style.display = "none";
    deps.captureCloseBtn.style.display = "inline-flex";
    deps.captureReportBugBtn.style.display = state.captureAlert.timeout ? "inline-flex" : "none";
    deps.captureBarEl.style.width = "100%";
    deps.captureTitleEl.textContent = state.captureAlert.title;
    deps.captureTimeEl.textContent = state.captureAlert.manpowerLoss ? `-${state.captureAlert.manpowerLoss} MP` : "";
    deps.captureTimeEl.classList.toggle("capture-loss", Boolean(state.captureAlert.manpowerLoss));
    setTextWithResourceIcons(deps.captureTargetEl, state.captureAlert.detail);
    if (typeof state.captureAlert.focusX === "number" && typeof state.captureAlert.focusY === "number") {
      deps.captureGotoBtn.style.display = "inline-flex";
      deps.captureGotoBtn.dataset.feedFocusX = String(state.captureAlert.focusX);
      deps.captureGotoBtn.dataset.feedFocusY = String(state.captureAlert.focusY);
      deps.captureGotoBtn.textContent = state.captureAlert.actionLabel ?? "Center";
    } else {
      deps.captureGotoBtn.style.display = "none";
      delete deps.captureGotoBtn.dataset.feedFocusX;
      delete deps.captureGotoBtn.dataset.feedFocusY;
    }
    return;
  }
  delete deps.captureCardEl.dataset.state;
  // Closed on its own (the ✕ clears captureAlert first): guard the spot it covered against a late tap.
  if (state.captureAlert && deps.captureCardEl.style.display !== "none") noteCaptureCardAutoHidden(deps.captureCardEl.getBoundingClientRect(), Date.now());
  state.captureAlert = undefined;

  deps.captureGotoBtn.style.display = "none";
  delete deps.captureGotoBtn.dataset.feedFocusX;
  delete deps.captureGotoBtn.dataset.feedFocusY;
  // An attack or claim in progress no longer gets a "Capturing Territory..."
  // banner with a countdown: several attacks can now resolve at once, and
  // each one already shows its own progress on the map (skirmish, claim
  // plate, marching company) and in its tile menu. The card only appears for
  // results and errors (captureAlert above).
  hideCaptureCard(deps);
  if (state.capture && !state.capture.silent) revealLockedCombatResult(state, deps);
};

type CaptureCardEls = Pick<
  Parameters<typeof renderCaptureProgress>[1],
  "captureCardEl" | "captureWrapEl" | "captureCancelBtn" | "captureDismissBtn" | "captureCloseBtn" | "captureReportBugBtn" | "captureBarEl" | "captureTitleEl" | "captureTimeEl" | "captureTargetEl"
>;

const hideCaptureCard = (deps: CaptureCardEls): void => {
  deps.captureCardEl.style.display = "none";
  deps.captureWrapEl.style.display = "none";
  deps.captureCancelBtn.style.display = "none";
  deps.captureDismissBtn.style.display = "none";
  deps.captureCloseBtn.style.display = "none";
  deps.captureReportBugBtn.style.display = "none";
  deps.captureBarEl.style.width = "0%";
  deps.captureTitleEl.textContent = "";
  deps.captureTimeEl.textContent = "";
  deps.captureTargetEl.textContent = "";
};

/**
 * Once the attack in the dispatch slot (state.capture) passes its resolve
 * time, show the result the server locked at COMBAT_START, or finalize it
 * outright, without waiting for the COMBAT_RESULT round trip.
 */
const revealLockedCombatResult = (
  state: Parameters<typeof renderCaptureProgress>[0],
  deps: Parameters<typeof renderCaptureProgress>[1]
): void => {
  const capture = state.capture;
  if (!capture) return;
  const captureTargetKey = deps.keyFor(capture.target.x, capture.target.y);
  const now = Date.now();
  const awaitingResult = now > capture.resolvesAt;
  // Don't reveal the result until the local battle overlay FX
  // (walking-arrow/skirmish + clash/rout) has actually finished playing at
  // this target tile — resolvesAt is the server's own combat-lock clock and
  // can elapse well before (or without ever triggering) the client's visual
  // animation, which otherwise produces a battle-decided banner while the
  // arrow is still mid-approach, or before the skirmish has rendered at
  // all. Prefer the real FX's endAt when one is already registered
  // (client-battle-overlay.ts); otherwise fall back to a flat
  // BATTLE_OVERLAY_TOTAL_MS grace window past resolvesAt so the reveal
  // still can't outrun a FX that simply hasn't arrived yet.
  //
  // Exception: an ATTACK on a known-FRONTIER (undefended) target never
  // gets a combat broadcast at all (see runtime-lock-resolution.ts's
  // hasDefendingForce) — there is no battle FX coming, ever, so waiting
  // out that grace window would just delay the "captured" reveal for no
  // reason. The claim-plate/expand-style animation it gets instead
  // (client-map-3d-frontier-claim-plates.ts) is already timed to
  // resolvesAt.
  const targetIsKnownFrontier = frontierAttackIsUndefended(state.tiles.get(captureTargetKey), capture.combatSnapshot?.winChance);
  const activeBattle = state.activeBattles.get(captureTargetKey);
  // Active battle timestamps use page uptime; capture/reveal uses epoch ms.
  const battleFxDoneAt = activeBattle
    ? now + activeBattle.endAt - performance.now()
    : targetIsKnownFrontier
      ? capture.resolvesAt
      : capture.resolvesAt + BATTLE_OVERLAY_TOTAL_MS;
  if (awaitingResult && now < battleFxDoneAt) return;
  if (
    shouldFinalizePredictedCombat({
      now,
      resolvesAt: capture.resolvesAt,
      captureTargetKey,
      revealTargetKey: state.pendingCombatReveal?.targetKey,
      revealed: state.pendingCombatReveal?.revealed,
      hasPredictedResult: Boolean(state.pendingCombatReveal?.result)
    }) &&
    state.pendingCombatReveal?.result
  ) {
    deps.finalizePredictedCombat(state.pendingCombatReveal.result);
    return;
  }
  if (awaitingResult && state.pendingCombatReveal && state.pendingCombatReveal.targetKey === captureTargetKey && !state.pendingCombatReveal.revealed) {
    deps.showCaptureAlert(
      state.pendingCombatReveal.title,
      state.pendingCombatReveal.detail,
      state.pendingCombatReveal.tone,
      state.pendingCombatReveal.manpowerLoss,
      { x: capture.target.x, y: capture.target.y, actionLabel: "Center" }
    );
    deps.pushFeed(state.pendingCombatReveal.detail, "combat", state.pendingCombatReveal.tone === "success" ? "success" : "warn");
    state.pendingCombatReveal.revealed = true;
  }
};

// Renders the season-victory hold-timer alert in one of three states:
// hidden (no hold active), expanded (full card, first time this key is
// seen), or collapsed (slim tap-to-reopen banner, after acknowledgement).
// It never fully hides while a hold is
// active — see client-state.ts victoryHoldAlert doc comment.
export const renderVictoryHoldAlert = (
  state: Pick<ClientState, "victoryHoldAlert" | "victoryHoldAlertCollapsed">,
  deps: {
    victoryAlertOverlayEl: HTMLElement;
    victoryAlertTitleEl: HTMLElement;
    victoryAlertDetailEl: HTMLElement;
    victoryAlertBannerBtn: HTMLButtonElement;
  }
): void => {
  const alert = state.victoryHoldAlert;
  if (!alert || state.victoryHoldAlertCollapsed) {
    deps.victoryAlertOverlayEl.style.display = "none";
    deps.victoryAlertOverlayEl.classList.remove("is-collapsed");
    deps.victoryAlertTitleEl.textContent = "";
    deps.victoryAlertDetailEl.textContent = "";
    deps.victoryAlertBannerBtn.textContent = "";
    return;
  }
  deps.victoryAlertOverlayEl.style.display = "block";
  deps.victoryAlertOverlayEl.dataset.state = alert.isSelfLeader ? "success" : "warn";
  deps.victoryAlertOverlayEl.classList.remove("is-collapsed");
  deps.victoryAlertTitleEl.textContent = victoryHoldAlertTitle(alert);
  deps.victoryAlertDetailEl.textContent = victoryHoldAlertDetail(alert, Date.now());
};

export const drawStartingExpansionArrow = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  dx: number,
  dy: number
): void => {
  const phase = (Date.now() % 1200) / 1200;
  const wave = Math.sin(phase * Math.PI * 2);
  const slide = size * 0.12 * wave;
  const centerX = px + size / 2 + dx * slide;
  const centerY = py + size / 2 + dy * slide;
  const shaft = Math.max(6, size * 0.22);
  const head = Math.max(4, size * 0.16);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
  ctx.strokeStyle = "rgba(255, 213, 110, 0.96)";
  ctx.fillStyle = "rgba(255, 241, 201, 0.98)";
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(255, 209, 102, 0.45)";
  ctx.shadowBlur = Math.max(4, size * 0.12);

  ctx.beginPath();
  ctx.moveTo(0, shaft * 0.6);
  ctx.lineTo(0, -shaft * 0.25);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -shaft * 0.62);
  ctx.lineTo(-head * 0.7, -shaft * 0.08);
  ctx.lineTo(head * 0.7, -shaft * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

// 2D settle dots share the 3D wander path (see client-ancillary-wander.ts); the
// loader snaps the result to whole pixels.
export { wanderPoint as settlePixelWanderPoint } from "../client-ancillary-wander/client-ancillary-wander.js";
