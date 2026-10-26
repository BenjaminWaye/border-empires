// Top-right of the new HUD: the season clock line and the rivals strip.
// Rivals show truces first, then allies, then everyone else you've met, capped,
// with an overflow count that opens Diplomacy. Stance is an icon plus text, never colour alone.

import type { ActiveTruceView, SeasonVictoryObjectiveView } from "../client-types.js";

export type RivalInput = {
  me: string;
  metPlayerIds: ReadonlySet<string>;
  allies: readonly string[];
  activeTruces: readonly ActiveTruceView[];
  nameOf: (playerId: string) => string;
  colorOf: (playerId: string) => string | undefined;
  nowMs: number;
};

export type RivalToken = { id: string; name: string; initial: string; color: string; stance: "truce" | "ally" | "met"; label: string };

export const RIVAL_STRIP_CAP = 5;

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const hoursLeft = (endsAt: number, nowMs: number): string => {
  const h = Math.max(0, Math.ceil((endsAt - nowMs) / 3_600_000));
  return h >= 1 ? `${h}h` : "<1h";
};

/** Truces first (soonest to end), then allies, then the rest you've met; past the cap is the overflow count. */
export const rivalTokens = (input: RivalInput): { shown: RivalToken[]; hidden: number } => {
  const tokens: RivalToken[] = [];
  const seen = new Set<string>();
  const truces = [...input.activeTruces].filter((t) => t.otherPlayerId !== input.me).sort((a, b) => a.endsAt - b.endsAt);
  for (const t of truces) {
    if (seen.has(t.otherPlayerId)) continue;
    seen.add(t.otherPlayerId);
    tokens.push(token(input, t.otherPlayerId, "truce", `TRUCE ${hoursLeft(t.endsAt, input.nowMs)}`));
  }
  for (const id of input.allies) {
    if (id === input.me || seen.has(id)) continue;
    seen.add(id);
    tokens.push(token(input, id, "ally", "ALLY"));
  }
  for (const id of input.metPlayerIds) {
    if (id === input.me || seen.has(id)) continue;
    seen.add(id);
    tokens.push(token(input, id, "met", "MET"));
  }
  return { shown: tokens.slice(0, RIVAL_STRIP_CAP), hidden: Math.max(0, tokens.length - RIVAL_STRIP_CAP) };
};

const token = (input: RivalInput, id: string, stance: RivalToken["stance"], label: string): RivalToken => {
  const name = input.nameOf(id) || "Empire";
  return { id, name, initial: (name.trim()[0] ?? "?").toUpperCase(), color: input.colorOf(id) ?? "#5a4828", stance, label };
};

const STANCE_ICON: Record<RivalToken["stance"], string> = {
  truce: "M5 3h8M5 15h8M6 3c0 4 6 4 6 6s-6 2-6 6M12 3c0 4-6 4-6 6s6 2 6 6",
  ally: "M4 9l3.5 3.5L14 6",
  met: "M3 9h12"
};

export const rivalsHtml = (input: RivalInput): string => {
  const { shown, hidden } = rivalTokens(input);
  const items = shown.map((t) => `<button type="button" class="hud-v2-rival hud-v2-rival-${t.stance}" data-hud-v2-diplomacy="${esc(t.id)}" aria-label="${esc(t.name)}, ${esc(t.label.toLowerCase())}">
      <span class="hud-v2-rival-token" style="background:${esc(t.color)}">${esc(t.initial)}<span class="hud-v2-rival-badge"><svg width="11" height="11" viewBox="0 0 18 18" aria-hidden="true"><path d="${STANCE_ICON[t.stance]}"/></svg></span></span>
      <span class="hud-v2-rival-name">${esc(t.name)}</span><span class="hud-v2-rival-stance">${esc(t.label)}</span>
    </button>`).join("");
  const more = hidden > 0 ? `<button type="button" class="hud-v2-rival-more" data-hud-v2-open="diplomacy" aria-label="All empires you've met">+${hidden}</button>` : "";
  return items + more;
};

/** The one victory path someone is holding right now, if any. */
export const holdingObjective = (objectives: readonly SeasonVictoryObjectiveView[]): SeasonVictoryObjectiveView | undefined =>
  objectives
    .filter((o) => o.conditionMet && o.leaderName)
    .sort((a, b) => (a.holdRemainingSeconds ?? Infinity) - (b.holdRemainingSeconds ?? Infinity) || a.name.localeCompare(b.name))[0];

export const seasonClockHtml = (objectives: readonly SeasonVictoryObjectiveView[]): string => {
  const holding = holdingObjective(objectives);
  if (!holding) return `<span class="hud-v2-season-title">Victory race</span><span class="hud-v2-season-line">Nobody holding a path</span>`;
  const left = holding.holdRemainingSeconds !== undefined ? ` · ${hoursLeft(Date.now() + holding.holdRemainingSeconds * 1000, Date.now())}` : "";
  return `<span class="hud-v2-season-title">Victory race</span><span class="hud-v2-season-line hud-v2-season-holding">⌛ <b>${esc(holding.leaderName)}</b> holding ${esc(holding.name)}${left}</span>`;
};
