import type { ClientState } from "./client-state.js";
import type { ActiveAllianceBreakView, AllianceRequest, RecentAllianceBreakView, TruceRequest } from "./client-types.js";

type DiplomacyNotificationState = Pick<ClientState, "me" | "notifiedIncomingDiplomacyRequestIds" | "notifiedDiplomacyIdsLoaded">;

type DiplomacyNotificationDeps = {
  pushFeed: (message: string, type: "alliance", severity: "info" | "success" | "warn" | "error") => void;
  showCaptureAlert: (title: string, detail: string, tone: "info" | "success" | "error" | "warn") => void;
};

const senderName = (request: { fromName?: string; fromPlayerId: string }): string =>
  request.fromName?.trim() || request.fromPlayerId.slice(0, 8);

const allianceDetail = (request: AllianceRequest): string =>
  `${senderName(request)} sent an alliance request. Open Alliances to accept or reject.`;

const truceDetail = (request: TruceRequest): string =>
  `${senderName(request)} offered a ${request.durationHours}h truce. Open Alliances to accept or reject.`;

const STORAGE_KEY = (playerId: string): string => `be:diplomacy:notified:${playerId}`;
const MAX_STORED = 500;

const ensureLoaded = (state: DiplomacyNotificationState): void => {
  if (state.notifiedDiplomacyIdsLoaded || !state.me) return;
  state.notifiedDiplomacyIdsLoaded = true;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY(state.me)) : null;
    const stored = JSON.parse(raw ?? "[]") as string[];
    for (const id of stored) state.notifiedIncomingDiplomacyRequestIds.add(id);
  } catch {}
};

const persistIds = (state: DiplomacyNotificationState): void => {
  if (!state.me || typeof localStorage === "undefined") return;
  try {
    const entries = [...state.notifiedIncomingDiplomacyRequestIds];
    localStorage.setItem(STORAGE_KEY(state.me), JSON.stringify(entries.length > MAX_STORED ? entries.slice(-MAX_STORED) : entries));
  } catch {}
};

const markUnseenRequest = (state: DiplomacyNotificationState, kind: "alliance" | "truce" | "alliance-break", requestId: string): boolean => {
  ensureLoaded(state);
  const key = `${kind}:${requestId}`;
  if (state.notifiedIncomingDiplomacyRequestIds.has(key)) return false;
  state.notifiedIncomingDiplomacyRequestIds.add(key);
  persistIds(state);
  return true;
};

const allianceBreakDetail = (state: DiplomacyNotificationState, notice: ActiveAllianceBreakView): string =>
  notice.createdByPlayerId === state.me
    ? `You started a 24h notice to break your alliance with ${notice.otherPlayerName}.`
    : `${notice.otherPlayerName} started a 24h notice to break your alliance.`;

const completedAllianceBreakDetail = (notice: RecentAllianceBreakView): string =>
  `Your alliance with ${notice.otherPlayerName} is now broken.`;

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

export const notifyActiveAllianceBreaksOnInit = (
  state: DiplomacyNotificationState,
  activeAllianceBreaks: ActiveAllianceBreakView[],
  deps: DiplomacyNotificationDeps
): void => {
  const unseenBreaks = activeAllianceBreaks.filter((notice) =>
    markUnseenRequest(state, "alliance-break", `${notice.otherPlayerId}:${notice.startedAt}`)
  );
  if (unseenBreaks.length === 0) return;

  for (const notice of unseenBreaks) deps.pushFeed(allianceBreakDetail(state, notice), "alliance", "info");
  const detail =
    unseenBreaks.length === 1
      ? allianceBreakDetail(state, unseenBreaks[0]!)
      : `${unseenBreaks.length} alliances have active 24h break notices. Open Alliances to review them.`;
  deps.showCaptureAlert(unseenBreaks.length === 1 ? "Alliance break notice" : "Alliance break notices", detail, "info");
};

export const notifyRecentAllianceBreaksOnInit = (
  state: DiplomacyNotificationState,
  recentAllianceBreaks: RecentAllianceBreakView[],
  deps: DiplomacyNotificationDeps
): void => {
  const unseenBreaks = recentAllianceBreaks.filter((notice) =>
    markUnseenRequest(state, "alliance-break", `completed:${notice.otherPlayerId}:${notice.finalizedAt}`)
  );
  if (unseenBreaks.length === 0) return;

  for (const notice of unseenBreaks) deps.pushFeed(completedAllianceBreakDetail(notice), "alliance", "warn");
  const detail =
    unseenBreaks.length === 1
      ? completedAllianceBreakDetail(unseenBreaks[0]!)
      : `${unseenBreaks.length} alliances fully broke while you were away. Open Alliances to review your allies.`;
  deps.showCaptureAlert(unseenBreaks.length === 1 ? "Alliance broken" : "Alliances broken", detail, "warn");
};
