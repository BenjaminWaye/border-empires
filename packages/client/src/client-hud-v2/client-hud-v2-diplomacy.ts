// Diplomacy for the new HUD. Step 1 lists every empire you've met as crests,
// with requests waiting on you pinned at the top. Step 2 is the deal: you on
// the left, the terms in the middle (the existing trade view, re-hosted) and
// them on the right. Picking an empire hides the list.

import type { ActiveTruceView, AllianceRequest, LeaderboardOverallEntry, TruceRequest } from "../client-types.js";

export type DiplomacyListInput = {
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
  ids.delete(input.me);
  return [...ids]
    .map((id) => ({ id, name: input.nameOf(id) || "Empire", stance: empireStance(id, input), tiles: tilesOf.get(id) }))
    .sort((a, b) => STANCE_ORDER[a.stance.kind] - STANCE_ORDER[b.stance.kind] || (b.tiles ?? -1) - (a.tiles ?? -1) || a.name.localeCompare(b.name));
};

const crest = (name: string, color: string | undefined, size = ""): string =>
  `<span class="v2d-crest${size}" style="background:${esc(color ?? "#5a4828")}" aria-hidden="true">${esc((name.trim()[0] ?? "?").toUpperCase())}</span>`;

const termsText = (terms: AllianceRequest["terms"]): string => {
  if (!terms) return "";
  const parts: string[] = [];
  if (terms.give.gold > 0) parts.push(`gives ${terms.give.gold} Coin`);
  if (terms.give.shard > 0) parts.push(`gives ${terms.give.shard} Shard`);
  if (terms.ask.gold > 0) parts.push(`asks ${terms.ask.gold} Coin`);
  if (terms.ask.shard > 0) parts.push(`asks ${terms.ask.shard} Shard`);
  return parts.join(" · ");
};

const requestRow = (kind: "alliance" | "truce", r: AllianceRequest | TruceRequest, input: DiplomacyListInput): string => {
  const name = input.nameOf(r.fromPlayerId) || r.fromName || "Empire";
  const what = kind === "alliance" ? "Alliance" : `Truce ${(r as TruceRequest).durationHours}h`;
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

export type DealSideInput = {
  id: string;
  name: string;
  color: string | undefined;
  role: string;
  rows: Array<{ label: string; value: string }>;
};

export const dealSideHtml = (side: DealSideInput): string =>
  `<div class="v2d-side-head">${crest(side.name, side.color, " v2d-crest-lg")}<span><span class="v2d-side-role">${esc(side.role)}</span><span class="v2d-side-name">${esc(side.name)}</span></span></div>
   ${side.rows.map((r) => `<div class="v2d-side-row"><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`).join("")}`;

export const dealSkeletonHtml = (targetName: string): string =>
  `<div class="v2d-deal-nav"><button type="button" class="v2s-link" data-v2-dip-back>◁ All empires</button><span class="v2d-deal-with">${esc(targetName)}</span></div>
   <div class="v2d-deal">
     <section class="v2d-side v2d-side-you" id="v2s-dip-you"></section>
     <section class="v2d-terms" id="v2s-dip-host" aria-label="Terms"></section>
     <section class="v2d-side v2d-side-them" id="v2s-dip-them"></section>
   </div>`;
