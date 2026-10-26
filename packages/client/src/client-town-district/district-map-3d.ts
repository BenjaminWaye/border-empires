import { tileHasTownIdentity } from "../client-town-identity.js";
import { districtWrapX as wrapX, districtWrapY as wrapY } from "./district-coordinates.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Scene, Texture } from "three";
import type { Tile, TileVisibilityState } from "../client-types.js";
import type { ClientState } from "../client-state/client-state.js";
import { constructionSiteForRebuild } from "../client-construction-afc-offset/client-construction-afc-offset.js";
import { hillFootprintTopY } from "../client-map-3d-tile-surface-y/client-map-3d-tile-surface-y.js";
import { HEIGHTFIELD_HILLS_ELEVATION_BONUS } from "../client-map-3d-heightfield-terrain.js";
import { hillBumpsWithCorridorAt, hillNeighborFlagsAt, hillShapeHeight, type RoadCutDirections } from "../client-map-3d-hill-shape.js";
import { DISTRICT_RADIUS, isDistrictBuilding, isDistrictProject } from "./district-catalog.js";
import { buildDistrictNetwork, districtOperational, districtRecord, type DistrictPoint } from "./district-network.js";
import { createDistrictOverlay } from "./district-overlay.js";
import { createDistrictLinks3D } from "./district-links-3d.js";

export type DistrictSite = { readonly x: number; readonly z: number; readonly surfaceY: number; readonly wx: number; readonly wy: number };
type DistrictMapDeps = {
  readonly state: Pick<ClientState, "tiles" | "tilesRevision" | "selected" | "me" | "dormantStructures">;
  readonly origin: { camX: number; camY: number };
  readonly visibilityAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  readonly cornerYAt: (x: number, y: number) => number;
  readonly isHillsAt: (x: number, y: number) => boolean;
  readonly hillCutAt: (x: number, y: number) => RoadCutDirections | undefined;
  readonly rise: number;
  readonly qualityTier?: 0 | 1 | 2;
};

export const districtSelectedTown = (state: Pick<ClientState, "selected" | "tiles">): string | undefined => {
  const selected = state.selected ? state.tiles.get(`${state.selected.x},${state.selected.y}`) : undefined;
  if (!selected) return undefined;
  if (tileHasTownIdentity(selected)) return `${selected.x},${selected.y}`;
  const anchor = districtRecord(selected)?.supportAnchor;
  return anchor ? `${anchor.x},${anchor.y}` : undefined;
};

export type DistrictMap3D = {
  readonly addTile: (tile: Tile, site: DistrictSite, rebuildAt: number) => { economic: boolean; observatory: boolean };
  readonly clear: () => void; readonly commit: (origin?: { camX: number; camY: number }) => void;
  readonly update: (nowMs: number) => void; readonly boundaryPassed: () => boolean;
  readonly dispose: () => void;
  readonly diagnostics: { models: { instances: number; overflow: number; slots: number }; links: { edges: number; overflow: number }; worldWidth: number; worldHeight: number };
};

export const createDistrictMap3D = (scene: Scene, maxTiles: number, deps: DistrictMapDeps, envMap?: Texture): DistrictMap3D => {
  const origin = { ...deps.origin };
  let builtDormancy = deps.state.dormantStructures;
  let nextDisabledExpiry = Infinity;
  const models = createDistrictOverlay(scene, maxTiles * 3, envMap, deps.qualityTier);
  const sites = new Map<string, { tile: Tile; seat: number }>();
  const candidates: Tile[] = [];
  let dormant = new Set<string>();
  const seatAt = (tile: Tile): number => hillFootprintTopY({
    cornerYAt: deps.cornerYAt, wx: tile.x, wy: tile.y, wxNext: wrapX(tile.x + 1), wyNext: wrapY(tile.y + 1),
    rise: deps.rise, halfExtent: DISTRICT_RADIUS, isHillsAt: deps.isHillsAt, wrapX, wrapY, hillCut: deps.hillCutAt(tile.x, tile.y)
  });
  const surfaceAt = (p: DistrictPoint): number => {
    const x = wrapX(Math.floor(p.x)), y = wrapY(Math.floor(p.y));
    const u = p.x - Math.floor(p.x), v = p.y - Math.floor(p.y);
    const site = sites.get(`${x},${y}`);
    if (site && Math.hypot(u - 0.5, v - 0.5) < (tileHasTownIdentity(site.tile) ? 0.49 : 0.42)) return site.seat;
    const c00 = deps.cornerYAt(x, y), c10 = deps.cornerYAt(wrapX(x + 1), y);
    const c01 = deps.cornerYAt(x, wrapY(y + 1)), c11 = deps.cornerYAt(wrapX(x + 1), wrapY(y + 1));
    let height = (c00 * (1 - u) + c10 * u) * (1 - v) + (c01 * (1 - u) + c11 * u) * v;
    if (deps.isHillsAt(x, y)) height += HEIGHTFIELD_HILLS_ELEVATION_BONUS * hillShapeHeight(
      u - 0.5, v - 0.5, hillBumpsWithCorridorAt(x, y, hillNeighborFlagsAt(x, y, deps.isHillsAt, wrapX, wrapY)), x, y, deps.hillCutAt(x, y));
    return height + deps.rise;
  };
  const links = createDistrictLinks3D(scene, maxTiles * 24, { origin, surfaceAt, selectedTown: () => districtSelectedTown(deps.state) }, envMap);
  return {
    addTile: (tile: Tile, site: DistrictSite, rebuildAt: number): { economic: boolean; observatory: boolean } => {
      const economic = (isDistrictBuilding(tile.economicStructure?.type) || isDistrictProject(tile.economicStructure?.type));
      const visible = deps.visibilityAt(tile.x, tile.y, tile) === "visible";
      if (!visible || tile.terrain !== "LAND") return { economic: false, observatory: false };
      const record = tile.economicStructure;
      if (record?.disabledUntil && record.disabledUntil > Date.now()) nextDisabledExpiry = Math.min(nextDisabledExpiry, record.disabledUntil);
      const hasTown = tileHasTownIdentity(tile);
      const y = hasTown ? site.surfaceY : seatAt(tile);
      if (sites.size < maxTiles) { sites.set(`${tile.x},${tile.y}`, { tile, seat: y }); candidates.push(tile); }
      const combined = Boolean(tile.fort || hasTown || tile.observatory);
      if (combined && !hasTown && economic && !tile.observatory) models.add({ x: site.x, y, z: site.z, foundation: true, operational: true });
      const add = (kind: Parameters<typeof models.add>[0]["kind"], offset: number): void => {
        if (!kind) return;
        const construction = constructionSiteForRebuild(deps.state, tile, "economicStructure", rebuildAt);
        models.add({
          kind, x: site.x + (combined ? offset : 0), y, z: site.z + (combined ? 0.18 : 0),
          foundation: !combined || Boolean(tile.observatory), scale: combined ? 0.5 : 1,
          operational: record?.status === "active" && !dormant.has(`${tile.x},${tile.y}:economicStructure`) && districtOperational(tile),
          ...(construction ? { site: construction } : {})
        });
      };
      if (economic && (isDistrictBuilding(tile.economicStructure?.type) || isDistrictProject(tile.economicStructure?.type))) add(tile.economicStructure.type, -0.18);
      return { economic, observatory: false };
    },
    clear: () => { builtDormancy = deps.state.dormantStructures; nextDisabledExpiry = Infinity; models.clear(); sites.clear(); candidates.length = 0; dormant = new Set(deps.state.dormantStructures.map(entry => entry.key)); },
    commit: nextOrigin => { if (nextOrigin) Object.assign(origin, { camX: nextOrigin.camX, camY: nextOrigin.camY }); models.commit(); links.commit(buildDistrictNetwork({ tiles: deps.state.tiles, visibilityAt: deps.visibilityAt, isDormant: tile => dormant.has(`${tile.x},${tile.y}:economicStructure`) }, candidates)); },
    update: (nowMs: number) => { models.update(nowMs); links.refreshSelection(); },
    boundaryPassed: () => builtDormancy !== deps.state.dormantStructures || Date.now() >= nextDisabledExpiry || models.boundaryPassed(),
    dispose: () => { models.dispose(); links.dispose(); sites.clear(); candidates.length = 0; dormant.clear(); },
    diagnostics: { models: models.diagnostics, links: links.diagnostics, worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT }
  };
};
