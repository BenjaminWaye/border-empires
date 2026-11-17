// 2D canvas half of the captured-muster-flag label (client-muster-capture.ts);
// the true-3D map spawns the same label through its floating-text layer
// (syncMusterCaptureLabels, client-map-3d/client-map-3d-fx-cast-overlays.ts). Rises and fades over the tile.
import { liveMusterCaptureLabels, MUSTER_CAPTURE_LABEL_MS, type MusterCaptureLabelState } from "./client-muster-capture.js";

const FADE_START = 0.55;

export const drawMusterCaptureLabels2D = (
  ctx: CanvasRenderingContext2D,
  state: MusterCaptureLabelState,
  tileCenterOnScreen: (wx: number, wy: number) => { sx: number; sy: number },
  size: number,
  nowMs: number
): void => {
  const labels = liveMusterCaptureLabels(state, nowMs);
  if (labels.length === 0) return;
  const fontPx = Math.max(12, Math.min(28, size * 0.55));
  ctx.save();
  ctx.font = `900 ${fontPx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(2, fontPx * 0.18);
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  for (const label of labels) {
    const t = Math.min(1, Math.max(0, (nowMs - label.startedAt) / MUSTER_CAPTURE_LABEL_MS));
    const { sx, sy } = tileCenterOnScreen(label.x, label.y);
    const y = sy - size * 0.4 - t * size * 1.6;
    ctx.globalAlpha = t < FADE_START ? 1 : Math.max(0, 1 - (t - FADE_START) / (1 - FADE_START));
    ctx.strokeText(label.text, sx, y);
    ctx.fillStyle = label.color;
    ctx.fillText(label.text, sx, y);
  }
  ctx.restore();
};
