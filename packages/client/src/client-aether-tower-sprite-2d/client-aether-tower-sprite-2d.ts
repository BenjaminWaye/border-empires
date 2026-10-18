// 2D Aether Tower (OBSERVATORY) map sprite. A disabled tower ("inactive")
// draws faded with its aether lens shuttered dark, matching the 3D overlay's
// frozen, dimmed tower (client-map-3d-ambaric-transformer-dim.ts). Without the
// sprite loaded it falls back to the owner-accented ring.

import { drawCenteredOverlayWithAlpha } from "../client-map-render/client-map-render-centered-overlay.js";
import type { ObservatoryStatus } from "@border-empires/shared";

export const AETHER_TOWER_SPRITE_SCALE_2D = 1.02;
export const DISABLED_AETHER_TOWER_ALPHA_2D = 0.6;
// Aether lens centre/radius in the 128px observatory-overlay.svg viewBox.
const LENS_CX = 70 / 128;
const LENS_CY = 36 / 128;
const LENS_R = 12 / 128;

export type AetherTowerSprite2DDeps = {
  readonly ctx: CanvasRenderingContext2D;
  readonly sprite: HTMLImageElement | undefined;
  readonly structureAccentColor: (ownerId: string, fallback: string) => string;
};

export const drawAetherTowerSprite2D = (
  deps: AetherTowerSprite2DDeps,
  observatory: { readonly status: ObservatoryStatus },
  ownerId: string | undefined,
  px: number,
  py: number,
  size: number
): void => {
  const { ctx, sprite } = deps;
  const disabled = observatory.status === "inactive";
  if (sprite && sprite.complete && sprite.naturalWidth) {
    const scale = AETHER_TOWER_SPRITE_SCALE_2D;
    drawCenteredOverlayWithAlpha(ctx, sprite, px, py, size, scale, disabled ? DISABLED_AETHER_TOWER_ALPHA_2D : 1);
    if (!disabled) return;
    const drawSize = size * scale;
    const left = px - (drawSize - size) / 2;
    const top = py - (drawSize - size) / 2;
    ctx.fillStyle = "rgba(18, 24, 34, 0.78)";
    ctx.beginPath();
    ctx.arc(left + drawSize * LENS_CX, top + drawSize * LENS_CY, drawSize * LENS_R, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.strokeStyle = deps.structureAccentColor(
    ownerId ?? "",
    observatory.status === "active" ? "rgba(122, 214, 255, 0.92)" : "rgba(122, 214, 255, 0.42)"
  );
  ctx.beginPath();
  ctx.arc(px + size / 2, py + size / 2, Math.max(3, size * 0.22), 0, Math.PI * 2);
  ctx.stroke();
};
