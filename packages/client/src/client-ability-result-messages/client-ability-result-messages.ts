import type { ClientState } from "../client-state/client-state.js";
import { applyImperialWardActivatedMessage } from "../client-imperial-ward/client-imperial-ward.js";
import { applyShardMobilizedMessage } from "../client-shard-mobilize/client-shard-mobilize.js";

// One-off player messages that confirm a per-player ability (no anchor tile),
// routed from client-network.ts through one entry point.
export const ABILITY_RESULT_MESSAGE_TYPES: ReadonlySet<string> = new Set(["IMPERIAL_WARD_ACTIVATED", "SHARD_MOBILIZED"]);

export const applyAbilityResultMessage = (state: ClientState, msg: Record<string, unknown>): void => {
  if (msg.type === "IMPERIAL_WARD_ACTIVATED") applyImperialWardActivatedMessage(state, msg);
  else if (msg.type === "SHARD_MOBILIZED") applyShardMobilizedMessage(state, msg);
};
