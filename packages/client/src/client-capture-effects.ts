import { isForestTile } from "./client-constants.js";
import { shardRainAlertDetail, type ClientShardRainAlert } from "./client-shard-alert.js";
import { shouldHideCaptureOverlayAfterTimer } from "./client-frontier-overlay.js";
import { shouldFinalizePredictedCombat } from "./client-predicted-combat.js";
import type { ClientState } from "./client-state.js";

export const renderCaptureProgress = (
  state: Pick<ClientState, "captureAlert" | "collectVisibleCooldownUntil" | "capture" | "tiles" | "me" | "pendingCombatReveal">,
  deps: {
    keyFor: (x: number, y: number) => string;
    formatCooldownShort: (ms: number) => string;
    showCaptureAlert: (title: string, detail: string, tone?: "success" | "error" | "warn", manpowerLoss?: number) => void;
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    finalizePredictedCombat: (result: Record<string, unknown>) => void;
    captureCardEl: HTMLElement;
    captureWrapEl: HTMLElement;
    captureCancelBtn: HTMLElement;
    captureCloseBtn: HTMLElement;
    captureBarEl: HTMLElement;
    captureTitleEl: HTMLElement;
    captureTimeEl: HTMLElement;
    captureTargetEl: HTMLElement;
  }
): void => {
  if (state.captureAlert && state.captureAlert.until > Date.now()) {
    if (state.captureAlert.title === "Collect Visible Cooldown") {
      const remaining = state.collectVisibleCooldownUntil - Date.now();
      if (remaining > 0) state.captureAlert.detail = `Retry in ${deps.formatCooldownShort(remaining)}.`;
      else state.captureAlert = undefined;
    }
  }
  if (state.captureAlert && state.captureAlert.until > Date.now()) {
    deps.captureCardEl.dataset.state = state.captureAlert.tone;
    deps.captureCardEl.style.display = "grid";
    deps.captureWrapEl.style.display = "block";
    deps.captureCancelBtn.style.display = "none";
    deps.captureCloseBtn.style.display = "inline-flex";
    deps.captureBarEl.style.width = "100%";
    deps.captureTitleEl.textContent = state.captureAlert.title;
    deps.captureTimeEl.textContent = state.captureAlert.manpowerLoss ? `-${state.captureAlert.manpowerLoss} MP` : "";
    deps.captureTimeEl.classList.toggle("capture-loss", Boolean(state.captureAlert.manpowerLoss));
    deps.captureTargetEl.textContent = state.captureAlert.detail;
    return;
  }
  delete deps.captureCardEl.dataset.state;
  state.captureAlert = undefined;

  if (state.capture) {
    const captureTargetKey = deps.keyFor(state.capture.target.x, state.capture.target.y);
    deps.captureCardEl.dataset.state = "progress";
    deps.captureTimeEl.classList.remove("capture-loss");
    const total = Math.max(1, state.capture.resolvesAt - state.capture.startAt);
    const elapsed = Date.now() - state.capture.startAt;
    const pct = Math.max(0, Math.min(1, elapsed / total));
    const remaining = Math.max(0, Math.ceil((state.capture.resolvesAt - Date.now()) / 100) / 10);
    const awaitingResult = Date.now() > state.capture.resolvesAt;
    const awaitingNeutralExpand = shouldHideCaptureOverlayAfterTimer(state.tiles.get(captureTargetKey), state.me, awaitingResult);
    if (
      shouldFinalizePredictedCombat({
        now: Date.now(),
        resolvesAt: state.capture.resolvesAt,
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
    if (
      awaitingResult &&
      state.pendingCombatReveal &&
      state.pendingCombatReveal.targetKey === captureTargetKey &&
      !state.pendingCombatReveal.revealed
    ) {
      deps.showCaptureAlert(
        state.pendingCombatReveal.title,
        state.pendingCombatReveal.detail,
        state.pendingCombatReveal.tone,
        state.pendingCombatReveal.manpowerLoss
      );
      deps.pushFeed(state.pendingCombatReveal.detail, "combat", state.pendingCombatReveal.tone === "success" ? "success" : "warn");
      state.pendingCombatReveal.revealed = true;
      return;
    }
    if (awaitingNeutralExpand) {
      deps.captureCardEl.style.display = "none";
      deps.captureWrapEl.style.display = "none";
      deps.captureCancelBtn.style.display = "none";
      deps.captureCloseBtn.style.display = "none";
      deps.captureBarEl.style.width = "0%";
      deps.captureTitleEl.textContent = "";
      deps.captureTimeEl.textContent = "";
      deps.captureTargetEl.textContent = "";
      return;
    }
    deps.captureCardEl.style.display = "grid";
    deps.captureWrapEl.style.display = "block";
    deps.captureCancelBtn.style.display = "inline-flex";
    deps.captureCloseBtn.style.display = "none";
    deps.captureBarEl.style.width = awaitingResult ? "100%" : `${Math.floor(pct * 100)}%`;
    deps.captureTitleEl.textContent = awaitingResult
      ? "Resolving battle..."
      : isForestTile(state.capture.target.x, state.capture.target.y)
        ? "Capturing Forest..."
        : "Capturing Territory...";
    deps.captureTimeEl.textContent = awaitingResult ? "" : `${remaining.toFixed(1)}s`;
    deps.captureTargetEl.textContent = awaitingResult
      ? `Waiting for result at (${state.capture.target.x}, ${state.capture.target.y})`
      : `Target: (${state.capture.target.x}, ${state.capture.target.y})`;
  } else {
    deps.captureCardEl.style.display = "none";
    deps.captureWrapEl.style.display = "none";
    deps.captureCancelBtn.style.display = "none";
    deps.captureCloseBtn.style.display = "none";
    deps.captureBarEl.style.width = "0%";
    deps.captureTitleEl.textContent = "";
    deps.captureTimeEl.textContent = "";
    deps.captureTargetEl.textContent = "";
  }
};

export const renderShardAlert = (
  state: Pick<ClientState, "shardAlert" | "shardRainFxUntil">,
  deps: {
    shardAlertOverlayEl: HTMLElement;
    shardAlertTitleEl: HTMLElement;
    shardAlertDetailEl: HTMLElement;
  }
): void => {
  const alert = state.shardAlert as ClientShardRainAlert | undefined;
  if (!alert) {
    deps.shardAlertOverlayEl.style.display = "none";
    deps.shardAlertTitleEl.textContent = "";
    deps.shardAlertDetailEl.textContent = "";
    return;
  }
  const nowMs = Date.now();
  if ((alert.phase === "upcoming" && alert.startsAt <= nowMs) || (alert.phase === "started" && alert.expiresAt <= nowMs)) {
    state.shardAlert = undefined;
    if (alert.phase === "started") state.shardRainFxUntil = 0;
    deps.shardAlertOverlayEl.style.display = "none";
    deps.shardAlertTitleEl.textContent = "";
    deps.shardAlertDetailEl.textContent = "";
    return;
  }
  deps.shardAlertTitleEl.textContent = alert.phase === "upcoming" ? "Shard Rain Incoming" : "Shard Rain Begun";
  deps.shardAlertDetailEl.textContent = shardRainAlertDetail(alert, nowMs);
  deps.shardAlertOverlayEl.style.display = "block";
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

export const triangularWave = (t: number): number => 1 - Math.abs(((t % 1) * 2) - 1);

export const settlePixelSeed = (wx: number, wy: number, i: number, salt: number): number =>
  ((((wx + salt) * 92821) ^ ((wy + salt * 3) * 68917) ^ ((i + salt * 5) * 1259)) >>> 0) / 0xffffffff;

export const settlePixelWaypoint = (wx: number, wy: number, i: number, step: number, axis: "x" | "y"): number =>
  settlePixelSeed(wx, wy, i, axis === "x" ? 41 + step * 13 : 83 + step * 17);

export const settlePixelWanderPoint = (
  nowMs: number,
  wx: number,
  wy: number,
  i: number
): { x: number; y: number } => {
  const moveDurationMs = 1700;
  const pauseDurationMs = 1000;
  const cycleDurationMs = moveDurationMs + pauseDurationMs;
  const offsetMs = settlePixelSeed(wx, wy, i, 11) * cycleDurationMs;
  const localTime = nowMs + offsetMs;
  const segment = Math.floor(localTime / cycleDurationMs);
  const segmentTime = localTime - segment * cycleDurationMs;
  const fromX = settlePixelWaypoint(wx, wy, i, segment, "x");
  const fromY = settlePixelWaypoint(wx, wy, i, segment, "y");
  const toX = settlePixelWaypoint(wx, wy, i, segment + 1, "x");
  const toY = settlePixelWaypoint(wx, wy, i, segment + 1, "y");
  const t = segmentTime >= moveDurationMs ? 1 : segmentTime / moveDurationMs;
  return {
    x: fromX + (toX - fromX) * t,
    y: fromY + (toY - fromY) * t
  };
};
