export type QueuedCornerBadgeKind = "SETTLEMENT" | "BUILD";

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
        ? {
            background: style.background,
            foreground: style.foreground,
            text: String(ordinal),
            x: px + size - Math.min(size - 6, ordinal >= 10 ? 18 : 14) - 3,
            y: py + 3,
            width: Math.min(size - 6, ordinal >= 10 ? 18 : 14),
            height: 12,
            textX: px + size - Math.min(size - 6, ordinal >= 10 ? 18 : 14) - 1,
            textY: py + 4
          }
        : undefined
  };
};
