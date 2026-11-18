import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";

// "Your empire fell to X": who took the most of a fallen empire's land, read
// from the bounded 24h territory-flip log at the moment of elimination. Counts
// distinct tiles, each by its latest loss (a tile lost to A, retaken, then
// lost to B counts for B). A tie goes to whoever took a tile most recently.
// Rare (once per elimination), so a scan of the log is fine.
export const topCaptorOf = (victimId: string, flips: readonly TerritoryFlip[]): string | undefined => {
  const latestLossByTile = new Map<string, { captorId: string; at: number }>();
  for (const flip of flips) {
    if (flip.fromOwner !== victimId || flip.toOwner === undefined || flip.toOwner === victimId) continue;
    const existing = latestLossByTile.get(flip.tileId);
    if (!existing || flip.at >= existing.at) latestLossByTile.set(flip.tileId, { captorId: flip.toOwner, at: flip.at });
  }
  const tally = new Map<string, { tiles: number; lastAt: number }>();
  for (const { captorId, at } of latestLossByTile.values()) {
    const entry = tally.get(captorId) ?? { tiles: 0, lastAt: 0 };
    entry.tiles += 1;
    entry.lastAt = Math.max(entry.lastAt, at);
    tally.set(captorId, entry);
  }
  let best: { id: string; tiles: number; lastAt: number } | undefined;
  for (const [id, entry] of tally) {
    if (!best || entry.tiles > best.tiles || (entry.tiles === best.tiles && entry.lastAt > best.lastAt)) best = { id, ...entry };
  }
  return best?.id;
};
