import { describeDiplomacyTermsForRecipient } from "@border-empires/shared";
// Diplomacy for the new HUD. Step 1 lists every empire you've met as crests,
// with requests waiting on you pinned at the top. Step 2 is the deal: the
// trade view re-hosted full width (your goods and treaties on the left, the
// deal in the middle, theirs on the right). Picking an empire hides the list.

import type { ActiveTruceView, AllianceRequest, LeaderboardOverallEntry, TruceRequest } from "../client-types.js";

export type DiplomacyListInput = {
  resourceOffers?: readonly import("@border-empires/shared").ResourceTradeOffer[];
  resourceAgreements?: readonly import("@border-empires/shared").ResourceSupplyAgreementStatus[];
  me: string;
  metPlayerIds: ReadonlySet<string>;
  allies: readonly string[];
  activeTruces: readonly ActiveTruceView[];
  incomingAlliance: readonly AllianceRequest[];
  incomingTruce: readonly TruceRequest[];
  leaderboard: readonly LeaderboardOverallEntry[];
  nameOf: (playerId: string) => string;
  colorOf: (playerId: string) => string | undefined;
  nowMs: number;
};

export type EmpireStance = { kind: "ally" | "truce" | "met"; label: string };

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const hoursLeft = (endsAt: number, nowMs: number): string => {
  const h = Math.max(0, Math.ceil((endsAt - nowMs) / 3_600_000));
  return h >= 1 ? `${h}h` : "<1h";
};

export const empireStance = (id: string, input: Pick<DiplomacyListInput, "allies" | "activeTruces" | "nowMs">): EmpireStance => {
  if (input.allies.includes(id)) return { kind: "ally", label: "Ally" };
  const truce = input.activeTruces.find((t) => t.otherPlayerId === id);
  if (truce) return { kind: "truce", label: `Truce ${hoursLeft(truce.endsAt, input.nowMs)}` };
  return { kind: "met", label: "Met" };
};

const STANCE_ORDER: Record<EmpireStance["kind"], number> = { truce: 0, ally: 1, met: 2 };

/** Every met empire, truces then allies then the rest, each group by tiles. */
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

const termsText = (terms: AllianceRequest["terms"]): string => {
  if (!terms) return "";
  return describeDiplomacyTermsForRecipient(terms,"Other House");
};

const requestRow = (kind: "alliance" | "truce", r: AllianceRequest | TruceRequest, input: DiplomacyListInput): string => {
  const name = input.nameOf(r.fromPlayerId) || r.fromName || "Empire";
  const what = kind === "alliance" ? "Alliance" : `${(r as TruceRequest).extendsTruce ? "Extend truce" : "Truce"} ${(r as TruceRequest).durationHours}h`;
  const terms = termsText(r.terms);
  return `<div class="v2d-req">${crest(name, input.colorOf(r.fromPlayerId))}
    <span class="v2d-req-text"><b>${esc(name)}</b><span>${what}${terms ? ` · ${esc(terms)}` : ""}</span></span>
    <button type="button" class="v2s-btn v2s-btn-primary v2s-btn-sm" data-v2-dip-accept="${kind}" data-request-id="${esc(r.id)}">Accept</button>
    <button type="button" class="v2s-btn v2s-btn-sm" data-v2-dip-counter="${kind}" data-request-id="${esc(r.id)}">Counter</button>
    <button type="button" class="v2s-btn v2s-btn-sm v2s-btn-ghost" data-v2-dip-reject="${kind}" data-request-id="${esc(r.id)}" aria-label="Decline">✕</button>
  </div>`;
};

export const diplomacyListHtml = (input: DiplomacyListInput): string => {
  const requests = [
    ...(input.resourceOffers ?? []).map(row => {
      const incoming=row.toPlayerId===input.me,id=incoming?row.fromPlayerId:row.toPlayerId,name=incoming?row.fromPlayerName:row.toPlayerName;
      return `<div class="v2d-req"><span class="v2d-req-text"><b>${esc(name)}</b><span>Resource trade · ${row.status==="settling"?"settling payment":incoming?"offer received":"offer sent"}</span></span><button type="button" class="v2s-btn v2s-btn-primary v2s-btn-sm" data-v2-dip-open="${esc(id)}">Review trade</button></div>`;
    }),
    ...input.incomingTruce.map((r) => requestRow("truce", r, input)),
    ...input.incomingAlliance.map((r) => requestRow("alliance", r, input))
  ];
  const reqHtml = requests.length > 0 ? `<section class="v2d-reqs"><h2 class="v2s-h2">Requests · ${requests.length}</h2>${requests.join("")}</section>` : "";
  const empires = diplomacyEmpires(input);
  const grid = empires.length > 0
    ? empires.map((e) => `<button type="button" class="v2d-emp v2d-emp-${e.stance.kind}" data-v2-dip-open="${esc(e.id)}">
        ${crest(e.name, input.colorOf(e.id), " v2d-crest-lg")}<span class="v2d-emp-name">${esc(e.name)}</span>
        <span class="v2d-emp-stance">${esc(e.stance.label)}</span><span class="v2d-emp-tiles">${e.tiles !== undefined ? `${e.tiles.toLocaleString("en-US")} tiles` : ""}</span>
      </button>`).join("")
    : `<div class="v2s-empty">No empires met yet</div>`;
  return `${reqHtml}<section class="v2d-grid-wrap"><h2 class="v2s-h2">Empires you've met · ${empires.length}</h2><div class="v2d-grid">${grid}</div></section>`;
};

/** `facts`: the relation and tile counts the trade view itself doesn't show ("Ally · 1,204 tiles · you 980"). */
export const dealSkeletonHtml = (targetName: string, facts = ""): string =>
  `<div class="v2d-deal-nav"><button type="button" class="v2s-link" data-v2-dip-back>◁ All empires</button><span class="v2d-deal-with">${esc(targetName)}</span>${facts ? `<span class="v2d-deal-facts">${esc(facts)}</span>` : ""}</div>
   <div class="v2d-deal">
     <section class="v2d-terms" id="v2s-dip-host" aria-label="Deal"></section>
   </div>`;
