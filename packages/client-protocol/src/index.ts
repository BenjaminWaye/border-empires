import { z } from "zod";

export const DurableCommandTypeSchema = z.enum([
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
  "AEGIS_LOCK",
  "ASTRAL_DOCK_LAUNCH",
  "TITANIUM_LEVY_MUSTER",
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
]);

export type DurableCommandType = z.infer<typeof DurableCommandTypeSchema>;

export const ClientCommandEnvelopeSchema = z.object({
  commandId: z.string().min(1),
  clientSeq: z.number().int().nonnegative(),
  issuedAt: z.number().int().nonnegative(),
  type: DurableCommandTypeSchema,
  payload: z.record(z.string(), z.unknown())
});

export type ClientCommandEnvelope = z.infer<typeof ClientCommandEnvelopeSchema>;

export type CommandQueuedMessage = {
  type: "COMMAND_QUEUED";
  commandId: string;
  clientSeq: number;
};

export type ActionAcceptedMessage = {
  type: "ACTION_ACCEPTED";
  commandId: string;
  actionType: Extract<DurableCommandType, "ATTACK" | "EXPAND">;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  resolvesAt: number;
};

export type CommandRejectedMessage = {
  type: "ERROR";
  commandId?: string;
  code: string;
  message: string;
  // Present when code === "SEASON_PENDING": the season's scheduled start
  // time (epoch ms). See handle-join-season-message.ts / SEASON_PENDING.
  scheduledStartAt?: number;
};
