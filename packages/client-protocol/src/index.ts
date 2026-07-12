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
  "ACTIVATE_IMPERIAL_WARD",
  "COLLECT_SHARD",
  "UPGRADE_TOWN_TIER",
  "SET_MUSTER",
  "CLEAR_MUSTER"
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
};
