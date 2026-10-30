// A dock endpoint tile's 2D marks, shared by client-runtime-loop.ts's two
// tile loops (it was duplicated verbatim in both): the corner anchor badge,
// drawn even in 3D mode so the icon-only summary stays readable zoomed out
// (parallels drawResourceCornerMarker), and -- 2D renderer only, since the 3D
// dock overlay supersedes it -- the SVG dock icon or its fallback placeholder.
import { isTrue3DRendererActive } from "../client-renderer-mode.js";

export type DockEndpoint2DDeps = {
  readonly ctx: CanvasRenderingContext2D;
  readonly overlayVariantIndexAt: (x: number, y: number, mod: number) => number;
  readonly dockOverlayVariants: ReadonlyArray<HTMLImageElement | undefined>;
  readonly drawDockMarker: (px: number, py: number, size: number) => void;
  readonly drawCenteredOverlay: (overlay: HTMLImageElement | undefined, px: number, py: number, size: number, scale?: number) => void;
};

export const drawDockEndpoint2D = (deps: DockEndpoint2DDeps, wx: number, wy: number, px: number, py: number, size: number): void => {
  deps.drawDockMarker(px, py, size);
  if (isTrue3DRendererActive()) return;
  const dockOverlay = deps.dockOverlayVariants[deps.overlayVariantIndexAt(wx, wy, deps.dockOverlayVariants.length)];
  if (dockOverlay?.complete && dockOverlay.naturalWidth) {
    deps.drawCenteredOverlay(dockOverlay, px, py, size, 1.14);
    return;
  }
  const { ctx } = deps;
  ctx.fillStyle = "rgba(12, 22, 38, 0.42)";
  ctx.fillRect(px + 1, py + 1, size - 3, size - 3);
  ctx.strokeStyle = "rgba(115, 225, 255, 0.98)";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
  ctx.strokeStyle = "rgba(214, 247, 255, 0.95)";
  ctx.beginPath();
  ctx.moveTo(px + size / 2, py + 3);
  ctx.lineTo(px + size / 2, py + size - 3);
  ctx.moveTo(px + 3, py + size / 2);
  ctx.lineTo(px + size - 3, py + size / 2);
  ctx.stroke();
  ctx.lineWidth = 1;
};
