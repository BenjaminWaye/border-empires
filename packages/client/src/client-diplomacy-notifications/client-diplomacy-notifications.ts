import { applyAfcStateMessage } from "../client-afc-upgrades/client-afc-state.js";
import { describeDiplomacyTermsForRecipient } from "@border-empires/shared";

import { storageGet, storageSet } from "../client-state/client-state.js";
import type { ClientState } from "../client-state/client-state.js";
import type { ActiveAllianceBreakView, ActiveTruceView, AllianceRequest, RecentAllianceBreakView, TruceRequest } from "../client-types.js";

type DiplomacyNotificationState = Pick<ClientState, "me" | "notifiedIncomingDiplomacyRequestIds" | "notifiedDiplomacyIdsLoadedFor">;

// Diplomacy no longer takes over the map with the capture popup: offers wait
// in the offer dock (client-diplomacy-offer-dock) and everything that already
// happened goes to the Activity feed and the Chronicle timeline. The one
// exception is a rival breaking a truce with you: you can be attacked now.
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
  `${senderName(request)} sent an alliance request${termsSuffix(request)}.`;

const truceDetail = (request: TruceRequest): string =>
  request.extendsTruce
    ? `${senderName(request)} offered to extend your truce by ${request.durationHours}h${termsSuffix(request)}.`
    : `${senderName(request)} offered a ${request.durationHours}h truce${termsSuffix(request)}.`;

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
  deps.pushFeed(allianceDetail(request), "alliance", "warn");
};

export const notifyIncomingTruceRequest = (
  state: DiplomacyNotificationState,
  request: TruceRequest | undefined,
  deps: DiplomacyNotificationDeps
): void => {
  if (!request?.id || !markUnseenRequest(state, "truce", request.id)) return;
  deps.pushFeed(truceDetail(request), "alliance", "warn");
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
  const previousTruces = state.activeTruces;
  const previousLatestBreakAt = latestBreakAt(state.truceBreaksThisSeason);
  state.activeTruces = (msg.activeTruces as any[]) ?? state.activeTruces;
  state.truceBreaksThisSeason = (msg.truceBreaksThisSeason as any[]) ?? state.truceBreaksThisSeason;
  state.incomingTruceRequests = (msg.incomingTruceRequests as any[]) ?? state.incomingTruceRequests;
  state.outgoingTruceRequests = (msg.outgoingTruceRequests as any[]) ?? state.outgoingTruceRequests;
  const announcement = msg.announcement as string | undefined;
  if (!announcement) {
    // The gateway's maintenance sweep drops an expired truce without an
    // announcement; a break or a new truce always carries one.
    if (msg.activeTruces) for (const ended of endedTruces(previousTruces, state.activeTruces)) deps.pushFeed(`Your truce with ${ended.otherPlayerName} has ended.`, "alliance", "info");
    return;
  }
  const normalizedAnnouncement = announcement.toLocaleLowerCase();
  const declined = normalizedAnnouncement.includes("declined");
  const broken = normalizedAnnouncement.includes("broke the truce");
  const tone = declined || broken ? "warn" : "success";
  deps.pushFeed(announcement, "alliance", tone);
  // Only the victim's copy interrupts. The breaker's own update adds to their
  // truceBreaksThisSeason; the text alone can't tell them apart, since it
  // carries player-chosen names (an empire called "Locked Out", say).
  // (Compared by the newest break, not the count: the server caps that list.)
  const iBrokeIt = latestBreakAt(state.truceBreaksThisSeason) > previousLatestBreakAt;
  if (broken && !iBrokeIt) deps.showCaptureAlert("Truce broken", announcement, "warn");
};

// Tolerates a state or message without the list (an older gateway, a partial test state).
const latestBreakAt = (breaks: ReadonlyArray<{ brokenAt?: number }> | undefined): number =>
  (breaks ?? []).reduce((latest, record) => Math.max(latest, typeof record.brokenAt === "number" ? record.brokenAt : -Infinity), -Infinity);

/** Truces in `before` that are gone from `after`. */
export const endedTruces = (before: readonly ActiveTruceView[], after: readonly ActiveTruceView[]): ActiveTruceView[] => {
  const remaining = new Set(after.map((truce) => truce.otherPlayerId));
  return before.filter((truce) => !remaining.has(truce.otherPlayerId));
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
  const { tone } = allianceAnnouncementTitle(announcement);
  deps.pushFeed(announcement, "alliance", tone === "success" ? "success" : tone);
};

export const notifyIncomingDiplomacyRequestsOnInit = (
  state: DiplomacyNotificationState,
  allianceRequests: AllianceRequest[],
  truceRequests: TruceRequest[],
  deps: DiplomacyNotificationDeps
): void => {
  const unseenAllianceRequests = allianceRequests.filter((request) => request.id && markUnseenRequest(state, "alliance", request.id));
  const unseenTruceRequests = truceRequests.filter((request) => request.id && markUnseenRequest(state, "truce", request.id));
  for (const request of unseenAllianceRequests) deps.pushFeed(allianceDetail(request), "alliance", "warn");
  for (const request of unseenTruceRequests) deps.pushFeed(truceDetail(request), "alliance", "warn");
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
};
