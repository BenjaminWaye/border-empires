import { z } from "zod";
import { TRICKLE_RESOURCE_KEYS } from "../trickle-resources.js";

const FrontierCommandMetadataSchema = {
  commandId: z.string().min(1).optional(),
  clientSeq: z.number().int().positive().optional()
};

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("AUTH"), token: z.string().min(1), rallyCode: z.string().min(1).optional() }),
  z.object({ type: z.literal("PING"), t: z.number() }),
  z.object({ type: z.literal("SUBSCRIBE_CHUNKS"), cx: z.number(), cy: z.number(), radius: z.number().int().min(0).max(8) }),
  z.object({
    type: z.literal("EXPAND"),
    fromX: z.number().int(),
    fromY: z.number().int(),
    toX: z.number().int(),
    toY: z.number().int(),
    ...FrontierCommandMetadataSchema
  }),
  z.object({
    type: z.literal("ATTACK"),
    fromX: z.number().int(),
    fromY: z.number().int(),
    toX: z.number().int(),
    toY: z.number().int(),
    powerupId: z.string().optional(),
    ...FrontierCommandMetadataSchema
  }),
  z.object({
    type: z.literal("ATTACK_PREVIEW"),
    fromX: z.number().int(),
    fromY: z.number().int(),
    toX: z.number().int(),
    toY: z.number().int(),
    requestId: z.string().min(1).optional()
  }),
  z.object({ type: z.literal("CHOOSE_TECH"), techId: z.string().min(1) }),
  z.object({ type: z.literal("ALLIANCE_REQUEST"), targetPlayerName: z.string().min(1) }),
  z.object({ type: z.literal("ALLIANCE_ACCEPT"), requestId: z.string().min(1) }),
  z.object({ type: z.literal("ALLIANCE_REJECT"), requestId: z.string().min(1) }),
  z.object({ type: z.literal("ALLIANCE_CANCEL"), requestId: z.string().min(1) }),
  z.object({ type: z.literal("ALLIANCE_BREAK"), targetPlayerId: z.string().min(1) }),
  z.object({ type: z.literal("TRUCE_REQUEST"), targetPlayerName: z.string().min(1), durationHours: z.union([z.literal(12), z.literal(24)]) }),
  z.object({ type: z.literal("TRUCE_ACCEPT"), requestId: z.string().min(1) }),
  z.object({ type: z.literal("TRUCE_REJECT"), requestId: z.string().min(1) }),
  z.object({ type: z.literal("TRUCE_CANCEL"), requestId: z.string().min(1) }),
  z.object({ type: z.literal("TRUCE_BREAK"), targetPlayerId: z.string().min(1) }),
  z.object({ type: z.literal("SET_TILE_COLOR"), color: z.string() }),
  z.object({
    type: z.literal("SET_PROFILE"),
    displayName: z.string().trim().min(2).max(24),
    color: z.string()
  }),
  z.object({ type: z.literal("BUILD_FORT"), x: z.number().int(), y: z.number().int() }),
  z.object({ type: z.literal("BUILD_OBSERVATORY"), x: z.number().int(), y: z.number().int() }),
  z.object({
    type: z.literal("BUILD_ECONOMIC_STRUCTURE"),
    x: z.number().int(),
    y: z.number().int(),
    structureType: z.enum([
      "FARMSTEAD",
      "WATERWORKS",
      "CAMP",
      "MINE",
      "MARKET",
      "GRANARY",
      "SEED_GRANARY",
      "CENSUS_HALL",
      "BANK",
      "CLEARING_HOUSE",
      "AIRPORT",
      "AETHER_TOWER",
      "WOODEN_FORT",
      "LIGHT_OUTPOST",
      "FUR_SYNTHESIZER",
      "ADVANCED_FUR_SYNTHESIZER",
      "IRONWORKS",
      "ADVANCED_IRONWORKS",
      "CRYSTAL_SYNTHESIZER",
      "ADVANCED_CRYSTAL_SYNTHESIZER",
      "CARAVANARY",
      "FOUNDRY",
      "EXCHANGE_HOUSE",
      "GARRISON_HALL",
      "CUSTOMS_HOUSE",
      "RAIL_DEPOT",
      "GOVERNORS_OFFICE",
      "RADAR_SYSTEM",
      "IMPERIAL_EXCHANGE_PART",
      "WORLD_ENGINE_PART",
      "AEGIS_DOME_PART",
      "ASTRAL_DOCK_PART",
      "IMPERIAL_EXCHANGE",
      "WORLD_ENGINE",
      "AEGIS_DOME",
      "ASTRAL_DOCK"
    ])
  }),
  z.object({ type: z.literal("CANCEL_FORT_BUILD"), x: z.number().int(), y: z.number().int() }),
  z.object({ type: z.literal("CANCEL_STRUCTURE_BUILD"), x: z.number().int(), y: z.number().int() }),
  z.object({ type: z.literal("REMOVE_STRUCTURE"), x: z.number().int(), y: z.number().int() }),
  z.object({ type: z.literal("OVERLOAD_SYNTHESIZER"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({
    type: z.literal("SET_CONVERTER_STRUCTURE_ENABLED"),
    x: z.number().int(),
    y: z.number().int(),
    enabled: z.boolean(),
    ...FrontierCommandMetadataSchema
  }),
  z.object({
    type: z.literal("SETTLE"),
    x: z.number().int(),
    y: z.number().int(),
    ...FrontierCommandMetadataSchema
  }),
  z.object({ type: z.literal("UPGRADE_TOWN_TIER"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("BUILD_SIEGE_OUTPOST"), x: z.number().int(), y: z.number().int() }),
  z.object({
    type: z.literal("BUILD_STRUCTURE"),
    x: z.number().int(),
    y: z.number().int(),
    structureType: z.string(),
    ...FrontierCommandMetadataSchema
  }),
  z.object({
    type: z.literal("SET_MUSTER"),
    x: z.number().int(),
    y: z.number().int(),
    mode: z.enum(["HOLD", "ADVANCE"]),
    targetX: z.number().int().optional(),
    targetY: z.number().int().optional(),
    ...FrontierCommandMetadataSchema
  }),
  z.object({ type: z.literal("CLEAR_MUSTER"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("REVEAL_EMPIRE"), targetPlayerId: z.string().min(1), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("REVEAL_EMPIRE_STATS"), targetPlayerId: z.string().min(1), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("SURVEY_SWEEP"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("AETHER_LANCE"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("CAST_AETHER_BRIDGE"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({
    type: z.literal("CAST_AETHER_WALL"),
    x: z.number().int(),
    y: z.number().int(),
    direction: z.enum(["N", "E", "S", "W"]),
    length: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    ...FrontierCommandMetadataSchema
  }),
  z.object({ type: z.literal("SIPHON_TILE"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("PURGE_SIPHON"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({
    type: z.literal("RETORT_RECAST"),
    x: z.number().int(),
    y: z.number().int(),
    targetResource: z.enum(["FARM", "WOOD", "IRON", "GEMS"]),
    ...FrontierCommandMetadataSchema
  }),
  z.object({ type: z.literal("CREATE_MOUNTAIN"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("REMOVE_MOUNTAIN"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({
    type: z.literal("AIRPORT_BOMBARD"),
    fromX: z.number().int(),
    fromY: z.number().int(),
    toX: z.number().int(),
    toY: z.number().int(),
    ...FrontierCommandMetadataSchema
  }),
  z.object({ type: z.literal("IMPERIAL_EXCHANGE_LEVY"), fromX: z.number().int(), fromY: z.number().int(), resource: z.enum(["FOOD", "IRON", "CRYSTAL", "SUPPLY"]), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("WORLD_ENGINE_STRIKE"), fromX: z.number().int(), fromY: z.number().int(), toX: z.number().int(), toY: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("AEGIS_LOCK"), fromX: z.number().int(), fromY: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("ASTRAL_DOCK_LAUNCH"), fromX: z.number().int(), fromY: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("AETHER_EMP"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("CITY_OVERCLOCK"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("CANCEL_SIEGE_OUTPOST_BUILD"), x: z.number().int(), y: z.number().int() }),
  z.object({ type: z.literal("CANCEL_CAPTURE" ) }),
  z.object({ type: z.literal("UNCAPTURE_TILE"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("COLLECT_TILE"), x: z.number().int(), y: z.number().int() }),
  z.object({ type: z.literal("COLLECT_SHARD"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
  z.object({ type: z.literal("COLLECT_VISIBLE") }),
  z.object({ type: z.literal("WATCH_MUSTER"), x: z.number().int(), y: z.number().int() }),
  z.object({ type: z.literal("UNWATCH_MUSTER") }),
  z.object({ type: z.literal("REQUEST_TILE_DETAIL"), x: z.number().int(), y: z.number().int() }),
  z.object({ type: z.literal("REQUEST_REVEAL_MAP") }),
  z.object({ type: z.literal("SET_FOG_DISABLED"), disabled: z.boolean() }),
  z.object({
    type: z.literal("CHOOSE_DOMAIN"),
    domainId: z.string().min(1),
    // Without this field on the schema, Zod's default `.object` strip mode
    // silently drops the resource key from the parsed message, so the
    // gateway forwards an empty payload and the sim rejects with
    // `trickle resource choice required` even when the client picked one.
    chosenTrickleResource: z.enum(TRICKLE_RESOURCE_KEYS).optional()
  })
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
