import type { ClientState } from "../client-state/client-state.js";

// The March To sheet's server-side odds: an ATTACK_PREVIEW from the march
// origin to its target, flagged `march` so the gateway scores it although the
// two don't border. The client-only estimate (winChanceForTile with no
// modifiers) can't see either side's tech, weapons factories or missing war
// industry, so without this the arrow's label read e.g. 31% against a tile
// the tile menu -- which uses the server preview -- showed at 71%.
//
// Sent through sendGameMessage with no requestId, so the network handler
// caches the result under its plain `from->to` key like any other preview.

const MARCH_PREVIEW_REFRESH_MS = 5_000;

type Point = { x: number; y: number };

export const requestMarchWinChancePreview = (origin: Point, target: Point, sendGameMessage: (payload: unknown) => boolean): void => {
  sendGameMessage({ type: "ATTACK_PREVIEW", fromX: origin.x, fromY: origin.y, toX: target.x, toY: target.y, march: true });
};

/** The cached server win chance for this march (base, before commit/shield scaling), or undefined when none has arrived. */
export const marchPreviewBaseWinChance = (
  state: Pick<ClientState, "attackPreviewCacheByKey">,
  origin: Point,
  target: Point,
  keyFor: (x: number, y: number) => string
): number | undefined => {
  const preview = state.attackPreviewCacheByKey.get(`${keyFor(origin.x, origin.y)}->${keyFor(target.x, target.y)}`);
  return preview?.valid && typeof preview.winChance === "number" ? preview.winChance : undefined;
};

/**
 * Requests the march preview now and again whenever `poll` runs more than
 * MARCH_PREVIEW_REFRESH_MS after the last request, so a sheet left open keeps
 * scoring against current state. `poll` is meant for the sheet's own refresh tick.
 */
export const createMarchWinChancePreviewPoller = (
  origin: Point,
  target: Point,
  sendGameMessage: (payload: unknown) => boolean,
  nowMs: () => number = () => Date.now()
): { poll: () => void } => {
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  const poll = (): void => {
    const now = nowMs();
    if (now - lastRequestAt < MARCH_PREVIEW_REFRESH_MS) return;
    lastRequestAt = now;
    requestMarchWinChancePreview(origin, target, sendGameMessage);
  };
  return { poll };
};
