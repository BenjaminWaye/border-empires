export type AetherWallDirection = "N" | "E" | "S" | "W";

export type AetherWallSegment = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  baseX: number;
  baseY: number;
};

const directionStep = (direction: AetherWallDirection): { dx: number; dy: number } => {
  if (direction === "N") return { dx: 0, dy: -1 };
  if (direction === "E") return { dx: 1, dy: 0 };
  if (direction === "S") return { dx: 0, dy: 1 };
  return { dx: -1, dy: 0 };
};

const spanStep = (direction: AetherWallDirection): { dx: number; dy: number } => {
  if (direction === "N" || direction === "S") return { dx: 1, dy: 0 };
  return { dx: 0, dy: 1 };
};

export const aetherWallEdgeKey = (fromX: number, fromY: number, toX: number, toY: number): string =>
  `${fromX},${fromY}>${toX},${toY}`;

export const buildAetherWallSegments = (
  originX: number,
  originY: number,
  direction: AetherWallDirection,
  length: number,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
): AetherWallSegment[] => {
  const segments: AetherWallSegment[] = [];
  const dir = directionStep(direction);
  const span = spanStep(direction);
  for (let index = 0; index < length; index += 1) {
    const baseX = wrapX(originX + span.dx * index);
    const baseY = wrapY(originY + span.dy * index);
    const toX = wrapX(baseX + dir.dx);
    const toY = wrapY(baseY + dir.dy);
    segments.push({ fromX: baseX, fromY: baseY, toX, toY, baseX, baseY });
  }
  return segments;
};
