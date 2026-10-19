import type { ActiveAllianceBreakView, ActiveTruceView, AllianceRequest, TruceRequest } from "../client-types.js";
import { allianceNameButtonHtml, allianceRequestsHtml, alliesHtml, socialRemainingLabel, truceRequestsHtml } from "../client-panel-html/client-panel-html.js";

type PlayerNameForOwner = (ownerId?: string | null) => string | undefined;

export type AlliancePanelInput = {
  metPlayerIds: ReadonlySet<string>;
  allies: string[];
  activeAllianceBreaks: ActiveAllianceBreakView[];
  activeTruces: ActiveTruceView[];
  incomingAllianceRequests: AllianceRequest[];
  outgoingAllianceRequests: AllianceRequest[];
  incomingTruceRequests: TruceRequest[];
  outgoingTruceRequests: TruceRequest[];
  playerNameForOwner: PlayerNameForOwner;
  // Map colours by player id, for the dot beside each name.
  playerColors: ReadonlyMap<string, string>;
  nowMs: number;
  // The one met-player row whose action buttons are showing; every other row
  // is a single collapsed line. See client-alliance-row-toggle.ts.
  expandedPlayerId?: string | undefined;
};

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const sectionHtml = (title: string, body: string, stackClass = ""): string =>
  body
    ? `<section class="alliance-section-block">
        <h4 class="alliance-section-title">${title}</h4>
        <div class="alliance-card-stack${stackClass ? ` ${stackClass}` : ""}">${body}</div>
      </section>`
    : "";

export const noPlayersMetHtml = (): string =>
  `<article class="card alliance-empty-card alliance-empty-state">
    <p class="alliance-empty-title">You haven't met any other players yet.</p>
    <p class="alliance-empty-hint">Expand your territory until you spot another empire. Once you have, you can propose an alliance or a truce right here.</p>
  </article>`;

// A met player with nothing in flight: no ally, no pending request either way.
// Truces don't exclude them -- an alliance can still be proposed to a truced
// player, so their truce shows as the row's status instead of its own card.
// Rendered as one compact line; tapping it reveals the action buttons, so a
// long list of met players stays scannable (~60px per player, not ~190px).
const metPlayerRowHtml = (
  playerId: string,
  truce: ActiveTruceView | undefined,
  playerNameForOwner: PlayerNameForOwner,
  playerColors: ReadonlyMap<string, string>,
  nowMs: number,
  expanded: boolean
): string => {
  const name = playerNameForOwner(playerId) ?? truce?.otherPlayerName;
  const safeId = escapeHtml(playerId);
  const status = truce
    ? `<span class="alliance-reference-status alliance-reference-status-truce">Truce</span>
          <span class="alliance-reference-duration-note">· ${socialRemainingLabel(truce.endsAt, nowMs)} left</span>`
    : `<span class="alliance-reference-duration-note">No agreement</span>`;
  const breakTruceButton = truce?.origin === "court" ? `<span class="alliance-reference-duration-note">Court mandate · binding</span>` : truce
    ? `<button class="panel-btn alliance-reference-action alliance-reference-action-break break-truce" type="button" data-break-truce-player-id="${safeId}" title="Breaking a truce locks you out of new truces for 24h">Break Truce</button>`
    : "";
  const buttons = !name
    ? breakTruceButton
    : `<button class="panel-btn alliance-reference-action alliance-reference-action-accept propose-alliance" type="button" data-propose-player-id="${safeId}">Propose Alliance</button>
        ${
          truce
            ? breakTruceButton
            : `<button class="panel-btn alliance-reference-action propose-truce" type="button" data-propose-player-id="${safeId}" data-truce-hours="12">Truce 12h</button>
        <button class="panel-btn alliance-reference-action propose-truce" type="button" data-propose-player-id="${safeId}" data-truce-hours="24">Truce 24h</button>`
        }`;
  const hasActions = buttons !== "";
  const isOpen = hasActions && expanded;
  const toggle = hasActions
    ? `<button class="alliance-player-toggle" type="button" data-toggle-player-id="${safeId}" aria-expanded="${isOpen}" aria-label="Diplomacy options for ${escapeHtml(
        name ?? "this empire"
      )}"><span aria-hidden="true">▾</span></button>`
    : "";
  return `<article class="card alliance-reference-card alliance-player-card${isOpen ? " is-expanded" : ""}" data-player-row-id="${safeId}">
      <div class="alliance-player-row">
        ${allianceNameButtonHtml(playerId, name ?? "Unknown empire", playerColors)}
        <div class="alliance-player-status">${status}</div>
        ${toggle}
      </div>
      ${hasActions ? `<div class="alliance-reference-actions alliance-propose-actions">${buttons}</div>` : ""}
    </article>`;
};

/**
 * Body of the Alliances tab. Driven by the player's situation instead of a
 * fixed stack of sections: nobody met yet -> one message; otherwise only the
 * sections that have content, ordered by urgency (needs your response, allies,
 * waiting on others, players you could still approach). Every player appears
 * in exactly one section.
 */
export const alliancePanelHtml = (input: AlliancePanelInput): string => {
  const { playerNameForOwner, playerColors, nowMs } = input;
  const incoming = `${allianceRequestsHtml(input.incomingAllianceRequests, playerNameForOwner, "incoming", nowMs, playerColors)}${truceRequestsHtml(
    input.incomingTruceRequests,
    playerNameForOwner,
    "incoming",
    nowMs,
    playerColors
  )}`;
  const outgoing = `${allianceRequestsHtml(input.outgoingAllianceRequests, playerNameForOwner, "outgoing", nowMs, playerColors)}${truceRequestsHtml(
    input.outgoingTruceRequests,
    playerNameForOwner,
    "outgoing",
    nowMs,
    playerColors
  )}`;
  const allies = new Set(input.allies);
  const withPendingRequest = new Set<string>([
    ...input.incomingAllianceRequests.map((request) => request.fromPlayerId),
    ...input.incomingTruceRequests.map((request) => request.fromPlayerId),
    ...input.outgoingAllianceRequests.map((request) => request.toPlayerId),
    ...input.outgoingTruceRequests.map((request) => request.toPlayerId)
  ]);
  const trucesByPlayerId = new Map(input.activeTruces.map((truce) => [truce.otherPlayerId, truce]));
  const knownPlayerIds = new Set<string>([...input.metPlayerIds, ...trucesByPlayerId.keys()]);
  const approachable = [...knownPlayerIds]
    .filter((id) => !allies.has(id) && !withPendingRequest.has(id))
    .map((id) => ({ id, name: playerNameForOwner(id) ?? trucesByPlayerId.get(id)?.otherPlayerName ?? id }))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }));

  const hasAnyone = knownPlayerIds.size > 0 || allies.size > 0 || withPendingRequest.size > 0;
  if (!hasAnyone) return noPlayersMetHtml();

  return [
    sectionHtml("Needs your response", incoming),
    sectionHtml("Allies", input.allies.length > 0 ? alliesHtml(input.allies, playerNameForOwner, input.activeAllianceBreaks, nowMs, playerColors) : ""),
    sectionHtml("Waiting on others", outgoing),
    sectionHtml(
      "Players you've met",
      approachable
        .map(({ id }) => metPlayerRowHtml(id, trucesByPlayerId.get(id), playerNameForOwner, playerColors, nowMs, id === input.expandedPlayerId))
        .join(""),
      "alliance-player-stack"
    )
  ].join("");
};
