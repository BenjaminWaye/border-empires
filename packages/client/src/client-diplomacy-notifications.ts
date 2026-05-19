import type { ClientState } from "./client-state.js";
import type { AllianceRequest, TruceRequest } from "./client-types.js";

type DiplomacyNotificationState = Pick<ClientState, "notifiedIncomingDiplomacyRequestIds">;

type DiplomacyNotificationDeps = {
  pushFeed: (message: string, type: "alliance", severity: "info" | "success" | "warn" | "error") => void;
  showCaptureAlert: (title: string, detail: string, tone: "success" | "error" | "warn") => void;
};

const senderName = (request: { fromName?: string; fromPlayerId: string }): string =>
  request.fromName?.trim() || request.fromPlayerId.slice(0, 8);

const allianceDetail = (request: AllianceRequest): string =>
  `${senderName(request)} sent an alliance request. Open Alliances to accept or reject.`;

const truceDetail = (request: TruceRequest): string =>
  `${senderName(request)} offered a ${request.durationHours}h truce. Open Alliances to accept or reject.`;

const markUnseenRequest = (state: DiplomacyNotificationState, kind: "alliance" | "truce", requestId: string): boolean => {
  const key = `${kind}:${requestId}`;
  if (state.notifiedIncomingDiplomacyRequestIds.has(key)) return false;
  state.notifiedIncomingDiplomacyRequestIds.add(key);
  return true;
};

export const notifyIncomingAllianceRequest = (
  state: DiplomacyNotificationState,
  request: AllianceRequest | undefined,
  deps: DiplomacyNotificationDeps
): void => {
  if (!request?.id || !markUnseenRequest(state, "alliance", request.id)) return;
  const detail = allianceDetail(request);
  deps.pushFeed(detail, "alliance", "warn");
  deps.showCaptureAlert("Alliance request received", detail, "warn");
};

export const notifyIncomingTruceRequest = (
  state: DiplomacyNotificationState,
  request: TruceRequest | undefined,
  deps: DiplomacyNotificationDeps
): void => {
  if (!request?.id || !markUnseenRequest(state, "truce", request.id)) return;
  const detail = truceDetail(request);
  deps.pushFeed(detail, "alliance", "warn");
  deps.showCaptureAlert("Truce offer received", detail, "warn");
};

export const notifyIncomingDiplomacyRequestsOnInit = (
  state: DiplomacyNotificationState,
  allianceRequests: AllianceRequest[],
  truceRequests: TruceRequest[],
  deps: DiplomacyNotificationDeps
): void => {
  const unseenAllianceRequests = allianceRequests.filter((request) => request.id && markUnseenRequest(state, "alliance", request.id));
  const unseenTruceRequests = truceRequests.filter((request) => request.id && markUnseenRequest(state, "truce", request.id));
  const total = unseenAllianceRequests.length + unseenTruceRequests.length;
  if (total === 0) return;

  for (const request of unseenAllianceRequests) deps.pushFeed(allianceDetail(request), "alliance", "warn");
  for (const request of unseenTruceRequests) deps.pushFeed(truceDetail(request), "alliance", "warn");

  if (total === 1) {
    const allianceRequest = unseenAllianceRequests[0];
    const truceRequest = unseenTruceRequests[0];
    if (allianceRequest) {
      deps.showCaptureAlert("Alliance request received", allianceDetail(allianceRequest), "warn");
      return;
    }
    if (truceRequest) deps.showCaptureAlert("Truce offer received", truceDetail(truceRequest), "warn");
    return;
  }

  const allianceText =
    unseenAllianceRequests.length === 1 ? "1 alliance request" : `${unseenAllianceRequests.length} alliance requests`;
  const truceText = unseenTruceRequests.length === 1 ? "1 truce offer" : `${unseenTruceRequests.length} truce offers`;
  const detail =
    unseenAllianceRequests.length > 0 && unseenTruceRequests.length > 0
      ? `You have ${allianceText} and ${truceText}. Open Alliances to respond.`
      : `You have ${unseenAllianceRequests.length > 0 ? allianceText : truceText}. Open Alliances to respond.`;
  deps.showCaptureAlert("Diplomacy requests waiting", detail, "warn");
};
