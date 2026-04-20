import type { ClientState } from "./client-state.js";

const REWRITE_MESSAGE_LABELS: Record<string, string> = {
  ALLIANCE_ACCEPT: "Alliance acceptance",
  ALLIANCE_BREAK: "Alliance changes",
  ALLIANCE_REQUEST: "Alliance requests",
  BUILD_ECONOMIC_STRUCTURE: "Economic structures",
  BUILD_FORT: "Fort building",
  BUILD_OBSERVATORY: "Observatory building",
  BUILD_SIEGE_OUTPOST: "Siege outpost building",
  CANCEL_CAPTURE: "Capture cancellation",
  CANCEL_STRUCTURE_BUILD: "Build cancellation",
  CAST_AETHER_BRIDGE: "Aether Bridge",
  CAST_AETHER_WALL: "Aether Wall",
  CHOOSE_DOMAIN: "Domain choices",
  CHOOSE_TECH: "Technology unlocks",
  COLLECT_SHARD: "Shard collection",
  COLLECT_TILE: "Tile collection",
  COLLECT_VISIBLE: "Visible-yield collection",
  CREATE_MOUNTAIN: "Mountain creation",
  OVERLOAD_SYNTHESIZER: "Synthesizer overloads",
  PURGE_SIPHON: "Siphon purge",
  REMOVE_MOUNTAIN: "Mountain removal",
  REMOVE_STRUCTURE: "Structure removal",
  REVEAL_EMPIRE: "Empire reveal",
  REVEAL_EMPIRE_STATS: "Empire stats reveal",
  SET_CONVERTER_STRUCTURE_ENABLED: "Converter structure toggles",
  SETTLE: "Settlement",
  SIPHON_TILE: "Siphon",
  TRUCE_ACCEPT: "Truce acceptance",
  TRUCE_BREAK: "Truce changes",
  TRUCE_REQUEST: "Truce offers",
  UNCAPTURE_TILE: "Territory abandonment"
};

export const rewriteGatewaySupportsMessageType = (
  state: Pick<ClientState, "serverSupportedMessageTypes">,
  messageType: string
): boolean => state.serverSupportedMessageTypes.size === 0 || state.serverSupportedMessageTypes.has(messageType);

export const unsupportedRewriteMessageDetail = (messageType: string): string => {
  const label = REWRITE_MESSAGE_LABELS[messageType] ?? messageType;
  return `${label} are not yet migrated to the rewrite gateway. Use the legacy server path for that action.`;
};
