import { tileHasTownIdentity } from "../client-town-identity.js";
import { districtWrapX as wrapX, districtWrapY as wrapY } from "./district-coordinates.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { townSupportPlotMapFor2D } from "../client-town-support-plot-lookup.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import { buildDistrictNetwork, districtRecord, type DistrictEdge } from "./district-network.js";
import { isDistrictBuilding } from "./district-catalog.js";

type CanvasDeps = {
  readonly state: Pick<ClientState, "tiles" | "tilesRevision" | "selected" | "me" | "dormantStructures" | "camX" | "camY">;
  readonly ctx: CanvasRenderingContext2D;
  readonly visibilityAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  readonly terrainAt: (x: number, y: number) => Tile["terrain"];
  readonly worldToScreen: (x: number, y: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
};

export const createDistrictCanvas = (deps: CanvasDeps): {
  readonly plots: (true3D: boolean) => Map<string, boolean>;
  readonly draw: (size: number, halfW: number, halfH: number) => void;
} => {
  let cacheKey = "";
  let nextDisabledExpiry = Infinity;
  let cachedDormancy: CanvasDeps["state"]["dormantStructures"] | undefined;
  let cachedTiles: ReadonlyMap<string, Tile> | undefined;
  let edges: readonly DistrictEdge[] = [];
  return {
    plots: true3D => {
      if (true3D) return new Map();
      const { state } = deps;
      const selected = state.selected ? state.tiles.get(`${state.selected.x},${state.selected.y}`) : undefined;
      const plots = townSupportPlotMapFor2D(selected, { tiles: state.tiles, wrapX, wrapY, keyFor: (x, y) => `${x},${y}`, terrainAt: deps.terrainAt, me: state.me });
      for (const key of plots.keys()) {
        const tile = state.tiles.get(key);
        if (isDistrictBuilding(tile?.economicStructure?.type) || tile?.observatory) plots.delete(key);
      }
      return plots;
    },
    draw: (size, halfW, halfH) => {
      if (size < 8) return;
      const { state, ctx } = deps;
      const cx = Math.floor(state.camX), cy = Math.floor(state.camY);
      const key = `${state.tilesRevision}:${cx}:${cy}:${halfW}:${halfH}`;
      if (cacheKey !== key || cachedTiles !== state.tiles || cachedDormancy !== state.dormantStructures || Date.now() >= nextDisabledExpiry) {
        const candidates: Tile[] = [];
        for (let dy = -halfH - 3; dy <= halfH + 3 && candidates.length < 8192; dy += 1) {
          for (let dx = -halfW - 3; dx <= halfW + 3 && candidates.length < 8192; dx += 1) {
            const tile = state.tiles.get(`${wrapX(cx + dx)},${wrapY(cy + dy)}`);
            if (tile && districtRecord(tile)) candidates.push(tile);
          }
        }
        nextDisabledExpiry = Infinity;
        for (const tile of candidates) {
          const record = districtRecord(tile);
          if (record && "disabledUntil" in record && (record.disabledUntil ?? 0) > Date.now()) nextDisabledExpiry = Math.min(nextDisabledExpiry, record.disabledUntil!);
        }
        const dormant = new Set(state.dormantStructures.map(entry => entry.key));
        edges = buildDistrictNetwork({ tiles: state.tiles, visibilityAt: deps.visibilityAt, isDormant: tile => dormant.has(`${tile.x},${tile.y}:economicStructure`) || dormant.has(`${tile.x},${tile.y}:observatory`) }, candidates);
        cacheKey = key; cachedTiles = state.tiles; cachedDormancy = state.dormantStructures;
      }
      const selected = state.selected ? state.tiles.get(`${state.selected.x},${state.selected.y}`) : undefined;
      const anchor = selected && districtRecord(selected)?.supportAnchor;
      const selectedTown = selected && tileHasTownIdentity(selected) ? `${selected.x},${selected.y}` : anchor ? `${anchor.x},${anchor.y}` : undefined;
      ctx.save();
      ctx.lineCap = "round";
      for (const edge of edges) {
        if (!edge.traceable || (edge.buried && edge.townKey !== selectedTown)) continue;
        const dx = toroidDelta(edge.from.x, edge.to.x, WORLD_WIDTH), dy = toroidDelta(edge.from.y, edge.to.y, WORLD_HEIGHT);
        let visible = true;
        for (let i = 0; i <= 8; i += 1) {
          const x = wrapX(Math.floor(edge.from.x + dx * i / 8)), y = wrapY(Math.floor(edge.from.y + dy * i / 8));
          if (deps.visibilityAt(x, y, state.tiles.get(`${x},${y}`)) !== "visible") visible = false;
        }
        if (!visible) continue;
        const a = deps.worldToScreen(edge.from.x - 0.5, edge.from.y - 0.5, size, halfW, halfH);
        const bx = a.sx + dx * size, by = a.sy + dy * size;
        ctx.setLineDash(edge.buried ? [Math.max(2, size * 0.05), Math.max(2, size * 0.05)] : []);
        ctx.lineWidth = Math.max(2, size * 0.05);
        ctx.strokeStyle = "#36383e";
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(bx, by); ctx.stroke();
        ctx.lineWidth = Math.max(1, size * 0.018);
        ctx.strokeStyle = edge.active ? edge.townKey === selectedTown ? "#fff0b5" : "#c6a871" : "#625a4d";
        ctx.stroke();
      }
      ctx.restore();
    }
  };
};
