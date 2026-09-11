// Wires renderCaptureProgress's dom element list -- split out of
// client-bootstrap.ts (already at its 500-line growth cap) so that file
// doesn't have to grow to plumb the capture-alert popup's new
// "Go to tile" button (captureGotoBtn) through to the render module.
import { renderCaptureProgress as renderCaptureProgressFromModule } from "../client-capture-effects/client-capture-effects.js";
import type { ClientState } from "../client-state/client-state.js";

export const createRenderCaptureProgress = (
  state: ClientState,
  dom: Record<string, any>,
  deps: {
    keyFor: (x: number, y: number) => string;
    formatCooldownShort: (ms: number) => string;
    showCaptureAlert: (title: string, detail: string, tone?: "success" | "error" | "warn", manpowerLoss?: number, focus?: { x: number; y: number; actionLabel?: string }) => void;
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    finalizePredictedCombat: (result: Record<string, unknown>) => void;
  }
): (() => void) => (): void =>
  renderCaptureProgressFromModule(state, {
    ...deps,
    captureCardEl: dom.captureCardEl,
    captureWrapEl: dom.captureWrapEl,
    captureCancelBtn: dom.captureCancelBtn,
    captureDismissBtn: dom.captureDismissBtn,
    captureCloseBtn: dom.captureCloseBtn,
    captureDownloadDebugBtn: dom.captureDownloadDebugBtn,
    captureBarEl: dom.captureBarEl,
    captureTitleEl: dom.captureTitleEl,
    captureTimeEl: dom.captureTimeEl,
    captureTargetEl: dom.captureTargetEl,
    captureGotoBtn: dom.captureGotoBtn
  });
