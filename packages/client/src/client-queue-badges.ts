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
  const borderInset = kind === "FRONTIER" ? 1 : 2;
  const borderSize = kind === "FRONTIER" ? size - 3 : size - 5;
  const badgeWidth =
    kind === "FRONTIER"
      ? Math.min(size - 6, 14)
      : Math.min(size - 6, ordinal >= 10 ? 18 : 14);
  return {
    border: isTrue3D
      ? undefined
      : {
          strokeStyle: style.border,
          x: px + borderInset,
          y: py + borderInset,
          width: borderSize,
          height: borderSize
        },
    badge:
      size >= (kind === "FRONTIER" ? 16 : 14)
        ? {
            background: style.background,
            foreground: style.foreground,
            text: String(ordinal),
            x: kind === "FRONTIER" ? px + 3 : px + size - badgeWidth - 3,
            y: py + 3,
            width: badgeWidth,
            height: 12,
            textX: kind === "FRONTIER" ? px + 5 : px + size - badgeWidth - 1,
            textY: py + 4
          }
        : undefined
  };
};
