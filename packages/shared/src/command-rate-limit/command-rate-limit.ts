// The gateway's per-player durable-command token bucket
// (apps/realtime-gateway/src/command-rate-limiter), shared so the client can
// pace its own sends under it instead of having bursts (Garrison Many,
// settle-connected, queue promotion) rejected with COMMAND_RATE_LIMITED.
export const COMMAND_RATE_LIMIT_CAPACITY = 20;
export const COMMAND_RATE_LIMIT_REFILL_PER_SECOND = 5;

/**
 * Client message types the gateway counts against that bucket: every durable
 * command except ATTACK/EXPAND (those go through submitFrontierCommand, which
 * is not rate limited). A gateway test pins this list to DurableCommandTypeSchema.
 */
export const RATE_LIMITED_COMMAND_TYPES: readonly string[] = [
  "SETTLE", "BUILD_FORT", "BUILD_OBSERVATORY", "BUILD_SIEGE_BATTERY", "BUILD_ECONOMIC_STRUCTURE",
  "CANCEL_FORT_BUILD", "CANCEL_STRUCTURE_BUILD", "RUSH_BUY", "CANCEL_SETTLE", "REMOVE_STRUCTURE",
  "CANCEL_SIEGE_BATTERY_BUILD", "CANCEL_CAPTURE", "UNCAPTURE_TILE", "CHOOSE_TECH", "CHOOSE_DOMAIN",
  "SET_CONVERTER_STRUCTURE_ENABLED", "SET_CONVERTER_STRUCTURE_MODE", "ASSIGN_REFINERY_FIELD",
  "SET_OBSERVATORY_ENABLED", "REVEAL_EMPIRE", "REVEAL_EMPIRE_STATS", "SURVEY_SWEEP", "AETHER_LANCE",
  "AETHER_EMP", "SUPPRESS_AETHER_TOWER", "HIJACK_AETHER_TOWER", "RECRUIT_ANCILLARIES",
  "SHIP_SALVAGE_TO_COURT", "ACTIVATE_WAYSTATION", "FORCED_ANCILLARIFICATION", "CAST_AETHER_BRIDGE", "CAST_AETHER_WALL",
  "SIPHON_TILE", "PURGE_SIPHON", "CANCEL_SIPHON", "CREATE_MOUNTAIN", "REMOVE_MOUNTAIN", "RETORT_RECAST",
  "REDEPLOY_AFC_MODULE", "BUILD_AFC", "WITHDRAW_AND_REDEPLOY", "SKY_DOCK_BOMBARD", "IMPERIAL_EXCHANGE_LEVY",
  "SOVEREIGN_SIEGE_ENGINE_STRIKE", "AEGIS_LOCK", "ASTRAL_DOCK_LAUNCH", "TITANIUM_LEVY_MUSTER",
  "UPGRADE_TOWN_TIER", "SET_MUSTER", "CLEAR_MUSTER", "UPGRADE_MUSTER_CAP", "DEV_QUEUE_ENQUEUE",
  "DEV_QUEUE_CANCEL", "DEV_QUEUE_MOVE_TO_FRONT", "WAYPOINT_ENQUEUE", "WAYPOINT_CANCEL",
  "WAYPOINT_CANCEL_ALL", "CLAIM_CONTINUATION_SET", "SET_AUTO_SETTLE_PREFS", "NAME_ISLAND",
  "CHOOSE_HOUSE_CHARGES", "EXPLORE", "RECALL_SCOUT"
];

const rateLimitedCommandTypeSet: ReadonlySet<string> = new Set(RATE_LIMITED_COMMAND_TYPES);
export const isRateLimitedCommandType = (type: unknown): boolean => typeof type === "string" && rateLimitedCommandTypeSet.has(type);
