import type { CommandEnvelope } from "@border-empires/sim-protocol";

import type { AutomationSessionPrefix } from "./automation-command-planner.js";

export const createAutomationCommand = (
  sessionPrefix: AutomationSessionPrefix,
  playerId: string,
  clientSeq: number,
  issuedAt: number,
  type: CommandEnvelope["type"],
  payload: Record<string, number | string>
): CommandEnvelope => ({
  commandId: `${sessionPrefix}-${playerId}-${clientSeq}-${issuedAt}`,
  sessionId: `${sessionPrefix}:${playerId}`,
  playerId,
  clientSeq,
  issuedAt,
  type,
  payloadJson: JSON.stringify(payload)
});
