import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  activeActionAdmissionsForPlayer,
  createActionAdmissionState,
  recordActionAdmission
} from "./ai-rejection-cooldown.js";

export const createAiActionAdmissionTracker = (aiPlayerIds: ReadonlySet<string>) => {
  const state = createActionAdmissionState();
  const revisions = new Map<string, number>();
  const observe = (event: SimulationEvent): void => {
    if (event.eventType === "COMMAND_REJECTED" || !aiPlayerIds.has(event.playerId)) return;
    if (event.eventType === "COMBAT_RESOLVED" || event.eventType === "TILE_DELTA_BATCH" || event.eventType === "TECH_UPDATE" || event.eventType === "DOMAIN_UPDATE") {
      revisions.set(event.playerId, (revisions.get(event.playerId) ?? 0) + 1);
    }
  };
  const record = (playerId: string, command: Pick<CommandEnvelope, "type" | "payloadJson">, code: string): void =>
    recordActionAdmission(state, playerId, command, revisions.get(playerId) ?? 0, code);
  const blockedFor = (playerId: string): ReadonlyMap<string, string> | undefined => {
    const admissions = activeActionAdmissionsForPlayer(state, playerId, revisions.get(playerId) ?? 0);
    return admissions && new Map([...admissions].map(([key, value]) => [key, value.rejectionCode]));
  };
  return { observe, record, blockedFor };
};
