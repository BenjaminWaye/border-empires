// The ALLIANCE_* / TRUCE_* / DIPLOMACY_STANCE socket messages, extracted out
// of client-network.ts (well over the repo's 500-line file-size gate and may
// not grow further -- see AGENTS.md's file-and-type-discipline rule).
import type { ClientState } from "../client-state/client-state.js";
import type { AllianceRequest, TruceRequest } from "../client-types.js";
import { receiveDiplomacyStance, refreshDiplomacyTradeScreen, setDiplomacyOfferCooldowns } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import type { DiplomacyStanceReply } from "../client-diplomacy-trade/client-diplomacy-trade-view.js";
import {
  applyAllianceUpdateMessage,
  applyTruceUpdateMessage,
  notifyIncomingAllianceRequest,
  notifyIncomingTruceRequest
} from "./client-diplomacy-notifications.js";

type DiplomacyMessageState = Pick<
  ClientState,
  | "me"
  | "notifiedIncomingDiplomacyRequestIds"
  | "notifiedDiplomacyIdsLoadedFor"
  | "allies"
  | "activeAllianceBreaks"
  | "recentAllianceBreaks"
  | "incomingAllianceRequests"
  | "outgoingAllianceRequests"
  | "activeTruces"
  | "truceBreaksThisSeason"
  | "incomingTruceRequests"
  | "outgoingTruceRequests"
>;

export type DiplomacyMessageDeps = {
  pushFeed: (message: string, type: "alliance", severity: "info" | "success" | "warn" | "error") => void;
  showCaptureAlert: (title: string, detail: string, tone: "info" | "success" | "error" | "warn") => void;
  playerNameForOwner: (ownerId: string) => string | undefined;
};

/** Returns true when the message was a diplomacy message (the caller re-renders the HUD). */
export const handleDiplomacySocketMessage = (state: DiplomacyMessageState, msg: Record<string, unknown>, deps: DiplomacyMessageDeps): boolean => {
  const notifyDeps = { pushFeed: deps.pushFeed, showCaptureAlert: deps.showCaptureAlert };
  if (msg.type === "ALLIANCE_REQUEST_INCOMING") {
    const request = (msg.request as AllianceRequest | undefined) ?? undefined;
    if (request && !state.incomingAllianceRequests.some((existing) => existing.id === request.id)) {
      const fromName = msg.fromName as string | undefined;
      if (fromName) request.fromName = fromName;
      state.incomingAllianceRequests.push(request);
    }
    notifyIncomingAllianceRequest(state, request, notifyDeps);
    return true;
  }
  if (msg.type === "ALLIANCE_REQUESTED") {
    const request = msg.request as AllianceRequest | undefined;
    if (request && !state.outgoingAllianceRequests.some((existing) => existing.id === request.id)) {
      state.outgoingAllianceRequests.push(request);
    }
    return true;
  }
  if (msg.type === "ALLIANCE_UPDATE") {
    applyAllianceUpdateMessage(state, msg, notifyDeps);
    return true;
  }
  if (msg.type === "TRUCE_REQUEST_INCOMING") {
    const request = (msg.request as TruceRequest | undefined) ?? undefined;
    if (request) {
      const fromName = msg.fromName as string | undefined;
      if (fromName) request.fromName = fromName;
      state.incomingTruceRequests = [...state.incomingTruceRequests.filter((entry) => entry.id !== request.id), request];
    }
    notifyIncomingTruceRequest(state, request, notifyDeps);
    return true;
  }
  if (msg.type === "TRUCE_REQUESTED") {
    const request = msg.request as TruceRequest | undefined;
    const targetName = (msg.targetName as string | undefined) ?? request?.toName ?? (request ? deps.playerNameForOwner(request.toPlayerId) : undefined);
    deps.pushFeed(`Truce offered${targetName ? ` to ${targetName}` : ""}.`, "alliance", "success");
    return true;
  }
  if (msg.type === "TRUCE_UPDATE") {
    applyTruceUpdateMessage(state, msg, notifyDeps);
    setDiplomacyOfferCooldowns(msg.offerCooldowns);
    refreshDiplomacyTradeScreen();
    return true;
  }
  if (msg.type === "DIPLOMACY_STANCE") {
    receiveDiplomacyStance(msg as unknown as DiplomacyStanceReply);
    return true;
  }
  return false;
};
