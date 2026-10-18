import type { ClientState } from "../client-state/client-state.js";
import type { AlliancePanelInput } from "./client-alliance-panel.js";
import { refreshMetPlayerIds, type MetPlayersState } from "./client-met-players.js";

export type AlliancePanelState = MetPlayersState &
  Pick<
    ClientState,
    | "allies"
    | "activeAllianceBreaks"
    | "activeTruces"
    | "incomingAllianceRequests"
    | "outgoingAllianceRequests"
    | "incomingTruceRequests"
    | "outgoingTruceRequests"
    | "expandedSocialPlayerId"
    | "playerColors"
  >;

/** Gathers the Alliances tab's render input from client state (used by client-hud.ts). */
export const alliancePanelInputFromState = (
  state: AlliancePanelState,
  playerNameForOwner: AlliancePanelInput["playerNameForOwner"],
  nowMs: number
): AlliancePanelInput => ({
  metPlayerIds: refreshMetPlayerIds(state),
  allies: state.allies,
  activeAllianceBreaks: state.activeAllianceBreaks,
  activeTruces: state.activeTruces,
  incomingAllianceRequests: state.incomingAllianceRequests,
  outgoingAllianceRequests: state.outgoingAllianceRequests,
  incomingTruceRequests: state.incomingTruceRequests,
  outgoingTruceRequests: state.outgoingTruceRequests,
  playerNameForOwner,
  playerColors: state.playerColors,
  nowMs,
  expandedPlayerId: state.expandedSocialPlayerId
});
