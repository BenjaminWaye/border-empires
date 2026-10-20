import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import type { FrontierSupplyLink, FrontierSupplyModel } from "./client-frontier-supply.js";

/**
 * Turns the supply model's per-tile hops into drawable routes: one polyline
 * per unbranched stretch of the supply tree, smoothed, with each point's
 * distance from the cut tile (so dashes run continuously across a fork).
 * Shared by the 2D and 3D renderers so both draw the same shapes.
 *
 * Points are in tile units, tile centres at integer coordinates. A route's
 * first point is its real (wrapped) tile coordinate; later points are
 * unwrapped relative to it, so a route crossing the world seam stays
 * continuous -- renderers place the first point and offset the rest.
 */

export type SupplyRoutePoint = {
  x: number;
  y: number;
  /** Distance along the supply tree from the cut tile, tiles. */
  distance: number;
};

export type SupplyRoute = {
  points: SupplyRoutePoint[];
};

export type SupplyRouteOptions = {
  worldWidth?: number;
  worldHeight?: number;
  /** Chaikin corner-cutting passes; 0 keeps the raw tile-centre polyline. */
  smoothing?: number;
};

const wrapDelta = (from: number, to: number, size: number): number => {
  let delta = to - from;
  if (delta > size / 2) delta -= size;
  if (delta < -size / 2) delta += size;
  return delta;
};

const pointKey = (p: { x: number; y: number }): string => `${p.x},${p.y}`;

const lerpPoint = (a: SupplyRoutePoint, b: SupplyRoutePoint, t: number): SupplyRoutePoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  distance: a.distance + (b.distance - a.distance) * t
});

/** Chaikin corner cutting, keeping both endpoints so routes still meet at junctions. */
const smooth = (points: SupplyRoutePoint[], passes: number): SupplyRoutePoint[] => {
  let current = points;
  for (let pass = 0; pass < passes && current.length > 2; pass += 1) {
    const next: SupplyRoutePoint[] = [current[0]!];
    for (let i = 0; i < current.length - 1; i += 1) {
      next.push(lerpPoint(current[i]!, current[i + 1]!, 0.25), lerpPoint(current[i]!, current[i + 1]!, 0.75));
    }
    next.push(current[current.length - 1]!);
    current = next;
  }
  return current;
};

export const buildSupplyRoutes = (model: FrontierSupplyModel, options: SupplyRouteOptions = {}): SupplyRoute[] => {
  const width = options.worldWidth ?? WORLD_WIDTH;
  const height = options.worldHeight ?? WORLD_HEIGHT;
  const passes = options.smoothing ?? 2;

  const linksFrom = new Map<string, FrontierSupplyLink[]>();
  const fedTiles = new Set<string>();
  for (const link of model.links) {
    const from = pointKey(link.from);
    const list = linksFrom.get(from);
    if (list) list.push(link);
    else linksFrom.set(from, [link]);
    fedTiles.add(pointKey(link.to));
  }

  // Each pending stretch starts at a tile with a known distance and position,
  // then walks single-child hops until the tree branches or ends.
  type Pending = { link: FrontierSupplyLink; startX: number; startY: number; startDistance: number };
  const pending: Pending[] = [];
  for (const [fromKey, links] of linksFrom) {
    if (fedTiles.has(fromKey)) continue; // fed from inside another stretch: started from there
    for (const link of links) pending.push({ link, startX: link.from.x, startY: link.from.y, startDistance: 0 });
  }

  const routes: SupplyRoute[] = [];
  while (pending.length > 0) {
    const { link: first, startX, startY, startDistance } = pending.pop()!;
    const raw: SupplyRoutePoint[] = [{ x: startX, y: startY, distance: startDistance }];
    let link = first;
    let x = startX;
    let y = startY;
    let distance = startDistance;
    for (;;) {
      const dx = wrapDelta(link.from.x, link.to.x, width);
      const dy = wrapDelta(link.from.y, link.to.y, height);
      x += dx;
      y += dy;
      distance += Math.hypot(dx, dy);
      raw.push({ x, y, distance });
      const onward = linksFrom.get(pointKey(link.to));
      if (!onward) break;
      if (onward.length > 1) {
        for (const child of onward) pending.push({ link: child, startX: x, startY: y, startDistance: distance });
        break;
      }
      link = onward[0]!;
    }
    // Re-anchor on the real tile coordinate of the route's first point, so renderers can place it directly.
    const anchorDx = first.from.x - startX;
    const anchorDy = first.from.y - startY;
    const anchored = raw.map((p) => ({ ...p, x: p.x + anchorDx, y: p.y + anchorDy }));
    routes.push({ points: smooth(anchored, passes) });
  }
  return routes;
};

/**
 * `buildSupplyRoutes` memoised per model object (models are immutable and
 * replaced on change; see frontierSupplyModelForState), so the 2D renderer
 * can ask every frame. A WeakMap: entries go away with their model.
 */
const routeCache = new WeakMap<FrontierSupplyModel, SupplyRoute[]>();
export const supplyRoutesFor = (model: FrontierSupplyModel): SupplyRoute[] => {
  let routes = routeCache.get(model);
  if (!routes) {
    routes = buildSupplyRoutes(model);
    routeCache.set(model, routes);
  }
  return routes;
};
