// Your empire's Attack and Defense on your own profile screen. The legacy
// Manifest panel showed these as ATK/DEF chips; HUD v2 had no home for them.
// The number is the same base power the battle screen and win-chance formula
// start from: BASE_COMBAT_POWER times every lasting multiplier the server
// lists in modBreakdown (manifests, AFC domains, weapons factories). Forts,
// siege, terrain and effort apply per battle and stay on the battle screen.

import { BASE_COMBAT_POWER } from "@border-empires/shared";

export type CombatModRow = { label: string; mult: number };

export type ProfileCombat = { attack: readonly CombatModRow[]; defense: readonly CombatModRow[] };

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The server lists a neutral "Base" row; it's the starting number, not a source. */
const sourceRows = (rows: readonly CombatModRow[]): CombatModRow[] =>
  rows.filter((row) => row.label.trim().toLowerCase() !== "base" && Number.isFinite(row.mult));

export const combatPower = (rows: readonly CombatModRow[]): number =>
  sourceRows(rows).reduce((acc, row) => acc * row.mult, BASE_COMBAT_POWER);

export const formatCombatPower = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
};

const pctOf = (mult: number): { text: string; tone: "good" | "bad" | "flat" } => {
  const delta = Math.round((mult - 1) * 100);
  if (delta === 0) return { text: "±0%", tone: "flat" };
  return { text: `${delta > 0 ? "+" : "−"}${Math.abs(delta)}%`, tone: delta > 0 ? "good" : "bad" };
};

export const combatStatCardsHtml = (combat: ProfileCombat): string =>
  `<div class="v2p-stat v2p-stat-atk"><span>Attack</span><b>${formatCombatPower(combatPower(combat.attack))}</b></div>` +
  `<div class="v2p-stat v2p-stat-def"><span>Defense</span><b>${formatCombatPower(combatPower(combat.defense))}</b></div>`;

const sidePanelHtml = (title: string, rows: readonly CombatModRow[]): string => {
  const sources = sourceRows(rows);
  const items = sources.map((row) => {
    const pct = pctOf(row.mult);
    return `<div><dt>${esc(row.label)}</dt><dd class="v2p-mod-${pct.tone}">${pct.text}</dd></div>`;
  });
  return `<section class="v2p-panel v2p-combat" data-v2-combat="${title.toLowerCase()}"><h3>${title}</h3>
    <dl class="v2p-rows">
      <div><dt>Base</dt><dd>${formatCombatPower(BASE_COMBAT_POWER)}</dd></div>
      ${items.join("")}
      <div class="v2p-combat-total"><dt>Total</dt><dd>${formatCombatPower(combatPower(rows))}</dd></div>
    </dl>
    ${sources.length === 0 ? `<p class="v2p-none">No bonuses yet</p>` : ""}
  </section>`;
};

export const combatPanelsHtml = (combat: ProfileCombat): string =>
  `${sidePanelHtml("Attack", combat.attack)}${sidePanelHtml("Defense", combat.defense)}`;

export const COMBAT_FOOTNOTE_HTML = `<p class="v2p-none v2p-combat-note">Forts, siege, terrain and effort count per battle.</p>`;
