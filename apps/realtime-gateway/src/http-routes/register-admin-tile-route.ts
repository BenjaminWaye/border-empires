// GET /admin/tile?x=&y=&radius=0..6&playerId= -- read-only view of the
// server's authoritative tiles around a coordinate (terrain, owner, every
// structure overlay), and optionally what one player's live vision filter
// lets them see of each. Built on the existing FetchTileDetail RPC (3x3 per
// call), so it needs no protocol or simulation change; see
// admin-tile-inspect.ts for the block maths.
//
// The visibility pass is the sim's *current* live-vision filter, not the
// client's fog memory, and it feeds the sim's visibility audit like any other
// player export. After a season ends the sim forces full visibility for
// everyone, which the response notes. A timed-out call only stops being
// awaited (the sim client has no per-call deadline), so a stalled sim can
// still finish orphaned calls later.
import type { FastifyInstance } from "fastify";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import type { AdminHttpRequest } from "../admin-auth/admin-auth.js";
import {
  ADMIN_TILE_MAX_RADIUS,
  blockCentres,
  classifyVisibility,
  describeTile,
  isInSquare,
  renderGrid,
  tileGridChar,
  tileKey,
  VISIBILITY_GRID_CHAR,
  type TileVisibility,
  type WireTile
} from "../admin-tile-inspect/admin-tile-inspect.js";

const CALL_TIMEOUT_MS = 3_000;
const REQUEST_BUDGET_MS = 10_000;
// Viewer id for the full-visibility pass: that path never looks the player up.
const FULL_VIEW_PLAYER_ID = "admin";

export type RegisterAdminTileRouteDeps = {
  adminRequestAuthorized: (request: AdminHttpRequest) => Promise<boolean>;
  fetchTileDetail?: ((playerId: string, x: number, y: number, fullVisibility?: boolean) => Promise<{ tiles: WireTile[] }>) | undefined;
  getAdminPlayers: () => Promise<Array<{ id: string }>>;
  getCurrentSeasonSummary: () => Promise<{ status: string }>;
  now?: () => number;
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });

const parseInteger = (raw: unknown): number | undefined => {
  if (typeof raw !== "string" || !/^-?\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
};

export const registerAdminTileRoute = (app: FastifyInstance, deps: RegisterAdminTileRouteDeps): void => {
  const now = deps.now ?? Date.now;
  // One inspection at a time: each can issue up to 50 RPCs on the sim's main loop.
  let busy = false;

  app.get("/admin/tile", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!(await deps.adminRequestAuthorized(request))) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const query = (request.query ?? {}) as Record<string, unknown>;
    const rawX = parseInteger(query.x);
    const rawY = parseInteger(query.y);
    const radius = query.radius === undefined ? 3 : parseInteger(query.radius);
    if (rawX === undefined || rawY === undefined || radius === undefined || radius < 0 || radius > ADMIN_TILE_MAX_RADIUS) {
      reply.code(400);
      return { ok: false, error: `x and y must be integers and radius 0..${ADMIN_TILE_MAX_RADIUS}` };
    }
    const fetchTileDetail = deps.fetchTileDetail;
    if (!fetchTileDetail) {
      reply.code(503);
      return { ok: false, error: "tile inspection is unavailable: simulation FetchTileDetail is not wired" };
    }
    const playerId = typeof query.playerId === "string" && query.playerId.length > 0 ? query.playerId : undefined;
    if (busy) {
      reply.code(429);
      return { ok: false, error: "another tile inspection is running; retry shortly" };
    }
    busy = true;
    try {
      if (playerId && !(await deps.getAdminPlayers()).some((player) => player.id === playerId)) {
        reply.code(404);
        return { ok: false, error: `unknown playerId ${playerId} in the current season` };
      }
      const x = ((rawX % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
      const y = ((rawY % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
      const startedAt = now();
      const deadline = startedAt + REQUEST_BUDGET_MS;
      const errors: string[] = [];
      // Fetched first so a finished season's forced full visibility is always
      // known before the visibility pass is read.
      const seasonStatus = await withTimeout(deps.getCurrentSeasonSummary(), CALL_TIMEOUT_MS).then(
        (summary) => summary.status,
        (error: unknown) => {
          errors.push(`season status: ${error instanceof Error ? error.message : String(error)}`);
          return undefined;
        }
      );
      const fetchBlock = async (centre: { x: number; y: number }, viewer: string, fullVisibility: boolean): Promise<WireTile[] | undefined> => {
        const pass = fullVisibility ? "full" : "player";
        const remaining = deadline - now();
        if (remaining <= 0) {
          errors.push(`budget exhausted before block (${centre.x},${centre.y}) ${pass} pass`);
          return undefined;
        }
        try {
          const result = await withTimeout(fetchTileDetail(viewer, centre.x, centre.y, fullVisibility), Math.min(CALL_TIMEOUT_MS, remaining));
          return result.tiles.filter((tile) => isInSquare(tile, x, y, radius, WORLD_WIDTH, WORLD_HEIGHT));
        } catch (error) {
          errors.push(`block (${centre.x},${centre.y}) ${pass} pass: ${error instanceof Error ? error.message : String(error)}`);
          return undefined;
        }
      };

      // Both passes for a block run back to back, so a tick between them can
      // only skew one 3x3 block rather than the whole comparison.
      const fullTiles = new Map<string, WireTile>();
      const playerTiles = playerId ? new Map<string, WireTile>() : undefined;
      const playerFailedKeys = new Set<string>();
      for (const centre of blockCentres(x, y, radius, WORLD_WIDTH, WORLD_HEIGHT)) {
        const full = await fetchBlock(centre, playerId ?? FULL_VIEW_PLAYER_ID, true);
        for (const tile of full ?? []) fullTiles.set(tileKey(tile.x, tile.y), tile);
        if (!playerId || !playerTiles) continue;
        const seen = await fetchBlock(centre, playerId, false);
        if (seen) {
          for (const tile of seen) playerTiles.set(tileKey(tile.x, tile.y), tile);
        } else {
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) playerFailedKeys.add(tileKey((centre.x + dx + WORLD_WIDTH) % WORLD_WIDTH, (centre.y + dy + WORLD_HEIGHT) % WORLD_HEIGHT));
          }
        }
      }

      const visibilityByKey = new Map<string, TileVisibility>();
      const tiles = [...fullTiles.values()]
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((tile) => {
          if (!playerTiles) return describeTile(tile);
          const key = tileKey(tile.x, tile.y);
          const { visibility, hiddenFields } = classifyVisibility(tile, playerTiles.get(key), playerFailedKeys.has(key));
          visibilityByKey.set(tileKey(tile.x, tile.y), visibility);
          return { ...describeTile(tile), visibleToPlayer: visibility, ...(hiddenFields.length > 0 ? { hiddenFromPlayer: hiddenFields } : {}) };
        });
      const terrainGrid = renderGrid(x, y, radius, WORLD_WIDTH, WORLD_HEIGHT, (wx, wy) => {
        const tile = fullTiles.get(tileKey(wx, wy));
        return tile ? tileGridChar(tile) : undefined;
      });
      const visibilityGrid = playerTiles
        ? renderGrid(x, y, radius, WORLD_WIDTH, WORLD_HEIGHT, (wx, wy) => {
            const visibility = visibilityByKey.get(tileKey(wx, wy));
            return visibility ? VISIBILITY_GRID_CHAR[visibility] : undefined;
          })
        : undefined;

      return {
        ok: true,
        center: { x, y },
        radius,
        tookMs: now() - startedAt,
        world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
        ...(seasonStatus ? { seasonStatus } : {}),
        ...(playerId ? { playerId } : {}),
        ...(playerId && seasonStatus === "ended" ? { visibilityNote: "season ended: the sim forces full visibility for every player" } : {}),
        legend: {
          grid: "rows north->south prefixed by y; columns west->east from x-radius. T town, A AFC, F fort, O observatory, S siege battery, B relay beacon, E other economic structure, * other overlay, ~ sea, c coastal sea, ^ mountain, . land, x no terrain sent, ? not returned (failed, timed out or over budget: see errors)",
          ...(visibilityGrid ? { visibilityGrid: "# fully visible, r returned but differs from the full view (see hiddenFromPlayer), - not visible, ? unknown (that block's player call failed: see errors)" } : {})
        },
        grid: terrainGrid,
        ...(visibilityGrid ? { visibilityGrid } : {}),
        ...(errors.length > 0 ? { errors } : {}),
        tiles
      };
    } finally {
      busy = false;
    }
  });
};
