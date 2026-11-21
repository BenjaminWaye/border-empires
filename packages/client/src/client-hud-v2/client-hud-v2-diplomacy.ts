import { describeDiplomacyTermsForProposer, describeDiplomacyTermsForRecipient } from "@border-empires/shared";
// Diplomacy for the new HUD. Step 1 lists every empire you've met as crests,
// with requests waiting on you pinned at the top and the offers you sent
// (withdrawable) under them, then ranked empires you haven't met: deals need
// no contact. Step 2 is the deal: the trade view re-hosted full width (your
// goods and treaties on the left, the deal in the middle, theirs on the
// right). Picking an empire hides the list.

import type { ActiveTruceView, AllianceRequest, LeaderboardOverallEntry, TruceRequest } from "../client-types.js";
import { socialRemainingLabel } from "../client-panel-html/client-panel-html.js";
import { isTruceEndingSoon, truceCanExtend, truceTimeLeftLabel, trucesEndingSoon } from "../client-truce-ending/client-truce-ending.js";

export type DiplomacyListInput = {
  resourceOffers?: readonly import("@border-empires/shared").ResourceTradeOffer[];
  resourceAgreements?: readonly import("@border-empires/shared").ResourceSupplyAgreementStatus[];
  me: string;
  metPlayerIds: ReadonlySet<string>;
  allies: readonly string[];
  activeTruces: readonly ActiveTruceView[];
  incomingAlliance: readonly AllianceRequest[];
  incomingTruce: readonly TruceRequest[];
  outgoingAlliance?: readonly AllianceRequest[];
  outgoingTruce?: readonly TruceRequest[];
  leaderboard: readonly LeaderboardOverallEntry[];
  /** Who is at war with you now (warOpponentIds, the same signal as the Alliances tab's "War" label). */
  warPlayerIds?: ReadonlySet<string>;
  nameOf: (playerId: string) => string;
  colorOf: (playerId: string) => string | undefined;
  nowMs: number;
};

/** `ending`: a truce in its last two hours (client-truce-ending.ts). */
export type EmpireStance = { kind: "ally" | "truce" | "war" | "met"; label: string; ending?: boolean };

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A rival you are fighting reads "War", not "Met" (playtest: an enemy's card still said MET once the war began).
export const empireStance = (id: string, input: Pick<DiplomacyListInput, "allies" | "activeTruces" | "nowMs" | "warPlayerIds">): EmpireStance => {
  if (input.allies.includes(id)) return { kind: "ally", label: "Ally" };
  const truce = input.activeTruces.find((t) => t.otherPlayerId === id);
  if (truce && isTruceEndingSoon(truce, input.nowMs)) return { kind: "truce", label: `Truce ends ${truceTimeLeftLabel(truce.endsAt, input.nowMs)}`, ending: true };
  if (truce) return { kind: "truce", label: `Truce ${socialRemainingLabel(truce.endsAt, input.nowMs)}` };
  if (input.warPlayerIds?.has(id)) return { kind: "war", label: "War" };
  return { kind: "met", label: "Met" };
};

/**
 * "1,204 garrisoned tiles": the leaderboard's tile count is garrisoned (settled) tiles only, refreshed with
 * each GLOBAL_STATUS_UPDATE. Frontier land changing hands in a war doesn't move it, so a bare "tiles"
 * read as a stale count (playtest).
 */
export const garrisonedTilesLabel = (tiles: number): string => `${tiles.toLocaleString("en-US")} garrisoned tile${tiles === 1 ? "" : "s"}`;

const STANCE_ORDER: Record<EmpireStance["kind"], number> = { war: 0, truce: 1, ally: 2, met: 3 };

/** Every met empire, wars then truces then allies then the rest, each group by tiles. */
export const diplomacyEmpires = (input: DiplomacyListInput): Array<{ id: string; name: string; stance: EmpireStance; tiles: number | undefined }> => {
  const tilesOf = new Map(input.leaderboard.map((e) => [e.id, e.tiles]));
  const ids = new Set([...input.metPlayerIds, ...input.allies, ...input.activeTruces.map((t) => t.otherPlayerId)]);
  for (const row of input.resourceOffers ?? []) { ids.add(row.fromPlayerId); ids.add(row.toPlayerId); }
  for (const row of input.resourceAgreements ?? []) { ids.add(row.proposerId); ids.add(row.targetId); }
  ids.delete(input.me);
  return [...ids]
    .map((id) => ({ id, name: input.nameOf(id) || "Empire", stance: empireStance(id, input), tiles: tilesOf.get(id) }))
    .sort((a, b) => STANCE_ORDER[a.stance.kind] - STANCE_ORDER[b.stance.kind] || (b.tiles ?? -1) - (a.tiles ?? -1) || a.name.localeCompare(b.name));
};

const crest = (name: string, color: string | undefined, size = ""): string =>
  `<span class="v2d-crest${size}" style="background:${esc(color ?? "#5a4828")}" aria-hidden="true">${esc((name.trim()[0] ?? "?").toUpperCase())}</span>`;

const offerWhat = (kind: "alliance" | "truce", r: AllianceRequest | TruceRequest): string =>
  kind === "alliance" ? "Alliance" : `${(r as TruceRequest).extendsTruce ? "Extend truce" : "Truce"} ${(r as TruceRequest).durationHours}h`;

const requestRow = (kind: "alliance" | "truce", r: AllianceRequest | TruceRequest, input: DiplomacyListInput): string => {
  const name = input.nameOf(r.fromPlayerId) || r.fromName || "Empire";
  const what = offerWhat(kind, r);
  const terms = r.terms ? describeDiplomacyTermsForRecipient(r.terms, name) : "";
  return `<div class="v2d-req">${crest(name, input.colorOf(r.fromPlayerId))}
    <span class="v2d-req-text"><b>${esc(name)}</b><span>${what}${terms ? ` · ${esc(terms)}` : ""}</span></span>
    <button type="button" class="v2s-btn v2s-btn-primary v2s-btn-sm" data-v2-dip-accept="${kind}" data-request-id="${esc(r.id)}">Accept</button>
    <button type="button" class="v2s-btn v2s-btn-sm" data-v2-dip-counter="${kind}" data-request-id="${esc(r.id)}">Counter</button>
    <button type="button" class="v2s-btn v2s-btn-sm v2s-btn-ghost" data-v2-dip-reject="${kind}" data-request-id="${esc(r.id)}" aria-label="Decline">✕</button>
  </div>`;
};

// An offer you made, waiting on the other House; Withdraw sends ALLIANCE_CANCEL / TRUCE_CANCEL.
const sentRow = (kind: "alliance" | "truce", r: AllianceRequest | TruceRequest, input: DiplomacyListInput): string => {
  const name = input.nameOf(r.toPlayerId) || r.toName || "Empire";
  const terms = r.terms ? describeDiplomacyTermsForProposer(r.terms, name) : "";
  const expiresAt = (r as TruceRequest).expiresAt;
  const left = typeof expiresAt === "number" ? ` · ${socialRemainingLabel(expiresAt, input.nowMs)} left` : "";
  return `<div class="v2d-req v2d-sent">${crest(name, input.colorOf(r.toPlayerId))}
    <span class="v2d-req-text"><b>${esc(name)}</b><span>${offerWhat(kind, r)}${terms ? ` · ${esc(terms)}` : ""} · waiting${left}</span></span>
    <button type="button" class="v2s-btn v2s-btn-sm v2s-btn-ghost" data-v2-dip-cancel="${kind}" data-request-id="${esc(r.id)}">Withdraw</button>
  </div>`;
};

// A truce in its last two hours, pinned above the grid; Extend opens the deal, whose Extend 12h / 24h buttons send the offer.
const endingRow = (truce: ActiveTruceView, input: DiplomacyListInput): string => {
  const name = input.nameOf(truce.otherPlayerId) || truce.otherPlayerName || "Empire";
  return `<div class="v2d-req v2d-ending">${crest(name, input.colorOf(truce.otherPlayerId))}
    <span class="v2d-req-text"><b>${esc(name)}</b><span>Truce ends ${truceTimeLeftLabel(truce.endsAt, input.nowMs)}</span></span>
    ${truceCanExtend(truce, input.nowMs) ? `<button type="button" class="v2s-btn v2s-btn-primary v2s-btn-sm" data-v2-dip-open="${esc(truce.otherPlayerId)}">Extend</button>` : `<button type="button" class="v2s-btn v2s-btn-sm" data-v2-dip-open="${esc(truce.otherPlayerId)}">Open</button>`}
  </div>`;
};

/** Ranked empires you haven't met yet: an offer needs no contact, so they open the deal like any met empire. */
export const unmetRankedEmpires = (input: DiplomacyListInput, listed: ReadonlySet<string>): Array<{ id: string; name: string; tiles: number }> =>
  input.leaderboard.filter((e) => e.id !== input.me && !e.id.startsWith("barbarian") && !listed.has(e.id)).map((e) => ({ id: e.id, name: input.nameOf(e.id) || e.name || "Empire", tiles: e.tiles }));

export const diplomacyListHtml = (input: DiplomacyListInput): string => {
  const requests = [
    ...(input.resourceOffers ?? []).map(row => {
      const incoming=row.toPlayerId===input.me,id=incoming?row.fromPlayerId:row.toPlayerId,name=incoming?row.fromPlayerName:row.toPlayerName;
      return `<div class="v2d-req"><span class="v2d-req-text"><b>${esc(name)}</b><span>Resource trade · ${row.status==="settling"?"settling payment":incoming?"offer received":"offer sent"}</span></span><button type="button" class="v2s-btn v2s-btn-primary v2s-btn-sm" data-v2-dip-open="${esc(id)}">Review trade</button></div>`;
    }),
    ...input.incomingTruce.map((r) => requestRow("truce", r, input)),
    ...input.incomingAlliance.map((r) => requestRow("alliance", r, input))
  ];
  const ending = trucesEndingSoon(input.activeTruces, input.nowMs).map((truce) => endingRow(truce, input));
  const endingHtml = ending.length > 0 ? `<section class="v2d-reqs v2d-endings"><h2 class="v2s-h2">Truces ending · ${ending.length}</h2>${ending.join("")}</section>` : "";
  const reqHtml = requests.length > 0 ? `<section class="v2d-reqs"><h2 class="v2s-h2">Requests · ${requests.length}</h2>${requests.join("")}</section>` : "";
  const sent = [...(input.outgoingTruce ?? []).map((r) => sentRow("truce", r, input)), ...(input.outgoingAlliance ?? []).map((r) => sentRow("alliance", r, input))];
  const sentHtml = sent.length > 0 ? `<section class="v2d-reqs"><h2 class="v2s-h2">Sent · ${sent.length}</h2>${sent.join("")}</section>` : "";
  const empires = diplomacyEmpires(input);
  const unmet = unmetRankedEmpires(input, new Set(empires.map((e) => e.id)));
  const unmetHtml = unmet.length > 0
    ? `<section class="v2d-grid-wrap"><h2 class="v2s-h2">Not met yet · ${unmet.length}</h2><div class="v2d-grid">${unmet.map((e) => `<button type="button" class="v2d-emp v2d-emp-met" data-v2-dip-open="${esc(e.id)}">
        ${crest(e.name, input.colorOf(e.id), " v2d-crest-lg")}<span class="v2d-emp-name">${esc(e.name)}</span>
        <span class="v2d-emp-stance">Not met</span><span class="v2d-emp-tiles">${garrisonedTilesLabel(e.tiles)}</span>
      </button>`).join("")}</div></section>`
    : "";
  // The empty note sits outside the grid: as a grid cell it was one 104px column wide (playtest 2026-11-12).
  const grid = empires.length > 0
    ? `<div class="v2d-grid">${empires.map((e) => `<button type="button" class="v2d-emp v2d-emp-${e.stance.kind}${e.stance.ending ? " v2d-emp-ending" : ""}" data-v2-dip-open="${esc(e.id)}">
        ${crest(e.name, input.colorOf(e.id), " v2d-crest-lg")}<span class="v2d-emp-name">${esc(e.name)}</span>
        <span class="v2d-emp-stance">${esc(e.stance.label)}</span><span class="v2d-emp-tiles">${e.tiles !== undefined ? garrisonedTilesLabel(e.tiles) : ""}</span>
      </button>`).join("")}</div>`
    : `<div class="v2s-empty">No empires met yet${unmet.length > 0 ? ". You can still offer a deal to any empire below." : ""}</div>`;
  // One scrolling column (data-v2-scroll keeps its place across repaints). Playtest 2026-11-13: each
  // section scrolled on its own, so a Sent list squeezed the met and unmet grids into overlapping slivers.
  return `<div class="v2d-list" data-v2-scroll="diplomacy">${endingHtml}${reqHtml}${sentHtml}<section class="v2d-grid-wrap"><h2 class="v2s-h2">Empires you've met · ${empires.length}</h2>${grid}</section>${unmetHtml}</div>`;
};

/**
 * The deal's top line: relation and both garrisoned tile counts ("Ally · 1,204 garrisoned tiles · you have 980").
 * Playtest 2026-11-12: a bare "you 1" read as an unexplained number.
 */
export const dealFactsText = (stanceLabel: string, theirs: number | undefined, mine: number | undefined): string => {
  return [stanceLabel, theirs === undefined ? "" : garrisonedTilesLabel(theirs), mine === undefined ? "" : `you have ${mine.toLocaleString("en-US")}`].filter(Boolean).join(" · ");
};

/**
 * `facts`: the relation and tile counts the trade view itself doesn't show (dealFactsText). With `targetId`, the
 * name and a "Profile ▸" link open that empire's profile (data-hud-v2-profile), which closes back to this deal.
 */
export const dealSkeletonHtml = (targetName: string, facts = "", targetId?: string): string => {
  const name = targetId
    ? `<button type="button" class="v2d-deal-with v2d-deal-profile" data-hud-v2-profile="${esc(targetId)}" title="View ${esc(targetName)}'s profile">${esc(targetName)}</button>`
    : `<span class="v2d-deal-with">${esc(targetName)}</span>`;
  const profileLink = targetId ? `<button type="button" class="v2s-btn v2s-btn-sm v2s-btn-ghost v2d-deal-profile-link" data-hud-v2-profile="${esc(targetId)}">Profile ▸</button>` : "";
  return `<div class="v2d-deal-nav"><button type="button" class="v2s-link" data-v2-dip-back>◁ All empires</button>${name}${facts ? `<span class="v2d-deal-facts">${esc(facts)}</span>` : ""}${profileLink}</div>
   <div id="v2d-pact"></div>
   <div class="v2d-deal">
     <section class="v2d-terms" id="v2s-dip-host" aria-label="Deal"></section>
   </div>`;
};

/** Answer to an offer in the list: accept or decline one sent to you, or withdraw (CANCEL) one you sent. */
export const diplomacyResponseMessage = (kind: "alliance" | "truce", verb: "ACCEPT" | "REJECT" | "CANCEL", requestId: string): Record<string, unknown> => ({
  type: `${kind === "alliance" ? "ALLIANCE" : "TRUCE"}_${verb}`,
  requestId,
  ...(verb === "ACCEPT" ? { confirmedResourceSupply: true } : {})
});
