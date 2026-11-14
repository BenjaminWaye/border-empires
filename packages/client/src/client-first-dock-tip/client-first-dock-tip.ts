// "Your First Dock" card: the first time a tile-delta batch shows the player
// holding a dock, explain what a dock crossing can do. Shown once per account
// through the discovery-tip queue (dismissal persisted per account, same TTL
// as every discovery tip). Only ever about the player's own dock: it never
// points at another dock or anything the player hasn't seen.

import type { Tile } from "../client-types.js";

/** The first tile of this batch that is now a dock held by `me`, or undefined. */
export const ownedDockInBatch = (
  tileUpdates: ReadonlyArray<{ x: number; y: number }>,
  tiles: ReadonlyMap<string, Pick<Tile, "x" | "y" | "ownerId" | "dockId">>,
  me: string,
  keyFor: (x: number, y: number) => string
): { x: number; y: number } | undefined => {
  if (!me) return undefined;
  for (const update of tileUpdates) {
    const tile = tiles.get(keyFor(update.x, update.y));
    if (tile?.dockId && tile.ownerId === me) return { x: tile.x, y: tile.y };
  }
  return undefined;
};

// One account key: once the tip was offered (queued, already seen or muted)
// this session there is nothing left to do, so later batches skip the
// localStorage reads behind the queue's checks.
let offeredFor: string | undefined;

/** Offers the FIRST_DOCK tip when the batch shows a dock of ours; `announce` queues and shows it. */
export const offerFirstDockTip = (
  input: {
    tileUpdates: ReadonlyArray<{ x: number; y: number }>;
    tiles: ReadonlyMap<string, Pick<Tile, "x" | "y" | "ownerId" | "dockId">>;
    me: string;
    authEmail: string | null | undefined;
    keyFor: (x: number, y: number) => string;
  },
  announce: (target: { x: number; y: number }) => void
): boolean => {
  const account = input.authEmail ?? "";
  if (offeredFor === account) return false;
  const dock = ownedDockInBatch(input.tileUpdates, input.tiles, input.me, input.keyFor);
  if (!dock) return false;
  offeredFor = account;
  announce(dock);
  return true;
};

/** Test hook: forget this session's offer. */
export const resetFirstDockTipOfferForTest = (): void => {
  offeredFor = undefined;
};
