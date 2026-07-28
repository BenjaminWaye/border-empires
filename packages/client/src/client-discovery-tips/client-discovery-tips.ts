// "Discovery" tooltips: shown the first time the player sees (not necessarily
// owns) a town, dock, barbarian tile, or strategic-resource tile, explaining
// what it is and why they should capture/settle/clear it. Each tip id is
// dismissed for 30 days/a season at a time (see client-discovery-tips-storage.ts),
// and the player can mute all discovery tips for the same window via the
// toast's checkbox.

import type { Tile } from "../client-types.js";
import { isDiscoveryTipSeen, isDiscoveryTipsMuted, markDiscoveryTipSeen, muteDiscoveryTips } from "./client-discovery-tips-storage.js";

export type DiscoveryTipId = "TOWN" | "DOCK" | "BARBARIAN" | "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY";

export type DiscoveryTipDef = { id: DiscoveryTipId; title: string; body: string };

export const DISCOVERY_TIPS: Record<DiscoveryTipId, DiscoveryTipDef> = {
  TOWN: {
    id: "TOWN",
    title: "First Town Discovered!",
    body: "Towns generate Gold and add Manpower cap/regen once captured and settled. Send your army to take this town and grow your empire."
  },
  DOCK: {
    id: "DOCK",
    title: "Dock Discovered!",
    body: "Docks connect to other docks across the sea, letting your army launch attacks and expand onto distant shores. Settle or capture a dock to unlock maritime routes."
  },
  BARBARIAN: {
    id: "BARBARIAN",
    title: "Barbarian Territory Discovered!",
    body: "Barbarian camps spawn nearby barbarian patrols that raid your empire. Attack and clear barbarian tiles for gold and to push back their threat. Each cleared tile expands your border."
  },
  FOOD: {
    id: "FOOD",
    title: "Food Resource Discovered",
    body: "Grain and fishing tiles produce Food, which fuels population growth and keeps your empire's manpower fed. Settle it to start collecting."
  },
  IRON: {
    id: "IRON",
    title: "Iron Resource Discovered",
    body: "Iron tiles produce Iron, needed for manpower and military upkeep. Settle it to strengthen your war effort."
  },
  CRYSTAL: {
    id: "CRYSTAL",
    title: "Crystal Resource Discovered",
    body: "Crystal tiles yield Crystal, a rare strategic resource used for advanced tech and abilities. Settle it to secure this valuable deposit."
  },
  SUPPLY: {
    id: "SUPPLY",
    title: "Supply Resource Discovered",
    body: "Wood and fur tiles produce Supply, used for construction and logistics. Settle it to keep your empire's projects moving."
  }
};

// Maps a raw map tile resource deposit (what's drawn on the tile) to the
// strategic-resource discovery tip it should trigger. Multiple deposit kinds
// can feed the same tip (e.g. FARM and FISH both discover the FOOD tip) —
// mirrors `strategicResourceKeyForTile` in client-map-display.ts.
const discoveryTipIdForTileResource = (resource: string | undefined): DiscoveryTipId | undefined => {
  if (resource === "FARM" || resource === "FISH") return "FOOD";
  if (resource === "IRON") return "IRON";
  if (resource === "GEMS") return "CRYSTAL";
  if (resource === "WOOD" || resource === "FUR") return "SUPPLY";
  return undefined;
};

/**
 * Called when a tile transitions from "never seen before" to "seen" (i.e.
 * `wasKnown` is false for this tile before the merge that produced `tile`).
 * Returns the id of a discovery tip to enqueue, if any, or undefined.
 * Does not itself check/update "seen" storage — callers own the queue and
 * should skip ids already returned by `isDiscoveryTipSeen`/already queued.
 */
export const discoveryTipIdForNewlySeenTile = (tile: Pick<Tile, "town" | "resource" | "dockId" | "ownerId">): DiscoveryTipId | undefined => {
  if (tile.town) return "TOWN";
  if (tile.dockId) return "DOCK";
  if (tile.ownerId?.startsWith("barbarian")) return "BARBARIAN";
  return discoveryTipIdForTileResource(tile.resource);
};

/**
 * Enqueues a discovery tip for a newly-seen tile onto `queue` (in place) if
 * the player hasn't muted all discovery tips, this id hasn't already been
 * dismissed (persisted, within its 30-day/season window), and it isn't
 * already queued this session. Returns true if a tip was enqueued.
 */
export const enqueueDiscoveryTipForNewlySeenTile = (
  queue: DiscoveryTipId[],
  tile: Pick<Tile, "town" | "resource"> | undefined,
  authEmail?: string | null
): boolean => {
  const id = tile && discoveryTipIdForNewlySeenTile(tile);
  if (!id) return false;
  if (isDiscoveryTipsMuted(authEmail)) return false;
  if (queue.includes(id)) return false;
  if (isDiscoveryTipSeen(id, authEmail)) return false;
  queue.push(id);
  return true;
};

/**
 * Marks the active tip (front of queue) as dismissed (30-day/season TTL) and
 * pops it. When `mute` is true (the "Don't show tooltips" checkbox), also
 * suppresses every discovery tip for the same window.
 */
export const dismissActiveDiscoveryTip = (queue: DiscoveryTipId[], authEmail?: string | null, mute = false): void => {
  const id = queue.shift();
  if (id) markDiscoveryTipSeen(id, authEmail);
  if (mute) muteDiscoveryTips(authEmail);
};
