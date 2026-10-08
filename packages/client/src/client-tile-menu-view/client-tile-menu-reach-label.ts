import { escapeHtml } from "../client-duke-panel/client-duke-escape.js";
import type { Tile } from "../client-types.js";

export type RivalReachLabel = { ownerId: string; text: string; html: string };

/**
 * Header label for unowned land that lies inside another player's reach
 * ("Inside Rival's reach"): nobody owns the tile, but the wire's
 * `tile.reachOwnerId` says whose border covers it. Undefined for owned
 * tiles, water, your own reach and barbarian reach (environment, not a
 * bordered empire -- same exclusion as client-reach-overlay-all-owners).
 * `html` is escaped; `text` is the plain-text twin.
 */
export const rivalReachLabel = (
  tile: Pick<Tile, "ownerId" | "reachOwnerId" | "terrain">,
  viewerId: string,
  playerNameForOwner: (ownerId?: string | null) => string | undefined
): RivalReachLabel | undefined => {
  const reachOwnerId = tile.reachOwnerId;
  if (tile.ownerId || !reachOwnerId || reachOwnerId === viewerId || reachOwnerId.startsWith("barbarian-")) return undefined;
  if (tile.terrain === "SEA" || tile.terrain === "COASTAL_SEA") return undefined;
  const name = playerNameForOwner(reachOwnerId) ?? reachOwnerId.slice(0, 8);
  const text = `Inside ${name}'s reach`;
  return { ownerId: reachOwnerId, text, html: escapeHtml(text) };
};
