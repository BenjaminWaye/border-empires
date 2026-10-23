import type { ClientState } from "./client-state/client-state.js";

// 2D crystal-ability targeting: the line from the casting Aether Tower to the
// hovered (else selected) valid target, plus both tiles' outlines. Extracted
// from client-runtime-loop.ts (500-line budget); the 3D renderer draws its own
// (client-map-3d-crystal-targeting-overlay).
export const drawCrystalTargetingLine2D = (args: {
  ctx: CanvasRenderingContext2D;
  state: Pick<ClientState, "hover" | "selected" | "crystalTargeting">;
  keyFor: (x: number, y: number) => string;
  parseKey: (key: string) => { x: number; y: number };
  project: (x: number, y: number) => { sx: number; sy: number };
  size: number;
  tone: "amber" | "cyan" | "red";
}): void => {
  const { ctx, state, keyFor, parseKey, project, size, tone } = args;
  const hoveredKey = state.hover ? keyFor(state.hover.x, state.hover.y) : "";
  const selectedKey = state.selected ? keyFor(state.selected.x, state.selected.y) : "";
  const targetKey = state.crystalTargeting.validTargets.has(hoveredKey)
    ? hoveredKey
    : state.crystalTargeting.validTargets.has(selectedKey)
      ? selectedKey
      : "";
  if (targetKey) {
    const target = parseKey(targetKey);
    const targetScreen = project(target.x, target.y);
    const originKey = state.crystalTargeting.originByTarget.get(targetKey);
    if (originKey) {
      const origin = parseKey(originKey);
      const originScreen = project(origin.x, origin.y);
      ctx.save();
      ctx.strokeStyle =
        tone === "amber"
          ? "rgba(255, 205, 98, 0.92)"
          : tone === "cyan"
            ? "rgba(116, 227, 255, 0.92)"
            : "rgba(255, 110, 110, 0.92)";
      ctx.lineWidth = 2;
      ctx.setLineDash(tone === "cyan" ? [10, 6] : [7, 5]);
      ctx.beginPath();
      ctx.moveTo(originScreen.sx, originScreen.sy);
      ctx.lineTo(targetScreen.sx, targetScreen.sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeRect(originScreen.sx - size / 2 + 2, originScreen.sy - size / 2 + 2, size - 4, size - 4);
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle =
      tone === "amber"
        ? "rgba(255, 219, 132, 1)"
        : tone === "cyan"
          ? "rgba(153, 240, 255, 1)"
          : "rgba(255, 144, 144, 1)";
    ctx.lineWidth = 3;
    ctx.strokeRect(targetScreen.sx - size / 2 + 1, targetScreen.sy - size / 2 + 1, size - 2, size - 2);
    ctx.restore();
  }
};
