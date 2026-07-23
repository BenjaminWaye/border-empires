import {
  FRONTIER_CLAIM_COST,
  FRONTIER_CLAIM_MS,
  OBSERVATORY_CAST_RADIUS as SHARED_OBSERVATORY_CAST_RADIUS,
  OBSERVATORY_PROTECTION_RADIUS as SHARED_OBSERVATORY_PROTECTION_RADIUS,
  OBSERVATORY_VISION_BONUS as SHARED_OBSERVATORY_VISION_BONUS,
  SETTLE_MS,
  isForestTileAt
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
export const COLLECT_VISIBLE_COOLDOWN_MS = 20_000;
// Shared across every "still waiting on auth/session" overlay (the initial
// Firebase auth busy modal in client-auth-ui.ts, and the post-connect
// map-loading overlay in client-map-loading-view.ts). A warm login on
// staging/prod completes in well under 5s, so anything past 8s is already
// abnormal enough to justify a low-risk "grab diagnostics" affordance, even
// though it isn't yet long enough to offer more drastic actions like retry
// or reload (see ACTION_AFFORDANCE_THRESHOLD_MS in client-map-loading-view.ts).
export const AUTH_BUSY_DIAGNOSTICS_THRESHOLD_MS = 8_000;

export const guideSteps: GuideStep[] = [
  {
    title: "Welcome to Border Empires",
    body: "Expand, defend, and outmaneuver rival empires. Win the season by holding any victory condition continuously for 24 hours."
  },
  {
    title: "Expand Your Territory",
    body: "Tap a neutral tile next to your border to claim it as frontier (1 gold). Settle it (4 gold, ~60s) to produce income and support buildings. Forest tiles take longer. You can develop up to 3 tiles at once."
  },
  {
    title: "Manage Resources",
    body: "Gold and resources trickle in passively from settled tiles, but each resource has a cap — increase the cap by expanding production. Gold funds expansion and building. Manpower regenerates from your settlements and is spent on attacks and forts. Food grows towns, Iron/Crystal/Supply build military structures and fuel abilities. Shards appear during the season for building wonders. Structures and settled tiles cost gold upkeep — overbuilding drains your treasury."
  },
  {
    title: "Build Structures & Fight",
    body: "Open the Actions menu on your land. Forts boost defense on settled tiles. Siege Outposts near borders boost your attack. Observatories expand vision and enable abilities. Economic buildings (farms, mines, camps, markets, granaries) generate resources and support towns. Build 3 things at once. To attack, tap an enemy-adjacent tile — it costs gold + manpower. Attacks rely on mustering forces — plant up to 5 muster flags on your tiles to gather manpower near the front. Odds depend on your outposts vs their forts. Frontier tiles have no defense and always fall."
  },
  {
    title: "Research & Abilities",
    body: "Research technologies in the Tech panel for permanent bonuses. Abilities cost Crystal and have cooldowns: Reveal Empire (see enemy territory), Aether Bridge (cross water), Aether Lance (destroy a structure), Siphon (steal tile income), Survey Sweep (find resources). After key techs, choose a domain for passive bonuses."
  },
  {
    title: "Towns & Expansion",
    body: "Towns grow in size with increasing population (Settlement → Town → City → Great City → Metropolis). A Market enables a town's gold income; a Granary enables population growth. Connecting towns with settled land creates a road network that boosts gold income. Gold powers your empire; population increases your manpower cap for war. Docks on coastlines let you attack across water. Form alliances to coordinate. Truces prevent attacks — breaking one incurs a penalty. Clear barbarians for gold."
  },
  {
    title: "Win the Season",
    body: "Track 5 victory races in the Victory panel. Town Control (50% of towns), Economic Hegemony (lead by 33% at 200+ gold/min), Resource Monopoly (80% of one resource type), Maritime Supremacy (55% of docks), and Diplomatic Dominance (your alliance holds 66% of land). Hold any condition for 24 hours to win. Build wonders (Imperial Exchange, World Engine, Aegis Dome, Astral Dock) for powerful end-game abilities."
  }
];

export const MUSTER_TRANSIT_MS_PER_TILE = 2_000;
export const MUSTER_AUTO_FLAG_THRESHOLD_TILES = 10;

export const canAffordCost = (gold: number, cost: number): boolean => gold + GOLD_COST_EPSILON >= cost;

export const formatGoldAmount = (gold: number): string => gold.toFixed(2);
export const formatManpowerAmount = (manpower: number): string => manpower.toFixed(0);

export const isForestTile = isForestTileAt;

export const frontierClaimDurationMsForTile = (x: number, y: number): number => (isForestTile(x, y) ? FRONTIER_CLAIM_MS * 4 : FRONTIER_CLAIM_MS);
export const settleDurationMsForTile = (x: number, y: number): number => (isForestTile(x, y) ? SETTLE_MS * 2 : SETTLE_MS);

export const frontierClaimCostLabelForTile = (x: number, y: number): string => {
  const seconds = Math.round(frontierClaimDurationMsForTile(x, y) / 1000);
  return isForestTile(x, y) ? `${FRONTIER_CLAIM_COST} gold • ${seconds}s (Forest)` : `${FRONTIER_CLAIM_COST} gold • ${seconds}s`;
};
