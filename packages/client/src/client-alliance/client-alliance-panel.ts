import type { ActiveAllianceBreakView, ActiveTruceView, AllianceRequest, TruceRequest } from "../client-types.js";
import { allianceRequestsHtml, alliesHtml, socialRemainingLabel, truceRequestsHtml } from "../client-panel-html/client-panel-html.js";

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
  nowMs: number;
};

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const sectionHtml = (title: string, body: string): string =>
  body
    ? `<section class="alliance-section-block">
        <h4 class="alliance-section-title">${title}</h4>
        <div class="alliance-card-stack">${body}</div>
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
const metPlayerRowHtml = (
  playerId: string,
  truce: ActiveTruceView | undefined,
  playerNameForOwner: PlayerNameForOwner,
  nowMs: number
): string => {
  const name = playerNameForOwner(playerId) ?? truce?.otherPlayerName;
  const status = truce
    ? `<div class="alliance-reference-status alliance-reference-status-truce"><span>Truce</span></div>
          <div class="alliance-reference-duration-note">${socialRemainingLabel(truce.endsAt, nowMs)} left</div>`
    : `<div class="alliance-reference-duration-note">No agreement</div>`;
  const actions = !name
    ? ""
    : `<div class="alliance-reference-actions alliance-propose-actions">
        <button class="panel-btn alliance-reference-action alliance-reference-action-accept propose-alliance" type="button" data-propose-player-id="${escapeHtml(playerId)}">Propose Alliance</button>
        ${
          truce
            ? ""
            : `<button class="panel-btn alliance-reference-action propose-truce" type="button" data-propose-player-id="${escapeHtml(playerId)}" data-truce-hours="12">Truce 12h</button>
        <button class="panel-btn alliance-reference-action propose-truce" type="button" data-propose-player-id="${escapeHtml(playerId)}" data-truce-hours="24">Truce 24h</button>`
        }
      </div>`;
  return `<article class="card alliance-reference-card alliance-player-card">
      <div class="alliance-reference-top">
        <div class="alliance-reference-copy">
          <button class="player-link alliance-reference-name" type="button" data-inspect-player="${escapeHtml(playerId)}">${escapeHtml(name ?? "Unknown empire")}</button>
        </div>
        <div class="alliance-reference-right">${status}</div>
      </div>
      ${actions}
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
  const { playerNameForOwner, nowMs } = input;
  const incoming = `${allianceRequestsHtml(input.incomingAllianceRequests, playerNameForOwner, "incoming", nowMs)}${truceRequestsHtml(
    input.incomingTruceRequests,
    playerNameForOwner,
    "incoming",
    nowMs
  )}`;
  const outgoing = `${allianceRequestsHtml(input.outgoingAllianceRequests, playerNameForOwner, "outgoing", nowMs)}${truceRequestsHtml(
    input.outgoingTruceRequests,
    playerNameForOwner,
    "outgoing",
    nowMs
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
    .sort((left, right) => left.name.localeCompare(right.name));

  const hasAnyone = knownPlayerIds.size > 0 || allies.size > 0 || withPendingRequest.size > 0;
  if (!hasAnyone) return noPlayersMetHtml();

  return [
    sectionHtml("Needs your response", incoming),
    sectionHtml("Allies", input.allies.length > 0 ? alliesHtml(input.allies, playerNameForOwner, input.activeAllianceBreaks, nowMs) : ""),
    sectionHtml("Waiting on others", outgoing),
    sectionHtml(
      "Players you've met",
      approachable.map(({ id }) => metPlayerRowHtml(id, trucesByPlayerId.get(id), playerNameForOwner, nowMs)).join("")
    )
  ].join("");
};
