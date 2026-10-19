import { singleTileSelectionForMap } from "./client-garrison-many-model.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

type Selection2DDeps = {
  ctx: CanvasRenderingContext2D;
  isTownSupportHighlightableTile: (tile: Tile | undefined) => boolean;
  keyFor: (x: number, y: number) => string;
  isTownSupportNeighbor: (x: number, y: number, townX: number, townY: number, tier: NonNullable<Tile["town"]>["populationTier"]) => boolean;
};

// The ordinary selection/support/hover outlines live beside the multi-selection
// overlay so all tile-selection paint obeys the same renderer guard.
export const drawMapSelection2D = (state: ClientState, deps: Selection2DDeps, wx: number, wy: number,
  t: Tile | undefined, px: number, py: number, size: number, myReach: ReadonlySet<string> | undefined): void => {
  if (isTrue3DRendererActive()) return;
  const selectedCoord = singleTileSelectionForMap(state);
      if (!isTrue3DRendererActive() && selectedCoord && selectedCoord.x === wx && selectedCoord.y === wy) {
        if (t?.ownerId === state.me && t.ownershipState === "SETTLED") {
          deps.ctx.fillStyle = "rgba(255, 209, 102, 0.18)";
          deps.ctx.fillRect(px, py, size, size);
        } else {
          const selectedOutOfReach = Boolean(myReach) && !myReach!.has(deps.keyFor(wx, wy)); // fixed-border reach: dashed orange outside reach
          if (selectedOutOfReach) deps.ctx.setLineDash([4, 3]);
          deps.ctx.strokeStyle = selectedOutOfReach ? "#ff8a3d" : "#ffd166"; deps.ctx.lineWidth = 2; deps.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1); deps.ctx.lineWidth = 1;
          if (selectedOutOfReach) deps.ctx.setLineDash([]);
        }
      } else if (selectedCoord) {
        const selected = state.tiles.get(deps.keyFor(selectedCoord.x, selectedCoord.y));
        if (
          !isTrue3DRendererActive() &&
          selected?.town &&
          deps.isTownSupportNeighbor(wx, wy, selectedCoord.x, selectedCoord.y, selected.town.populationTier) &&
          deps.isTownSupportHighlightableTile(t)
        ) {
          if (t?.terrain !== "LAND") deps.ctx.strokeStyle = "rgba(92, 103, 127, 0.7)";
          else if (!t?.ownerId) deps.ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
          else if (t.ownerId !== state.me) deps.ctx.strokeStyle = "rgba(255, 98, 98, 0.65)";
          else if (t.ownershipState === "SETTLED") deps.ctx.strokeStyle = "rgba(155, 242, 116, 0.88)";
          else deps.ctx.strokeStyle = "rgba(255, 205, 92, 0.82)";
          if (t?.ownerId === state.me && t.ownershipState === "SETTLED") {
            deps.ctx.fillStyle = "rgba(155, 242, 116, 0.12)";
            deps.ctx.fillRect(px, py, size, size);
          } else {
            deps.ctx.lineWidth = 2;
            deps.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
            deps.ctx.lineWidth = 1;
          }
        }
      }
      if (!isTrue3DRendererActive() && state.hover && state.hover.x === wx && state.hover.y === wy) {
        deps.ctx.strokeStyle = "rgba(255,255,255,0.55)";
        deps.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      }

  const key = deps.keyFor(wx, wy);
  if (state.garrisonMany.active && state.garrisonMany.keys.includes(key)) {
    const invalid = state.garrisonMany.invalidKeys.includes(key);
    deps.ctx.save();
    deps.ctx.fillStyle = invalid ? "rgba(255,138,61,.24)" : "rgba(255,209,102,.28)";
    deps.ctx.strokeStyle = invalid ? "#ff8a3d" : "#ffd166";
    deps.ctx.lineWidth = 3;
    deps.ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    deps.ctx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
    deps.ctx.restore();
  }
};
