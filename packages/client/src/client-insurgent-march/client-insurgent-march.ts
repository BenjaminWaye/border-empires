import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

// Insurgent (Planetary Defense) companies marching out of their camp to the
// tile an ATTACK or EXPAND launches from (server: apps/simulation/src/
// planetary-defense-camps/camp-march.ts). The server sends INSURGENT_MARCH to
// every online player who can see the camp, the launch tile or the target, as
// the march sets out; the 3D map draws the company with the muster transit
// overlay (client-map-3d-muster-transit-sync.ts) and the 2D map with soldier
// glyphs (client-insurgent-march-2d.ts), both from the positions here.
//
// Kept out of ClientState (at its line cap): a march lives at most the
// longest walk out of a camp, and each entry drops once it arrives.

export type InsurgentMarch = {
  id: string;
  actionType: "ATTACK" | "EXPAND";
  campX: number;
  campY: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Local clock: when the company left the camp. */
  startAt: number;
  /** Local clock: when it reaches the launch tile and the fight or claim begins. */
  transitEndsAt: number;
  resolvesAt: number;
};

// Bound on stored marches whatever the server sends (at most one per camp is ever under way).
const MAX_MARCHES = 200;
const marches = new Map<string, InsurgentMarch>();

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

/**
 * Records an INSURGENT_MARCH message. Its resolvesAt/transitEndsAt arrive
 * already aligned to the local clock (client-server-clock.ts, via serverNow).
 */
export const recordInsurgentMarch = (msg: Record<string, unknown>, nowMs: number = Date.now()): InsurgentMarch | undefined => {
  const campX = num(msg.campX);
  const campY = num(msg.campY);
  const fromX = num(msg.fromX);
  const fromY = num(msg.fromY);
  const toX = num(msg.toX);
  const toY = num(msg.toY);
  const transitEndsAt = num(msg.transitEndsAt);
  const resolvesAt = num(msg.resolvesAt);
  const marchMs = num(msg.marchMs);
  const id = typeof msg.commandId === "string" ? msg.commandId : undefined;
  if (campX === undefined || campY === undefined || fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) return undefined;
  if (transitEndsAt === undefined || resolvesAt === undefined || marchMs === undefined || !id || transitEndsAt <= nowMs) return undefined;
  pruneInsurgentMarches(nowMs);
  if (marches.size >= MAX_MARCHES && !marches.has(id)) return undefined;
  const march: InsurgentMarch = {
    id,
    actionType: msg.actionType === "EXPAND" ? "EXPAND" : "ATTACK",
    campX, campY, fromX, fromY, toX, toY,
    startAt: transitEndsAt - Math.max(0, marchMs),
    transitEndsAt,
    resolvesAt
  };
  marches.set(id, march);
  return march;
};

const pruneInsurgentMarches = (nowMs: number): void => {
  for (const [id, march] of marches) if (march.transitEndsAt <= nowMs) marches.delete(id);
};

/** Marches still walking at `nowMs`; arrived ones are dropped. */
export const activeInsurgentMarches = (nowMs: number = Date.now()): InsurgentMarch[] => {
  pruneInsurgentMarches(nowMs);
  return [...marches.values()];
};

/**
 * True while an insurgent company is still walking out of its camp to attack
 * (x, y). The defender's skirmish and the patrol step-aside wait for it to
 * arrive, so the attackers aren't drawn both on the road and already at the front.
 */
export const insurgentMarchToTileUnderWay = (x: number, y: number, nowMs: number = Date.now()): boolean => {
  for (const march of marches.values()) {
    if (march.toX === x && march.toY === y && march.startAt <= nowMs && nowMs < march.transitEndsAt) return true;
  }
  return false;
};

/** New season / world: no march carries over. */
export const clearInsurgentMarches = (): void => {
  marches.clear();
};

// Shortest signed step from a to b on a wrapping axis.
const wrapDelta = (from: number, to: number, size: number): number => {
  let delta = (to - from) % size;
  if (delta > size / 2) delta -= size;
  if (delta < -size / 2) delta += size;
  return delta;
};

/**
 * Where the company is at `nowMs`, in fractional tile coordinates measured
 * from the camp along the shortest (wrapping) straight line to the launch
 * tile: `x`/`y` are the camp plus that offset (not wrapped, so a march over
 * the world seam stays continuous). Undefined before it sets out or after it arrives.
 */
export const insurgentMarchPoint = (
  march: InsurgentMarch,
  nowMs: number
): { x: number; y: number; facingLeft: boolean; progress: number } | undefined => {
  if (nowMs < march.startAt || nowMs >= march.transitEndsAt) return undefined;
  const span = march.transitEndsAt - march.startAt;
  const progress = span > 0 ? (nowMs - march.startAt) / span : 1;
  const dx = wrapDelta(march.campX, march.fromX, WORLD_WIDTH);
  const dy = wrapDelta(march.campY, march.fromY, WORLD_HEIGHT);
  return { x: march.campX + dx * progress, y: march.campY + dy * progress, facingLeft: dx < 0, progress };
};
