// Split out of client-map-render.ts (over the repo's 500-line file cap) so
// adding 2D river edges to drawTerrainTile didn't grow that file. The 2D
// relief renderer's stylized mountain tile, drawn by drawTerrainTile.
const mountainPeakOffset = (wx: number, wy: number): { x: number; y: number } => {
  const nx = Math.sin(wx * 12.7 + wy * 4.9) * 0.5 + 0.5;
  const ny = Math.cos(wx * 8.3 - wy * 6.1) * 0.5 + 0.5;
  return { x: (nx - 0.5) * 0.2, y: (ny - 0.5) * 0.14 };
};
export const drawReliefMountainTile = (
  ctx: CanvasRenderingContext2D,
  options: {
    wx: number;
    wy: number;
    px: number;
    py: number;
    size: number;
    topHeight: number;
    relief: number;
  }
): void => {
  const { wx, wy, px, py, size, topHeight, relief } = options;
  const left = px;
  const right = px + size;
  const topY = py;
  const plateauY = py + topHeight;
  const frontY = plateauY + relief;
  const sideDepth = Math.max(2, Math.floor(size * 0.22));
  const sideInset = Math.max(1, Math.floor(size * 0.1));

  const plateauGradient = ctx.createLinearGradient(left, topY, right, plateauY);
  plateauGradient.addColorStop(0, "rgba(116, 170, 83, 0.94)");
  plateauGradient.addColorStop(0.6, "rgba(104, 156, 75, 0.95)");
  plateauGradient.addColorStop(1, "rgba(78, 124, 57, 0.96)");
  ctx.fillStyle = plateauGradient;
  ctx.fillRect(left, topY, size, topHeight);

  // Block-like terrain sides similar to stylized diorama chunks.
  ctx.fillStyle = "rgba(191, 143, 96, 0.98)";
  ctx.fillRect(left + sideInset, plateauY, size - sideInset * 2, relief + sideDepth * 0.38);
  ctx.fillStyle = "rgba(168, 122, 82, 0.94)";
  for (let x = left + sideInset + 2; x < right - sideInset; x += Math.max(4, Math.floor(size * 0.15))) {
    ctx.fillRect(x, plateauY + 1, 1, relief + sideDepth * 0.35);
  }

  const centerX = px + size * 0.54;
  const centerY = py + size * 0.52;
  const peakOffset = mountainPeakOffset(wx, wy);
  const peakX = centerX + size * peakOffset.x * 0.9;
  const peakY = py + size * (0.1 + peakOffset.y * 0.7);

  const footLeft = { x: px + size * 0.18, y: py + size * 0.68 };
  const footRight = { x: px + size * 0.92, y: py + size * 0.78 };
  const footBottom = { x: px + size * 0.58, y: py + size * 0.96 };
  const shoulderLeft = { x: px + size * 0.38, y: py + size * 0.43 };
  const shoulderRight = { x: px + size * 0.74, y: py + size * 0.46 };

  const mountainShadow = ctx.createRadialGradient(
    px + size * 0.62,
    py + size * 0.88,
    size * 0.08,
    px + size * 0.62,
    py + size * 0.88,
    size * 0.5
  );
  mountainShadow.addColorStop(0, "rgba(10, 22, 14, 0.24)");
  mountainShadow.addColorStop(1, "rgba(10, 22, 14, 0)");
  ctx.fillStyle = mountainShadow;
  ctx.beginPath();
  ctx.ellipse(px + size * 0.62, py + size * 0.88, size * 0.52, size * 0.22, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Left lit slope.
  const leftSlope = ctx.createLinearGradient(px + size * 0.2, py + size * 0.2, px + size * 0.68, py + size * 0.88);
  leftSlope.addColorStop(0, "rgba(166, 178, 108, 0.98)");
  leftSlope.addColorStop(0.6, "rgba(135, 154, 90, 0.97)");
  leftSlope.addColorStop(1, "rgba(109, 125, 73, 0.98)");
  ctx.fillStyle = leftSlope;
  ctx.beginPath();
  ctx.moveTo(peakX, peakY);
  ctx.lineTo(shoulderLeft.x, shoulderLeft.y);
  ctx.bezierCurveTo(px + size * 0.24, py + size * 0.54, px + size * 0.2, py + size * 0.64, footLeft.x, footLeft.y);
  ctx.bezierCurveTo(px + size * 0.36, py + size * 0.9, px + size * 0.46, py + size * 0.95, footBottom.x, footBottom.y);
  ctx.closePath();
  ctx.fill();

  // Right steeper slope.
  const rightSlope = ctx.createLinearGradient(px + size * 0.56, py + size * 0.14, px + size * 0.95, py + size * 0.9);
  rightSlope.addColorStop(0, "rgba(138, 120, 84, 0.98)");
  rightSlope.addColorStop(0.55, "rgba(110, 86, 64, 0.98)");
  rightSlope.addColorStop(1, "rgba(80, 63, 48, 0.98)");
  ctx.fillStyle = rightSlope;
  ctx.beginPath();
  ctx.moveTo(peakX, peakY);
  ctx.lineTo(shoulderRight.x, shoulderRight.y);
  ctx.bezierCurveTo(px + size * 0.9, py + size * 0.56, px + size * 0.93, py + size * 0.66, footRight.x, footRight.y);
  ctx.bezierCurveTo(px + size * 0.82, py + size * 0.9, px + size * 0.72, py + size * 0.96, footBottom.x, footBottom.y);
  ctx.closePath();
  ctx.fill();

  // Carved ridgelines.
  ctx.strokeStyle = "rgba(85, 72, 52, 0.48)";
  ctx.lineWidth = Math.max(1, size * 0.03);
  const ridgeCount = 4;
  for (let i = 0; i < ridgeCount; i += 1) {
    const t = (i + 1) / (ridgeCount + 1);
    const ridgeStartX = peakX + size * (t * 0.11 - 0.08);
    const ridgeEndX = px + size * (0.3 + t * 0.56);
    const ridgeEndY = py + size * (0.66 + t * 0.2);
    ctx.beginPath();
    ctx.moveTo(ridgeStartX, peakY + size * 0.03);
    ctx.bezierCurveTo(
      ridgeStartX + size * (0.03 + t * 0.05),
      py + size * (0.3 + t * 0.12),
      ridgeEndX - size * 0.07,
      ridgeEndY - size * 0.1,
      ridgeEndX,
      ridgeEndY
    );
    ctx.stroke();
  }

  // Snow cap.
  ctx.fillStyle = "rgba(244, 250, 255, 0.9)";
  ctx.beginPath();
  ctx.moveTo(peakX, peakY - size * 0.01);
  ctx.lineTo(peakX - size * 0.08, peakY + size * 0.09);
  ctx.lineTo(peakX - size * 0.02, peakY + size * 0.12);
  ctx.lineTo(peakX + size * 0.03, peakY + size * 0.08);
  ctx.lineTo(peakX + size * 0.08, peakY + size * 0.12);
  ctx.lineTo(peakX + size * 0.06, peakY + size * 0.04);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255, 245, 208, 0.1)";
  ctx.fillRect(px + 1, py + 1, size - 2, Math.max(1, Math.floor(size * 0.06)));
  ctx.strokeStyle = "rgba(10, 12, 18, 0.34)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, size - 1, Math.max(1, frontY - py - 1));
};
