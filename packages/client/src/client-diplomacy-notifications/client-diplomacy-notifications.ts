import { applyAfcStateMessage } from "../client-afc-upgrades/client-afc-state.js";
import { describeDiplomacyTermsForRecipient } from "@border-empires/shared";

import { storageGet, storageSet } from "../client-state/client-state.js";
import type { ClientState } from "../client-state/client-state.js";
import type { ActiveAllianceBreakView, AllianceRequest, RecentAllianceBreakView, TruceRequest } from "../client-types.js";

type DiplomacyNotificationState = Pick<ClientState, "me" | "notifiedIncomingDiplomacyRequestIds" | "notifiedDiplomacyIdsLoadedFor">;

type DiplomacyNotificationDeps = {
  pushFeed: (message: string, type: "alliance", severity: "info" | "success" | "warn" | "error") => void;
  showCaptureAlert: (title: string, detail: string, tone: "info" | "success" | "error" | "warn") => void;
};

const senderName = (request: { fromName?: string; fromPlayerId: string }): string =>
  request.fromName?.trim() || request.fromPlayerId.slice(0, 8);

// " (Milo pays 50 coin; you pay 2 Shards)" when the offer carries terms.
const termsSuffix = (request: AllianceRequest | TruceRequest): string => {
  const terms = describeDiplomacyTermsForRecipient(request.terms, senderName(request));
  return terms ? ` (${terms})` : "";
};

const allianceDetail = (request: AllianceRequest): string =>
  `${senderName(request)} sent an alliance request${termsSuffix(request)}. Open Alliances to accept or reject.`;

const truceDetail = (request: TruceRequest): string =>
  `${senderName(request)} offered a ${request.durationHours}h truce${termsSuffix(request)}. Open Alliances to accept or reject.`;

const STORAGE_KEY = (playerId: string): string => `be:diplomacy:notified:${playerId}`;
const MAX_STORED = 500;

const ensureLoaded = (state: DiplomacyNotificationState): void => {
  if (state.notifiedDiplomacyIdsLoadedFor === state.me || !state.me) return;
  state.notifiedDiplomacyIdsLoadedFor = state.me;
  state.notifiedIncomingDiplomacyRequestIds.clear();
  try {
    const raw = storageGet(STORAGE_KEY(state.me));
    const parsed: unknown = JSON.parse(raw ?? "[]");
    const stored = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    for (const id of stored) state.notifiedIncomingDiplomacyRequestIds.add(id);
  } catch {
    storageSet(STORAGE_KEY(state.me), "[]");
  }
};

const persistIds = (state: DiplomacyNotificationState): void => {
  if (!state.me) return;
  const entries = [...state.notifiedIncomingDiplomacyRequestIds];
  storageSet(STORAGE_KEY(state.me), JSON.stringify(entries.length > MAX_STORED ? entries.slice(-MAX_STORED) : entries));
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

type TruceUpdateNotificationState = Pick<
  ClientState,
  "activeTruces" | "truceBreaksThisSeason" | "incomingTruceRequests" | "outgoingTruceRequests"
>;

// Applies a TRUCE_UPDATE socket message's fields and surfaces its announcement,
// extracted out of client-network.ts (already over the repo's 500-line
// file-size gate and may not grow further).
export const applyTruceUpdateMessage = (
  state: TruceUpdateNotificationState & Partial<Pick<ClientState, "forcedTruceCooldownUntil">>,
  msg: Record<string, unknown>,
  deps: DiplomacyNotificationDeps
): void => {
  applyAfcStateMessage(state, msg);
  state.activeTruces = (msg.activeTruces as any[]) ?? state.activeTruces;
  state.truceBreaksThisSeason = (msg.truceBreaksThisSeason as any[]) ?? state.truceBreaksThisSeason;
  state.incomingTruceRequests = (msg.incomingTruceRequests as any[]) ?? state.incomingTruceRequests;
  state.outgoingTruceRequests = (msg.outgoingTruceRequests as any[]) ?? state.outgoingTruceRequests;
  const announcement = msg.announcement as string | undefined;
  if (!announcement) return;
  const normalizedAnnouncement = announcement.toLocaleLowerCase();
  const declined = normalizedAnnouncement.includes("declined");
  const broken = normalizedAnnouncement.includes("broke the truce");
  const tone = declined || broken ? "warn" : "success";
  deps.pushFeed(announcement, "alliance", tone);
  deps.showCaptureAlert(declined ? "Truce declined" : broken ? "Truce broken" : "Truce accepted", announcement, tone);
};

type AllianceUpdateNotificationState = Pick<
  ClientState,
  "allies" | "activeAllianceBreaks" | "recentAllianceBreaks" | "incomingAllianceRequests" | "outgoingAllianceRequests"
>;

// Popup title for an ALLIANCE_UPDATE announcement. Besides break notices,
// announcements now also carry an (AI) answer to an alliance offer, e.g.
// "Milo declined your alliance offer. Milo is wary of you ...".
export const allianceAnnouncementTitle = (announcement: string): { title: string; tone: "info" | "success" | "warn" } => {
  const normalized = announcement.toLocaleLowerCase();
  if (normalized.includes("now broken")) return { title: "Alliance broken", tone: "warn" };
  if (normalized.includes("declined")) return { title: "Alliance declined", tone: "warn" };
  if (normalized.includes("accepted")) return { title: "Alliance formed", tone: "success" };
  return { title: "Alliance break notice", tone: "info" };
};

// Applies an ALLIANCE_UPDATE socket message's fields and surfaces its
// announcement, extracted out of client-network.ts (already over the repo's
// 500-line file-size gate and may not grow further).
export const applyAllianceUpdateMessage = (
  state: AllianceUpdateNotificationState,
  msg: Record<string, unknown>,
  deps: DiplomacyNotificationDeps
): void => {
  state.allies = (msg.allies as string[]) ?? [];
  state.activeAllianceBreaks = (msg.activeAllianceBreaks as any[] | undefined) ?? state.activeAllianceBreaks;
  state.recentAllianceBreaks = (msg.recentAllianceBreaks as any[] | undefined) ?? state.recentAllianceBreaks;
  state.incomingAllianceRequests = (msg.incomingAllianceRequests as any[] | undefined) ?? state.incomingAllianceRequests;
  state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as any[] | undefined) ?? state.outgoingAllianceRequests;
  const announcement = msg.announcement as string | undefined;
  if (!announcement) return;
  const { title, tone } = allianceAnnouncementTitle(announcement);
  deps.pushFeed(announcement, "alliance", tone === "success" ? "success" : tone);
  deps.showCaptureAlert(title, announcement, tone);
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
