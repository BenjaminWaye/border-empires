export type QueuedCornerBadgeKind = "FRONTIER" | "SETTLEMENT" | "BUILD";

export type QueuedCornerBadgeLayout = {
  border:
    | {
        strokeStyle: string;
        x: number;
        y: number;
        width: number;
        height: number;
      }
    | undefined;
  badge:
    | {
        background: string;
        foreground: string;
        text: string;
        x: number;
        y: number;
        width: number;
        height: number;
        textX: number;
        textY: number;
      }
    | undefined;
};

type QueuedCornerBadgeLayoutArgs = {
  kind: QueuedCornerBadgeKind;
  ordinal: number | undefined;
  px: number;
  py: number;
  size: number;
  isTrue3D: boolean;
  blocked: boolean;
};

const QUEUED_CORNER_BADGE_STYLE: Record<
  QueuedCornerBadgeKind,
  { border: string; background: string; foreground: string }
> = {
  FRONTIER: {
    border: "rgba(168, 139, 250, 0.95)",
    background: "rgba(20, 16, 35, 0.85)",
    foreground: "#c4b5fd"
  },
  SETTLEMENT: {
    border: "rgba(251, 191, 36, 0.95)",
    background: "rgba(49, 31, 4, 0.92)",
    foreground: "#fbbf24"
  },
  BUILD: {
    border: "rgba(122, 214, 255, 0.95)",
    background: "rgba(7, 26, 39, 0.92)",
    foreground: "#7dd3fc"
  }
};

export const queuedCornerBadgeLayout = ({
  kind,
  ordinal,
  px,
  py,
  size,
  isTrue3D,
  blocked
}: QueuedCornerBadgeLayoutArgs): QueuedCornerBadgeLayout | undefined => {
  if (ordinal === undefined || blocked) return undefined;
  const style = QUEUED_CORNER_BADGE_STYLE[kind];
  return {
    border: isTrue3D
      ? undefined
      : {
          strokeStyle: style.border,
          x: px + 2,
          y: py + 2,
          width: size - 5,
          height: size - 5
        },
    badge:
      size >= 14
        ? (() => {
            // Roughly 2× the legacy 14×12 badge (so it's readable) but
            // clamped well below tile size — anything close to `size`
            // looks like the badge ate the tile. Pixel-aligned x/y/text
            // so monospace digits hit whole pixels and stay crisp on the
            // CSS-pixel-sized canvas (no DPR scaling on this overlay).
            const badgeWidth = ordinal >= 10 ? 26 : 20;
            const badgeHeight = 18;
            const badgeX = Math.round(px + size - badgeWidth);
            const badgeY = Math.round(py);
            return {
              background: style.background,
              foreground: style.foreground,
              text: String(ordinal),
              x: badgeX,
              y: badgeY,
              width: badgeWidth,
              height: badgeHeight,
              textX: badgeX + Math.round(badgeWidth * 0.5),
              textY: badgeY + Math.round(badgeHeight * 0.5) + 1
            };
          })()
        : undefined
  };
};

export const drawQueuedCornerBadge = (
  ctx: CanvasRenderingContext2D,
  layout: QueuedCornerBadgeLayout | undefined
): void => {
  if (layout?.border) {
    ctx.strokeStyle = layout.border.strokeStyle;
    ctx.lineWidth = 2;
    ctx.strokeRect(layout.border.x, layout.border.y, layout.border.width, layout.border.height);
    ctx.lineWidth = 1;
  }
  if (!layout?.badge) return;
  ctx.fillStyle = layout.badge.background;
  ctx.fillRect(layout.badge.x, layout.badge.y, layout.badge.width, layout.badge.height);
  ctx.fillStyle = layout.badge.foreground;
  ctx.font = "14px monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(layout.badge.text, layout.badge.textX, layout.badge.textY);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "start";
};
