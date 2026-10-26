// Battle screen for the new HUD: you on the left, the defender on the right,
// the outcome in the bottom middle. The preview wraps the existing effort
// sheet (it still owns validation and sending; this view forwards to its
// buttons). After launch it follows the live capture, then shows the result.

import type { FrontierCombatSideBreakdown } from "@border-empires/shared";
import type { TileCombatBreakdown } from "../client-types.js";

export type BattleSide = { id: string; name: string; color: string | undefined; role: string; sub: string };

export type BattleEffort = { key: string; label: string; amount: number; active: boolean };

export type BattlePreviewInput = {
  title: string;
  coords: { x: number; y: number };
  you: BattleSide;
  them: BattleSide;
  breakdown: TileCombatBreakdown | undefined;
  /** Win chance as shown by the effort sheet for the current commitment, 0..100. */
  winPct: number | undefined;
  efforts: BattleEffort[];
  commit: number | undefined;
};

export type BattleLiveInput = {
  title: string;
  coords: { x: number; y: number };
  you: BattleSide;
  them: BattleSide;
  breakdown: TileCombatBreakdown | undefined;
  winPct: number | undefined;
  secondsLeft: number;
  totalSeconds: number;
};

export type BattleResultInput = {
  title: string;
  coords: { x: number; y: number };
  you: BattleSide;
  them: BattleSide;
  breakdown: TileCombatBreakdown | undefined;
  won: boolean;
  headline: string;
  detail: string;
  manpowerLoss: number | undefined;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "Win chance 62% · costs 120 manpower" → 62. */
export const parseWinPct = (text: string | null | undefined): number | undefined => {
  const match = /(\d+(?:\.\d+)?)\s*%/.exec(text ?? "");
  return match ? Math.round(Number(match[1])) : undefined;
};

const pctOf = (mult: number): string => {
  const delta = Math.round((mult - 1) * 100);
  return `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}%`;
};

const rowsHtml = (entries: FrontierCombatSideBreakdown["infrastructure"], goodWhenUp: boolean): string =>
  entries.map((e) => {
    const good = goodWhenUp ? e.mult >= 1 : e.mult < 1;
    return `<div class="v2b-row"><span>${esc(e.label)}</span><span class="v2b-${good ? "good" : "bad"}">${pctOf(e.mult)}</span></div>`;
  }).join("");

const sideHtml = (side: BattleSide, breakdown: FrontierCombatSideBreakdown | undefined, mine: boolean): string => {
  const body = breakdown
    ? `<div class="v2b-row"><span>Base strength</span><span>${Math.round(breakdown.base)}</span></div>
       ${breakdown.infrastructure.length > 0 ? `<div class="v2b-h">Infrastructure</div>${rowsHtml(breakdown.infrastructure, mine)}` : ""}
       ${breakdown.battle.length > 0 ? `<div class="v2b-h">This battle</div>${rowsHtml(breakdown.battle, mine)}` : ""}
       <div class="v2b-eff"><span>Effective</span><b>${Math.round(breakdown.effective)}</b></div>`
    : `<div class="v2s-empty">Reading the odds…</div>`;
  return `<section class="v2b-side v2b-side-${mine ? "you" : "them"}">
    <div class="v2b-side-head"><span class="v2b-crest" style="background:${esc(side.color ?? "#5a4828")}" aria-hidden="true">${esc((side.name.trim()[0] ?? "?").toUpperCase())}</span>
      <span><span class="v2b-role">${esc(side.role)}</span><span class="v2b-name">${esc(side.name)}</span><span class="v2b-sub">${esc(side.sub)}</span></span></div>
    ${body}
  </section>`;
};

const headHtml = (phase: string, tone: string, title: string, coords: { x: number; y: number }): string =>
  `<div class="v2b-head"><span class="v2b-phase v2b-phase-${tone}">${esc(phase)}</span><span class="v2b-title">${esc(title)}</span><span class="v2b-coords">(${coords.x}, ${coords.y})</span></div>`;

const ring = (pct: number, color: string, inner: string, label: string): string =>
  `<div class="v2b-ring" role="img" aria-label="${esc(label)}" style="background:conic-gradient(${color} ${pct}%, #3a3125 0)"><span class="v2b-ring-in">${inner}</span></div>`;

export const battlePreviewHtml = (input: BattlePreviewInput): string => {
  const pct = input.winPct ?? (input.breakdown ? Math.round(input.breakdown.winChance * 100) : undefined);
  const efforts = input.efforts.map((e) => `<button type="button" role="radio" aria-checked="${e.active}" class="v2b-effort${e.active ? " v2b-effort-on" : ""}" data-v2-battle-effort="${esc(e.key)}"><b>${esc(e.label)}</b><span>${e.amount} MP</span></button>`).join("");
  return `${headHtml("ASSAULT", "gold", input.title, input.coords)}
    ${sideHtml(input.you, input.breakdown?.attacker, true)}
    ${sideHtml(input.them, input.breakdown?.defender, false)}
    <div class="v2b-panel">
      <div class="v2b-panel-top">
        ${ring(pct ?? 0, "#d9b25c", pct !== undefined ? `<b>${pct}</b><small>%</small>` : "<small>—</small>", pct !== undefined ? `${pct} percent win chance` : "Win chance unknown")}
        <div class="v2b-panel-main"><span class="v2b-panel-title">Win chance</span><div class="v2b-efforts" role="radiogroup" aria-label="Effort">${efforts}</div>
        ${input.commit !== undefined ? `<span class="v2b-cost">Cost <b>${input.commit} MP</b></span>` : ""}</div>
      </div>
      <div class="v2b-panel-actions"><button type="button" class="v2s-btn v2s-btn-primary v2b-go" data-v2-battle-go>Confirm attack</button><button type="button" class="v2s-btn" data-v2-battle-cancel>Back · Esc</button></div>
    </div>`;
};

export const battleLiveHtml = (input: BattleLiveInput): string => {
  const pct = input.totalSeconds > 0 ? Math.round((input.secondsLeft / input.totalSeconds) * 100) : 0;
  return `${headHtml("BATTLE IN PROGRESS", "red", input.title, input.coords)}
    ${sideHtml(input.you, input.breakdown?.attacker, true)}
    ${sideHtml(input.them, input.breakdown?.defender, false)}
    <div class="v2b-panel v2b-panel-live">
      <div class="v2b-panel-top">
        ${ring(pct, "#d06a5a", `<b>${input.secondsLeft}s</b><small>of ${input.totalSeconds}</small>`, `${input.secondsLeft} seconds until the battle resolves`)}
        <div class="v2b-panel-main"><span class="v2b-panel-title">Battle in progress</span>
          <span class="v2b-facts">${input.winPct !== undefined ? `<span>Odds <b>${input.winPct}%</b></span>` : ""}</span></div>
      </div>
      <div class="v2b-panel-actions"><button type="button" class="v2s-btn" data-v2-close>Back to map</button><button type="button" class="v2s-btn v2s-btn-danger" data-v2-battle-abort>Cancel attack</button></div>
    </div>`;
};

export const battleResultHtml = (input: BattleResultInput): string =>
  `${headHtml("RESOLVED", input.won ? "green" : "amber", input.title, input.coords)}
    ${sideHtml(input.you, input.breakdown?.attacker, true)}
    ${sideHtml(input.them, input.breakdown?.defender, false)}
    <div class="v2b-panel v2b-panel-${input.won ? "won" : "held"}">
      <div class="v2b-panel-top">
        <div class="v2b-result-ico" aria-hidden="true">${input.won ? "✓" : "⛨"}</div>
        <div class="v2b-panel-main"><span class="v2b-result-title">${esc(input.headline)}</span><span class="v2b-result-body">${esc(input.detail)}</span>
          ${input.manpowerLoss ? `<span class="v2b-cost">−${Math.round(input.manpowerLoss)} MP</span>` : ""}</div>
      </div>
      <div class="v2b-panel-actions"><button type="button" class="v2s-btn v2s-btn-primary" data-v2-battle-show>Show tile</button><button type="button" class="v2s-btn" data-v2-close>Close · Esc</button></div>
    </div>`;
