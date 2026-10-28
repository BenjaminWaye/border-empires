import { describeDiplomacyTermsForRecipient } from "@border-empires/shared";

import { serverClock } from "../client-server-clock/client-server-clock.js";
import type { ClientState } from "../client-state/client-state.js";
import type { AllianceRequest, TruceRequest } from "../client-types.js";
import "./client-diplomacy-offer-dock.css";

// Incoming truce/alliance offers as a small dock you answer in place, instead
// of a map-wide popup that sent you off to the Alliances tab and vanished
// after 12s while the offer was still open. Offers stay here until accepted,
// declined or expired; outcomes go to the Activity feed and the Chronicle.

type OfferDockState = Pick<ClientState, "me" | "incomingTruceRequests" | "incomingAllianceRequests">;

export const OFFER_DOCK_MAX_ROWS = 3;
const TICK_MS = 500;
// An answer the server refuses without dropping the offer (say, terms you can no longer pay) re-enables the buttons after this.
export const OFFER_DOCK_PENDING_MS = 8_000;
// A first tap on Accept for an offer that costs you coin or Shards only arms it; it disarms after this.
export const OFFER_DOCK_CONFIRM_MS = 4_000;

export type OfferDockEntry = {
  kind: "truce" | "alliance";
  id: string;
  fromName: string;
  headline: string;
  terms: string;
  /** Undefined when the offer has no expiry. */
  remainingMs: number | undefined;
  pending: boolean;
  /** Accepting moves your own coin or Shards, so Accept asks for a second tap. */
  costsYou: boolean;
};

/** Time left on the server's clock, once the client has a server timestamp to align with. */
export type ServerRemaining = (expiresAt: number, nowMs: number) => number | undefined;

const serverClockRemaining: ServerRemaining = (expiresAt, nowMs) => (serverClock.synced() ? serverClock.toLocal(expiresAt) - nowMs : undefined);

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const senderName = (request: { fromName?: string; fromPlayerId: string }): string =>
  request.fromName?.trim() || request.fromPlayerId.slice(0, 8);

/**
 * Remaining lifetime. Comparing expiresAt with the raw Date.now() would be off
 * on a device whose clock is wrong, so it is read on the server's clock when
 * the client has one, and otherwise counted from when this client first saw
 * the offer (client-truce-request-expiry.ts). The smaller wins: an offer first
 * seen after a reload must not show its full lifetime again.
 */
const remainingFor = (
  request: { id: string; createdAt: number; expiresAt?: number },
  firstSeenAtById: Map<string, number>,
  nowMs: number,
  serverRemaining: ServerRemaining
): number | undefined => {
  if (typeof request.expiresAt !== "number") return undefined;
  const lifetimeMs = request.expiresAt - request.createdAt;
  if (!Number.isFinite(lifetimeMs)) return undefined;
  let firstSeenAt = firstSeenAtById.get(request.id);
  if (firstSeenAt === undefined) {
    firstSeenAt = nowMs;
    firstSeenAtById.set(request.id, firstSeenAt);
  }
  const sinceSeen = firstSeenAt + lifetimeMs - nowMs;
  const onServerClock = serverRemaining(request.expiresAt, nowMs);
  return Math.max(0, onServerClock === undefined ? sinceSeen : Math.min(sinceSeen, onServerClock));
};

const costsRecipient = (request: AllianceRequest | TruceRequest): boolean =>
  (request.terms?.ask.gold ?? 0) > 0 || (request.terms?.ask.shard ?? 0) > 0;

export const offerDockEntries = (
  state: OfferDockState,
  firstSeenAtById: Map<string, number>,
  pendingIds: ReadonlySet<string>,
  nowMs: number,
  serverRemaining: ServerRemaining = serverClockRemaining
): OfferDockEntry[] => {
  const truces = state.incomingTruceRequests.map((request: TruceRequest): OfferDockEntry => ({
    kind: "truce",
    id: request.id,
    fromName: senderName(request),
    headline: `offers a ${request.durationHours}h truce`,
    terms: describeDiplomacyTermsForRecipient(request.terms, senderName(request)),
    remainingMs: remainingFor(request, firstSeenAtById, nowMs, serverRemaining),
    pending: pendingIds.has(request.id),
    costsYou: costsRecipient(request)
  }));
  const alliances = state.incomingAllianceRequests.map((request: AllianceRequest): OfferDockEntry => ({
    kind: "alliance",
    id: request.id,
    fromName: senderName(request),
    headline: "proposes an alliance",
    terms: describeDiplomacyTermsForRecipient(request.terms, senderName(request)),
    remainingMs: remainingFor(request, firstSeenAtById, nowMs, serverRemaining),
    pending: pendingIds.has(request.id),
    costsYou: costsRecipient(request)
  }));
  const liveIds = new Set([...truces, ...alliances].map((entry) => entry.id));
  for (const id of firstSeenAtById.keys()) if (!liveIds.has(id)) firstSeenAtById.delete(id);
  // An offer about to run out comes first; offers without an expiry keep their order after them.
  return [...truces, ...alliances]
    .filter((entry) => entry.remainingMs === undefined || entry.remainingMs > 0)
    .sort((left, right) => (left.remainingMs ?? Infinity) - (right.remainingMs ?? Infinity));
};

export const formatOfferCountdown = (remainingMs: number): string => {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
};

const ICON = { truce: "🕊", alliance: "🤝" } as const;

const rowHtml = (entry: OfferDockEntry, confirmingId: string | undefined): string => {
  const disabled = entry.pending ? " disabled" : "";
  const confirming = entry.id === confirmingId;
  const countdown = entry.remainingMs === undefined
    ? ""
    : `<span class="offer-dock-timer" data-offer-timer="${esc(entry.id)}" title="Time left to answer">${formatOfferCountdown(entry.remainingMs)}</span>`;
  return `<div class="offer-dock-row" data-offer-kind="${entry.kind}">
    <span class="offer-dock-icon" aria-hidden="true">${ICON[entry.kind]}</span>
    <div class="offer-dock-text">
      <div class="offer-dock-headline"><strong>${esc(entry.fromName)}</strong> ${esc(entry.headline)}${countdown}</div>
      ${entry.terms ? `<div class="offer-dock-terms">${esc(entry.terms)}</div>` : ""}
    </div>
    <div class="offer-dock-actions">
      <button type="button" class="offer-dock-btn offer-dock-accept${confirming ? " offer-dock-confirming" : ""}" data-offer-action="accept" data-offer-kind="${entry.kind}" data-offer-id="${esc(entry.id)}"${disabled}>${confirming ? `Confirm · ${esc(entry.terms)}` : "Accept"}</button>
      <button type="button" class="offer-dock-btn offer-dock-decline" data-offer-action="decline" data-offer-kind="${entry.kind}" data-offer-id="${esc(entry.id)}"${disabled}>Decline</button>
    </div>
    <button type="button" class="offer-dock-hide" data-offer-action="hide" data-offer-id="${esc(entry.id)}" title="Hide · answer later in Alliances" aria-label="Hide this offer; answer it later in Alliances">✕</button>
  </div>`;
};

export const offerDockHtml = (entries: readonly OfferDockEntry[], confirmingId?: string): string => {
  const shown = entries.slice(0, OFFER_DOCK_MAX_ROWS);
  const hidden = entries.length - shown.length;
  const more = hidden > 0 ? `<div class="offer-dock-more">+${hidden} more offer${hidden === 1 ? "" : "s"} in Alliances</div>` : "";
  return `${shown.map((entry) => rowHtml(entry, confirmingId)).join("")}${more}`;
};

/** The game message for a dock button, or undefined for an unknown button. */
export const offerDockMessage = (action: string | undefined, kind: string | undefined, id: string | undefined): { type: string; requestId: string } | undefined => {
  if (!id || (action !== "accept" && action !== "decline")) return undefined;
  if (kind === "truce") return { type: action === "accept" ? "TRUCE_ACCEPT" : "TRUCE_REJECT", requestId: id };
  if (kind === "alliance") return { type: action === "accept" ? "ALLIANCE_ACCEPT" : "ALLIANCE_REJECT", requestId: id };
  return undefined;
};

/**
 * Mounts the dock and keeps it in sync with state on a short ticker. The rows
 * are only rebuilt when the set of offers changes; in between just the
 * countdowns update, so a hovered or focused button is never replaced.
 */
export const installDiplomacyOfferDock = (deps: {
  state: OfferDockState;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
}): void => {
  if (typeof document === "undefined") return;
  const dockEl = document.createElement("div");
  dockEl.id = "diplomacy-offer-dock";
  dockEl.setAttribute("role", "region");
  dockEl.setAttribute("aria-label", "Diplomacy offers");
  dockEl.style.display = "none";
  document.body.appendChild(dockEl);

  const firstSeenAtById = new Map<string, number>();
  // Offers answered from the dock -> when, until the server's update removes them.
  const pendingSince = new Map<string, number>();
  // Offers the player hid to answer later in Alliances. Both are pruned to live offers every tick.
  const hiddenIds = new Set<string>();
  let confirming: { id: string; until: number } | undefined;
  let renderedKey = "";

  const render = (): void => {
    const nowMs = Date.now();
    const liveIds = new Set([...deps.state.incomingTruceRequests, ...deps.state.incomingAllianceRequests].map((request) => request.id));
    for (const [id, at] of pendingSince) if (!liveIds.has(id) || nowMs - at > OFFER_DOCK_PENDING_MS) pendingSince.delete(id);
    for (const id of hiddenIds) if (!liveIds.has(id)) hiddenIds.delete(id);
    if (confirming && (!liveIds.has(confirming.id) || nowMs > confirming.until)) confirming = undefined;
    const entries = offerDockEntries(deps.state, firstSeenAtById, new Set(pendingSince.keys()), nowMs).filter((entry) => !hiddenIds.has(entry.id));
    const key = deps.state.me ? `${confirming?.id ?? ""}#${entries.map((entry) => `${entry.id}:${entry.pending ? 1 : 0}`).join("|")}` : "";
    if (key !== renderedKey) {
      renderedKey = key;
      dockEl.innerHTML = entries.length > 0 && key ? offerDockHtml(entries, confirming?.id) : "";
      dockEl.style.display = entries.length > 0 && key ? "grid" : "none";
      return;
    }
    for (const entry of entries) {
      if (entry.remainingMs === undefined) continue;
      const timerEl = dockEl.querySelector<HTMLElement>(`[data-offer-timer="${CSS.escape(entry.id)}"]`);
      if (timerEl) timerEl.textContent = formatOfferCountdown(entry.remainingMs);
    }
  };

  dockEl.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-offer-action]");
    if (!button || button.disabled) return;
    const id = button.dataset.offerId;
    if (button.dataset.offerAction === "hide" && id) {
      hiddenIds.add(id);
      render();
      return;
    }
    const message = offerDockMessage(button.dataset.offerAction, button.dataset.offerKind, id);
    if (!message) return;
    // The dock sits over the map, so a stray tap must not spend your coin or Shards.
    const entry = button.dataset.offerAction === "accept" ? offerDockEntries(deps.state, firstSeenAtById, new Set(), Date.now()).find((candidate) => candidate.id === id) : undefined;
    if (entry?.costsYou && confirming?.id !== entry.id) {
      confirming = { id: entry.id, until: Date.now() + OFFER_DOCK_CONFIRM_MS };
      render();
      return;
    }
    confirming = undefined;
    const failure = message.type.startsWith("TRUCE") ? "Finish sign-in before responding to truces." : "Finish sign-in before responding to alliance requests.";
    if (deps.sendGameMessage(message, failure)) pendingSince.set(message.requestId, Date.now());
    render();
  });

  render();
  setInterval(render, TICK_MS);
};
