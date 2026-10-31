import { relicOperationalState, type NaturalWonderState } from "@border-empires/shared";

/** Native canvas counterpart: manufactured stepped ruin, House flag, empty-cell marker. */
export const drawRelicOverlay2D = (
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number,
  state: NaturalWonderState, garrisoned: boolean, ownerColor?: string
): void => {
  const status = relicOperationalState(state, garrisoned);
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  const unit = size;
  for (let level = 0; level < 4; level += 1) {
    const width = unit * (1.12 - level * 0.21);
    const elevation = -level * unit * 0.12;
    ctx.fillStyle = status === "depleted" ? "#4d514c" : "#46565b";
    ctx.fillRect(-width / 2, elevation - unit * 0.06, width, unit * 0.15);
    ctx.beginPath();
    ctx.moveTo(-width / 2, elevation - unit * 0.06);
    ctx.lineTo(0, elevation - unit * 0.25);
    ctx.lineTo(width / 2, elevation - unit * 0.06);
    ctx.lineTo(0, elevation + unit * 0.12);
    ctx.closePath();
    ctx.fillStyle = status === "depleted" ? "#73776c" : "#9aa6a0";
    ctx.fill();
    ctx.strokeStyle = "#34423e"; ctx.lineWidth = Math.max(0.6, size * 0.015); ctx.stroke();
  }
  ctx.fillStyle = "#1c2928"; ctx.fillRect(-unit * 0.045, -unit * 0.43, unit * 0.09, unit * 0.10);
  ctx.fillStyle = status === "active" ? "#c6c28b" : "#525e4b";
  ctx.fillRect(-unit * 0.055, -unit * 0.43, unit * 0.012, unit * 0.10);
  ctx.fillRect(unit * 0.043, -unit * 0.43, unit * 0.012, unit * 0.10);
  ctx.strokeStyle = "#404c46"; ctx.lineWidth = Math.max(1, unit * 0.025);
  ctx.beginPath(); ctx.moveTo(-unit * 0.12, unit * 0.10);
  for (let flight = 0; flight < 4; flight += 1) ctx.lineTo((flight % 2 ? -1 : 1) * unit * 0.12, -flight * unit * 0.12);
  ctx.stroke();
  if (ownerColor) {
    ctx.strokeStyle = "#a69c7d"; ctx.lineWidth = Math.max(1, unit * 0.025);
    ctx.beginPath(); ctx.moveTo(unit * 0.05, -unit * 0.47); ctx.lineTo(unit * 0.05, -unit * 0.95); ctx.stroke();
    ctx.fillStyle = ownerColor; ctx.beginPath();
    ctx.moveTo(unit * 0.05, -unit * 0.94); ctx.lineTo(unit * 0.31, -unit * 0.94);
    ctx.lineTo(unit * 0.31, -unit * 0.68); ctx.lineTo(unit * 0.18, -unit * 0.63);
    ctx.lineTo(unit * 0.05, -unit * 0.68); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (status === "depleted") {
    const w = Math.max(13, unit * 0.46), h = w * 0.52;
    const top = -unit * 0.67;
    ctx.fillStyle = "#202521"; ctx.strokeStyle = "#ead9ad"; ctx.lineWidth = Math.max(1.5, unit * 0.03);
    ctx.fillRect(-w / 2, top, w, h); ctx.strokeRect(-w / 2, top, w, h);
    ctx.fillStyle = "#ead9ad"; ctx.fillRect(w / 2 + 1, top + h / 3, 2, h / 3);
    ctx.strokeStyle = "#e6ac6e"; ctx.beginPath(); ctx.moveTo(-w / 2 - 2, top + h + 2); ctx.lineTo(w / 2 + 2, top - 2); ctx.stroke();
    if (size >= 32) { ctx.fillStyle = "#f2e8d3"; ctx.font = `bold ${Math.max(9, size * 0.18)}px sans-serif`; ctx.textAlign = "center"; ctx.fillText("Depleted", 0, top + h + Math.max(11, size * 0.21)); }
  }
  ctx.restore();
};
