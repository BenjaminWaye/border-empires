// Hydrates alliance/truce state from an INIT message, extracted out of
// client-network-init-message.ts (already at the repo's 500-line file-size
// gate and may not grow further -- see AGENTS.md's file-and-type-discipline
// rule), following that file's existing apply-init-*.ts split pattern.
import type { ClientState } from "../client-state/client-state.js";

export const applyInitSocialState = (msg: Record<string, unknown>, state: ClientState): void => {
  state.incomingAllianceRequests = (msg.allianceRequests as any[]) ?? [];
  state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as any[] | undefined) ?? [];
  state.activeAllianceBreaks = (msg.activeAllianceBreaks as any[] | undefined) ?? [];
  state.recentAllianceBreaks = (msg.recentAllianceBreaks as any[] | undefined) ?? [];
  state.activeTruces = (msg.activeTruces as any[]) ?? [];
  state.truceBreaksThisSeason = (msg.truceBreaksThisSeason as any[]) ?? [];
  state.incomingTruceRequests = (msg.truceRequests as any[]) ?? [];
  state.outgoingTruceRequests = (msg.outgoingTruceRequests as any[] | undefined) ?? [];
};
