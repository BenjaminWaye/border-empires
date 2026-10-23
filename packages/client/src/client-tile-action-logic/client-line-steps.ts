// Tiles strictly between two points on a straight line, wrapped into the
// world (extracted from client-tile-action-logic.ts, 500-line budget).
export const lineStepsBetween = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  deps: { readonly wrapX: (x: number) => number; readonly wrapY: (y: number) => number }
): Array<{ x: number; y: number }> => {
  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 1) return [];
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < steps; i += 1) {
    out.push({ x: deps.wrapX(Math.round(ax + (dx * i) / steps)), y: deps.wrapY(Math.round(ay + (dy * i) / steps)) });
  }
  return out;
};
