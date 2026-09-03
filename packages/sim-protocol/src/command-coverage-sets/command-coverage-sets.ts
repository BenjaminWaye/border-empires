const DURABLE_COMMAND_TYPES = [
  "ATTACK",
  "EXPAND",
  "SETTLE",
  "BUILD_FORT",
  "BUILD_OBSERVATORY",
  "BUILD_SIEGE_OUTPOST",
  "BUILD_ECONOMIC_STRUCTURE",
  "CANCEL_FORT_BUILD",
  "CANCEL_STRUCTURE_BUILD",
  "RUSH_BUY",
  "CANCEL_SETTLE",
  "REMOVE_STRUCTURE",
  "CANCEL_SIEGE_OUTPOST_BUILD",
  "CANCEL_CAPTURE",
  "UNCAPTURE_TILE",
  "COLLECT_TILE",
  "COLLECT_VISIBLE",
  "CHOOSE_TECH",
  "CHOOSE_DOMAIN",
  "SET_CONVERTER_STRUCTURE_ENABLED",
  "SET_CONVERTER_STRUCTURE_MODE",
  "SET_OBSERVATORY_ENABLED",
  "REVEAL_EMPIRE",
  "REVEAL_EMPIRE_STATS",
  "SURVEY_SWEEP",
  "AETHER_LANCE",
  "CAST_AETHER_BRIDGE",
  "CAST_AETHER_WALL",
  "SIPHON_TILE",
  "PURGE_SIPHON",
  "CREATE_MOUNTAIN",
  "REMOVE_MOUNTAIN",
  "AIRPORT_BOMBARD",
  "IMPERIAL_EXCHANGE_LEVY",
  "WORLD_ENGINE_STRIKE",
  "TITANIUM_LEVY_MUSTER",
  "AEGIS_LOCK",
  "ASTRAL_DOCK_LAUNCH",
  "ACTIVATE_IMPERIAL_WARD",
  "COLLECT_SHARD",
  "UPGRADE_TOWN_TIER",
  "SET_MUSTER",
  "CLEAR_MUSTER",
  "UPGRADE_MUSTER_CAP",
  "DEV_QUEUE_ENQUEUE",
  "DEV_QUEUE_CANCEL",
  "DEV_QUEUE_MOVE_TO_FRONT",
  "WAYPOINT_ENQUEUE",
  "WAYPOINT_CANCEL",
  "WAYPOINT_CANCEL_ALL",
  "CLAIM_CONTINUATION_SET"
] as const;

// DEV_QUEUE_*/WAYPOINT_* commands mutate PlayerRuntimeSummary.devQueue/
// waypointQueue (see player-runtime-summary.ts). Those fields are now
// snapshotted (current-value, like strategicResources) into
// initialState.players[].devQueue/waypointQueue on every checkpoint and
// reseeded on boot (event-recovery-player-state.ts,
// createPlayerRuntimeSummaryFromRecovered), so they're durable across a cold
// process restart and no longer belong here.
//
// CLAIM_CONTINUATION_SET remains excluded: it mutates
// PlayerRuntimeSummary.claimContinuations, which is rebuilt fresh from
// tiles/players on every boot -- not part of the sqlite snapshot -- so it's
// durable across a mere disconnect/reconnect (the runtime process keeps
// running) but not across a cold process restart. Excluded here rather than
// from DurableCommandTypeSchema itself: it still needs normal gateway
// durable-command handling (persist, ack, replay-on-reconnect) for that
// disconnect/reconnect case, just not restart-parity coverage.
const NOT_RESTART_DURABLE_COMMAND_TYPES = ["CLAIM_CONTINUATION_SET"] as const;

const PHASE4_NON_DURABLE_COMMAND_TYPES = [
  "ATTACK_PREVIEW",
  "SET_TILE_COLOR",
  "SET_PROFILE",
  "ALLIANCE_REQUEST",
  "ALLIANCE_ACCEPT",
  "ALLIANCE_REJECT",
  "ALLIANCE_CANCEL",
  "ALLIANCE_BREAK",
  "TRUCE_REQUEST",
  "TRUCE_ACCEPT",
  "TRUCE_REJECT",
  "TRUCE_CANCEL",
  "TRUCE_BREAK"
] as const;

export const PHASE4_COMMAND_SURFACE_TYPES = [...DURABLE_COMMAND_TYPES, ...PHASE4_NON_DURABLE_COMMAND_TYPES] as const;
export const RESTART_PARITY_COMMAND_TYPES = DURABLE_COMMAND_TYPES.filter(
  (type): type is Exclude<(typeof DURABLE_COMMAND_TYPES)[number], (typeof NOT_RESTART_DURABLE_COMMAND_TYPES)[number]> =>
    !(NOT_RESTART_DURABLE_COMMAND_TYPES as readonly string[]).includes(type)
);
export const ACCEPTANCE_RESOLUTION_COMMAND_TYPES = DURABLE_COMMAND_TYPES;
export const RECONNECT_COMMAND_TYPES = DURABLE_COMMAND_TYPES;
