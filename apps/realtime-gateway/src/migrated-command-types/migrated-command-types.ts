import type { SupportedClientMessageType } from "../supported-client-messages/supported-client-messages.js";

// Client message types that the rewrite gateway turns into a durable/frontier
// command (submitDurableCommand or submitFrontierCommand). This is the single
// source of truth for that set: gateway-app.ts previously kept two
// independently-maintained copies of this list (one to build the "ignored
// legacy message" set, one to gate the final dispatch switch) and they had
// drifted — AEGIS_LOCK and ASTRAL_DOCK_LAUNCH were present in the dispatch
// gate but missing from the legacy-ignore exclusion, so both message types
// were silently swallowed as "ignored legacy" before ever reaching their
// handlers. Keep this list in sync with the dispatch switch in gateway-app.ts.
// Typed against SupportedClientMessageType at authoring time (so a typo'd
// entry fails to compile) but exposed as ReadonlySet<string>: gateway-app.ts
// checks this against the full ClientMessageSchema message.type union, which
// is a superset of supportedClientMessageTypes.
const migratedDurableCommandTypesList: readonly SupportedClientMessageType[] = [
  "ATTACK",
  "EXPAND",
  "SETTLE",
  "BUILD_FORT",
  "BUILD_OBSERVATORY",
  "BUILD_SIEGE_OUTPOST",
  "BUILD_ECONOMIC_STRUCTURE",
  "CANCEL_FORT_BUILD",
  "CANCEL_STRUCTURE_BUILD",
  "REMOVE_STRUCTURE",
  "CANCEL_SIEGE_OUTPOST_BUILD",
  "CANCEL_CAPTURE",
  "UNCAPTURE_TILE",
  "COLLECT_TILE",
  "COLLECT_VISIBLE",
  "CHOOSE_TECH",
  "CHOOSE_DOMAIN",
  "OVERLOAD_SYNTHESIZER",
  "SET_CONVERTER_STRUCTURE_ENABLED",
  "REVEAL_EMPIRE",
  "REVEAL_EMPIRE_STATS",
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
  "AEGIS_LOCK",
  "ASTRAL_DOCK_LAUNCH",
  "ACTIVATE_IMPERIAL_WARD",
  "UPGRADE_TOWN_TIER",
  "COLLECT_SHARD",
  "SET_MUSTER",
  "CLEAR_MUSTER",
  "WATCH_MUSTER",
  "UNWATCH_MUSTER"
];

export const migratedDurableCommandTypes: ReadonlySet<string> = new Set(migratedDurableCommandTypesList);
