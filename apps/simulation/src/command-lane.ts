import type { CommandEnvelope } from "@border-empires/sim-protocol";

export type QueueLane = "human_interactive" | "human_noninteractive" | "system" | "ai";

export const laneForCommand = (command: Pick<CommandEnvelope, "type" | "sessionId">): QueueLane => {
  if (command.sessionId.startsWith("ai-runtime:")) return "ai";
  if (command.sessionId.startsWith("system-runtime:")) return "system";

  switch (command.type) {
    case "ATTACK":
    case "EXPAND":
    case "BREAKTHROUGH_ATTACK":
    case "SETTLE":
    case "BUILD_FORT":
    case "BUILD_OBSERVATORY":
    case "BUILD_SIEGE_OUTPOST":
    case "BUILD_ECONOMIC_STRUCTURE":
    case "CANCEL_FORT_BUILD":
    case "CANCEL_STRUCTURE_BUILD":
    case "REMOVE_STRUCTURE":
    case "CANCEL_SIEGE_OUTPOST_BUILD":
    case "CANCEL_CAPTURE":
    case "UNCAPTURE_TILE":
    case "OVERLOAD_SYNTHESIZER":
    case "SET_CONVERTER_STRUCTURE_ENABLED":
    case "REVEAL_EMPIRE":
    case "REVEAL_EMPIRE_STATS":
    case "CAST_AETHER_BRIDGE":
    case "CAST_AETHER_WALL":
    case "SIPHON_TILE":
    case "PURGE_SIPHON":
    case "CREATE_MOUNTAIN":
    case "REMOVE_MOUNTAIN":
    case "AIRPORT_BOMBARD":
      return "human_interactive";
    case "COLLECT_TILE":
    case "COLLECT_VISIBLE":
    case "COLLECT_SHARD":
    case "CHOOSE_TECH":
    case "CHOOSE_DOMAIN":
      return "human_noninteractive";
    default:
      return "system";
  }
};
