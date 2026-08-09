// "Discovery" tooltips: shown the first time the player sees (not necessarily
// owns) a town, dock, barbarian tile, strategic-resource tile, or natural
// wonder, explaining what it is and why they should capture/settle/clear it.
// Each tip id is dismissed for 30 days/a season at a time (see
// client-discovery-tips-storage.ts), and the player can mute all discovery
// tips for the same window via the toast's checkbox.

import { NATURAL_WONDER_LABELS, type NaturalWonderType } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { isDiscoveryTipSeen, isDiscoveryTipsMuted, markDiscoveryTipSeen, muteDiscoveryTips } from "./client-discovery-tips-storage.js";

export type DiscoveryTipId = "TOWN" | "DOCK" | "BARBARIAN" | "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | NaturalWonderType;

export type DiscoveryTipDef = { id: DiscoveryTipId; title: string; body: string };

const capitalizeFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// One discovery tip per natural wonder, generated from the shared label data
// (name/flavor/boon) so the copy stays in sync with NATURAL_WONDER_LABELS
// instead of being duplicated here.
const NATURAL_WONDER_DISCOVERY_TIPS: Record<NaturalWonderType, DiscoveryTipDef> = Object.fromEntries(
  (Object.entries(NATURAL_WONDER_LABELS) as [NaturalWonderType, { name: string; flavor: string; boon: string }][]).map(([type, { name, flavor, boon }]) => [
    type,
    {
      id: type,
      title: `Natural Wonder Discovered: ${capitalizeFirst(name)}!`,
      body: `${capitalizeFirst(flavor)}. Claim ${name} for: ${boon}.`
    }
  ])
) as Record<NaturalWonderType, DiscoveryTipDef>;

export const DISCOVERY_TIPS: Record<DiscoveryTipId, DiscoveryTipDef> = {
  TOWN: {
    id: "TOWN",
    title: "First Town Discovered!",
    body: "Towns generate Gold, increase your Manpower cap and regeneration, and require Food to remain productive. Keep your towns fed to sustain your economy. Capture and settle towns to expand your empire."
  },
  DOCK: {
    id: "DOCK",
    title: "Dock Discovered!",
    body: "Docks generate Gold and connect to other docks across the sea, allowing your armies to attack and expand onto distant shores. Capture a dock to unlock maritime routes."
  },
  BARBARIAN: {
    id: "BARBARIAN",
    title: "Barbarian Territory Discovered!",
    body: "Barbarian patrols raid your empire. Attack and clear barbarian tiles to earn Gold and eliminate the threat. A successful barbarian raid on your territory allows the barbarians to multiply and spread, making them increasingly dangerous."
  },
  FOOD: {
    id: "FOOD",
    title: "Food Resource Discovered",
    body: "Grain and fishing tiles produce Food, which keeps your towns productive. Capture food to feed your towns and sustain supporting infrastructure."
  },
  IRON: {
    id: "IRON",
    title: "Iron Resource Discovered",
    body: "Iron deposits provide Iron, a strategic resource used to build defensive structures. Capture Iron to strengthen your defenses."
  },
  CRYSTAL: {
    id: "CRYSTAL",
    title: "Crystal Resource Discovered",
    body: "Crystal deposits provide Crystal, a rare strategic resource used to power Aether abilities. Capture Crystal to secure this valuable resource."
  },
  SUPPLY: {
    id: "SUPPLY",
    title: "Supply Resource Discovered",
    body: "Fur deposits provide Supply, a strategic resource used for offensive military structures and coordinating attacks with multiple Mustering Flags."
  },
  ...NATURAL_WONDER_DISCOVERY_TIPS
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
export const discoveryTipIdForNewlySeenTile = (
  tile: Pick<Tile, "town" | "resource" | "dockId" | "ownerId" | "naturalWonder">
): DiscoveryTipId | undefined => {
  if (tile.naturalWonder) return tile.naturalWonder.type;
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
  tile: Pick<Tile, "town" | "resource" | "dockId" | "ownerId" | "naturalWonder"> | undefined,
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
