import { createNextFrontierCommandIdentity } from "../client-frontier-command/client-frontier-command.js";
import type { ClientState } from "../client-state/client-state.js";

const rewriteEnvelopeTypes = new Set([
  "ATTACK",
  "EXPAND",
  "SETTLE",
  "CANCEL_CAPTURE",
  "UNCAPTURE_TILE",
  "CHOOSE_TECH",
  "CHOOSE_DOMAIN",
  "SET_CONVERTER_STRUCTURE_ENABLED",
  "SET_CONVERTER_STRUCTURE_MODE",
  "REVEAL_EMPIRE",
  "REVEAL_EMPIRE_STATS",
  "AETHER_LANCE",
  "CAST_AETHER_BRIDGE",
  "CAST_AETHER_WALL",
  "SIPHON_TILE",
  "PURGE_SIPHON", "CANCEL_SIPHON",
  "CREATE_MOUNTAIN",
  "REMOVE_MOUNTAIN",
  "SKY_DOCK_BOMBARD",
  "COLLECT_SHARD",
  "FORCED_ANCILLARIFICATION"
]);

interface ClientCommandEnvelope {
  type?: unknown;
  commandId?: unknown;
  clientSeq?: unknown;
}

/** Preserve an existing identity when a durable action is sent again. */
export function ensureClientCommandEnvelope(
  state: Pick<ClientState, "nextCommandClientSeq">,
  payload: ClientCommandEnvelope | undefined
): void {
  if (!payload || typeof payload.type !== "string" || !rewriteEnvelopeTypes.has(payload.type)) return;
  if (typeof payload.commandId === "string" && payload.commandId && typeof payload.clientSeq === "number") return;
  Object.assign(payload, createNextFrontierCommandIdentity(state));
}
