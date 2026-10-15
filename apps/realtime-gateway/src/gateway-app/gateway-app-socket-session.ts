// Per-socket session state gateway-app.ts keeps for each websocket,
// extracted out of gateway-app.ts (well over the repo's 500-line file-size
// gate and may not grow further -- see AGENTS.md's file-and-type-discipline rule).
import type { GatewaySocketSession } from "../frontier-submit/frontier-submit.js";

export type SocketSession = Omit<GatewaySocketSession, "playerId"> & {
  playerId?: string;
  initSent: boolean;
  pendingPayloads: unknown[];
  channel: "control" | "bulk";
  canToggleFog: boolean;
  fogDisabled: boolean; authInProgress: boolean;
  rallyAnchor?: { x: number; y: number; island?: string } | undefined;
  isGuest?: boolean;
};
