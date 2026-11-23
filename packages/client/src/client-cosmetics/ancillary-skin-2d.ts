import type { AncillarySkin } from "./client-cosmetics.js";

// 2D canvas half of the ancillary skin cosmetics (the true-3D half is the
// paint scheme in popup-marine-material.ts). Same rule: the figure keeps its
// shape, size and owner-colour body; a skin only repaints the helmet.

/** The Ivory-trim plate's trim colour, matching the 3D scheme. */
export const ANCILLARY_IVORY_2D = "#e6dbbd";

/** Fill for a 2D soldier figure's helmet: the owner's colour unless a skin repaints it. */
export const ancillaryHelmetFill2D = (ownerColor: string, skin: AncillarySkin | undefined): string =>
  skin === "ancillary-ivory" ? ANCILLARY_IVORY_2D : ownerColor;

/**
 * A battle squad's soldier is one owner-coloured dot seen from above. A skin
 * adds the helmet as a smaller dot in its centre, leaving a ring of the
 * owner's colour as wide as the helmet round it. Call right after filling the
 * dot; uses the current globalAlpha, so a falling soldier fades as one.
 */
export const drawAncillaryDotHelmet2D = (
  ctx: CanvasRenderingContext2D, x: number, y: number, dotRadius: number, skin: AncillarySkin | undefined
): void => {
  if (skin !== "ancillary-ivory") return;
  ctx.fillStyle = ANCILLARY_IVORY_2D;
  ctx.beginPath();
  ctx.arc(x, y, dotRadius * 0.5, 0, Math.PI * 2);
  ctx.fill();
};
