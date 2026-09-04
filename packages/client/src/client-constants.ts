import {
  EXPAND_MANPOWER_COST,
  FOREST_FRONTIER_CLAIM_MULT,
  FRONTIER_CLAIM_COST,
  FRONTIER_CLAIM_MS,
  HILLS_FRONTIER_CLAIM_PENALTY_MS,
  MUSTER_TRANSIT_MS_PER_TILE,
  OBSERVATORY_CAST_RADIUS as SHARED_OBSERVATORY_CAST_RADIUS,
  OBSERVATORY_PROTECTION_RADIUS as SHARED_OBSERVATORY_PROTECTION_RADIUS,
  OBSERVATORY_VISION_BONUS as SHARED_OBSERVATORY_VISION_BONUS,
  SETTLE_MANPOWER_COST,
  SETTLE_MS,
  isForestTileAt,
  isHillsTileAt
} from "@border-empires/shared";

import type { GuideStep } from "./client-types.js";

export const OBSERVATORY_VISION_BONUS = SHARED_OBSERVATORY_VISION_BONUS;
export const OBSERVATORY_PROTECTION_RADIUS = SHARED_OBSERVATORY_PROTECTION_RADIUS;
export const OBSERVATORY_CAST_RADIUS = SHARED_OBSERVATORY_CAST_RADIUS;
export const AIRPORT_BOMBARD_RADIUS = 30;
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 192;
export const DEFAULT_ZOOM = 22;
// Both tuned empirically on-device via the Settings zoom debug readout,
// not derived from DEFAULT_ZOOM — mobile screens want a level closer to
// MAX_ZOOM than the desktop default.
export const MOBILE_LOGIN_ZOOM = 58;
export const DOUBLE_TAP_ZOOM_STEP = 32;
export const GOLD_COST_EPSILON = 1e-6;
export const GUIDE_STORAGE_KEY = "border-empires-guide-complete-v1";
export const GUIDE_AUTO_OPEN_STORAGE_KEY = "border-empires-guide-auto-opened-v1";
export const RENDERER_PROMPT_STORAGE_KEY = "border-empires-renderer-prompt-v1";
export const CAMERA_LOCATION_STORAGE_KEY = "border-empires-camera-location-v1";
export const DISCOVERED_TILES_STORAGE_KEY = "border-empires-discovered-tiles-v1";
// Shared across every "still waiting on auth/session" overlay (the initial
// Firebase auth busy modal in client-auth-ui.ts, and the post-connect
// map-loading overlay in client-map-loading-view.ts). A warm login on
// staging/prod completes in well under 5s, so anything past 8s is already
// abnormal enough to justify a low-risk "grab diagnostics" affordance, even
// though it isn't yet long enough to offer more drastic actions like retry
// or reload (see ACTION_AFFORDANCE_THRESHOLD_MS in client-map-loading-view.ts).
export const AUTH_BUSY_DIAGNOSTICS_THRESHOLD_MS = 8_000;

// A backgrounded tab's socket getting dropped and reconnected (Chrome
// suspends/throttles hidden tabs) is the single most common reason
// state.connection briefly leaves "initialized". Reconnecting in place
// usually finishes well under a second, so blocking the whole game with the
// full map-loading overlay for every one of those blips is worse than the
// disconnect itself. This grace window lets client-hud.ts hold off showing
// that overlay until a disconnect has actually outlasted a normal in-place
// reconnect — see state.disconnectedSince in client-state.ts.
export const RECONNECT_OVERLAY_GRACE_MS = 1_200;

export const guideSteps: GuideStep[] = [
  {
    title: "Welcome to Border Empires",
    body: "Expand, defend, and outmaneuver rival empires. Win the season by holding any victory condition continuously for 24 hours."
  },
  {
    title: "Expand Your Territory",
    body: `Tap a neutral tile next to your border to claim it as frontier (${EXPAND_MANPOWER_COST} manpower). Settle it (${SETTLE_MANPOWER_COST} manpower, ~60s) to produce income and support buildings. Forest tiles take longer. You can develop up to 3 tiles at once.`
  },
  {
    title: "Manpower Is Your Real Currency",
    body: "Manpower — regenerated from your settlements and towns — is what expansion, settling, and building actually cost. Run low and growth stalls, so watch your manpower bar before your gold. Gold is now a support currency: it funds research, a handful of end-game abilities, and Synthesizer upkeep — spend it there, not on land."
  },
  {
    title: "Resource Slots, Not Stockpiles",
    body: "Food, Titanium, Crystal, and Umbrite aren't stockpiled anymore — each resource tile grants a fixed number of slots, and every structure that needs that resource permanently occupies one. Run out of free slots and the newest structure of that type goes dormant (no bonus, but it stays standing) until you free up or claim more slots of that type."
  },
  {
    title: "Build Structures & Fight",
    body: "Open the Actions menu on your land. Forts boost defense on settled tiles. Siege Outposts near borders boost your attack. Observatories expand vision and enable abilities. Economic buildings (farms, mines, rigs, mintworks, granaries) generate resources and support towns. Build 3 things at once. To attack, tap an enemy-adjacent tile — it costs manpower. Attacks rely on mustering forces — plant up to 5 muster flags on your tiles to gather manpower near the front. Odds depend on your outposts vs their forts. Frontier tiles have no defense and always fall."
  },
  {
    title: "Research & Abilities",
    body: "Research technologies in the Tech panel for permanent bonuses — techs and domains cost gold (plus Shard at higher tiers), not Food/Titanium/Crystal/Umbrite. Every combat ability (Reveal Empire, Aether Bridge, Aether Lance, Siphon, Survey Sweep, and more) is free to cast, gated only by its own cooldown. After key techs, choose a domain for passive bonuses."
  },
  {
    title: "Towns & Expansion",
    body: "Towns grow in size with increasing population (Settlement → Town → City → Great City → Metropolis). A Mintworks enables a town's gold income; a Granary enables population growth. Connecting towns with settled land creates a road network that boosts gold income. Population is what raises your manpower cap for war, so growing towns matters as much as growing gold. Docks on coastlines let you attack across water. Form alliances to coordinate. Truces prevent attacks — breaking one incurs a penalty. Clear barbarians for gold."
  },
  {
    title: "Win the Season",
    body: "Track 5 victory races in the Victory panel. Town Control (50% of towns), Economic Hegemony (lead the field by a wide margin once your income clears a minimum bar), Resource Monopoly (80% of one resource type), Maritime Supremacy (55% of docks), and Diplomatic Dominance (your alliance holds 66% of land). Hold any condition for 24 hours to win. Build wonders (Imperial Exchange, World Engine, Aegis Dome, Astral Dock) for powerful end-game abilities — only one of each exists per season, so the first empire to finish one claims it for good."
  }
];

export { MUSTER_TRANSIT_MS_PER_TILE };
export const MUSTER_AUTO_FLAG_THRESHOLD_TILES = 20;
// A parked attack's auto-created flag (SET_MUSTER) is fire-and-forget — no
// optimistic local state, no ack tracking. If the server rejects it (e.g.
// MUSTER_LIMIT: "max 3 muster tiles per player") the pending attack would
// otherwise wait forever on a flag that will never exist. Comfortably past
// any real round trip, so a legitimate in-flight request is never mistaken
// for a rejected one.
export const MUSTER_FLAG_REQUEST_TIMEOUT_MS = 5_000;

export const canAffordCost = (gold: number, cost: number): boolean => gold + GOLD_COST_EPSILON >= cost;

export const formatGoldAmount = (gold: number): string => gold.toFixed(2);
export const formatManpowerAmount = (manpower: number): string => manpower.toFixed(0);

export const isForestTile = isForestTileAt;
export const isHillsTile = isHillsTileAt;

export const frontierClaimDurationMsForTile = (x: number, y: number): number => {
  if (isForestTile(x, y)) return FRONTIER_CLAIM_MS * FOREST_FRONTIER_CLAIM_MULT;
  if (isHillsTile(x, y)) return FRONTIER_CLAIM_MS + HILLS_FRONTIER_CLAIM_PENALTY_MS;
  return FRONTIER_CLAIM_MS;
};
export const settleDurationMsForTile = (x: number, y: number): number => {
  // Matches the 1.5x forest/hills penalty used by frontierClaimDurationMsForTile —
  // this used to be a flat 2x, which didn't get the memo when claim was retuned.
  if (isForestTile(x, y)) return SETTLE_MS * 1.5;
  if (isHillsTile(x, y)) return SETTLE_MS * 1.5;
  return SETTLE_MS;
};

export const frontierClaimCostLabelForTile = (x: number, y: number): string => {
  const seconds = Math.round(frontierClaimDurationMsForTile(x, y) / 1000);
  const costLabel = `${EXPAND_MANPOWER_COST} manpower + ${FRONTIER_CLAIM_COST} gold`;
  if (isForestTile(x, y)) return `${costLabel} • ${seconds}s (Forest)`;
  if (isHillsTile(x, y)) return `${costLabel} • ${seconds}s (Hills)`;
  return `${costLabel} • ${seconds}s`;
};
