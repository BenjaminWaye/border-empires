// Markup for Space View's action cards (design doc §30): a slim top bar (the
// race for the throne, the Court, Influence, Production), the systems strip
// in a system's view, and one hand of cards. Pure HTML; space-cards.ts wires it.
import { escapeHtml } from "../client-duke-panel/client-duke-escape.js";
import { formatDuration } from "../client-duke-panel/client-duke-format.js";
import type { DukeStatus } from "../client-duke-panel/client-duke-types.js";
import type { CardIcon, SpaceCard, SpaceStop } from "./space-cards-model.js";
import { smokeReason } from "../client-space-view/client-space-view-markers.js";

const ICON_PATHS: Record<CardIcon, string> = {
  crown: "M4 17l2-9 6 5 6-5 2 9z",
  court: "M4 20h16M6 20V10M10 20V10M14 20V10M18 20V10M3 10l9-6 9 6z",
  scroll: "M7 4h10v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2zM9 9h6M9 13h6",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z",
  probe: "M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 110 8 4 4 0 010-8z",
  planet: "M12 7a5 5 0 110 10 5 5 0 010-10zM3 14c3-2 15-6 18-6",
  wrench: "M14 6a4 4 0 00-5 5L4 16l4 4 5-5a4 4 0 005-5l-3 1-2-2z",
  wall: "M4 20V8l8-4 8 4v12zM9 20v-6h6v6",
  sword: "M5 19l4-4M14 4h6v6L10 20l-6-6z",
  eye: "M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12zM12 9a3 3 0 110 6 3 3 0 010-6z",
  lend: "M4 12h12M12 6l6 6-6 6M4 5v14"
};

const icon = (name: CardIcon): string =>
  `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="${ICON_PATHS[name]}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"></path></svg>`;

const cardHtml = (c: SpaceCard): string => {
  const off = c.disabledReason !== null;
  return `<article class="sc-card${c.urgent ? " sc-urgent" : ""}${off ? " sc-off" : ""}${c.free ? " sc-free" : ""}" data-sc-card="${escapeHtml(c.id)}">
    <div class="sc-card-top"><span class="sc-icon">${icon(c.icon)}</span>${c.badge ? `<span class="sc-badge">${escapeHtml(c.badge)}</span>` : ""}</div>
    <h3 class="sc-title">${escapeHtml(c.title)}</h3>
    <div class="sc-chips">
      <span class="sc-gain"><b>+</b>${escapeHtml(c.gain)}</span>
      <span class="sc-cost"><b>−</b>${escapeHtml(c.cost)}</span>
    </div>
    <button type="button" class="sc-play" data-sc-play="${escapeHtml(c.id)}"${off ? ` disabled title="${escapeHtml(c.disabledReason!)}"` : ""}>${escapeHtml(off ? c.disabledReason! : c.verb)}</button>
    ${c.alt ? `<button type="button" class="sc-alt" data-sc-alt="${escapeHtml(c.id)}">${escapeHtml(c.alt.verb)}</button>` : ""}
  </article>`;
};

const raceHtml = (status: DukeStatus): string => {
  const rivals = status.politics?.rivals ?? [];
  const leader = Math.max(status.meters.domainWeight, ...rivals.map((r) => r.weight));
  const mine = leader > 0 ? Math.round((status.meters.domainWeight / leader) * 100) : 100;
  const leaderText = status.meters.rank === 1 ? "You lead" : `Leader ${Math.round(leader)}`;
  return `<div class="sc-race" title="Domain Weight: the strongest Duke when the Court falls becomes Emperor">
    <div class="sc-race-bar"><span style="width:${mine}%"></span></div>
    <div class="sc-race-text"><b>You ${Math.round(status.meters.domainWeight)} · #${status.meters.rank}</b><span>${leaderText}</span></div>
  </div>`;
};

const barHtml = (status: DukeStatus, stop: SpaceStop): string => {
  const production = status.systems.reduce((sum, s) => sum + s.ratePerDay, 0);
  const back = stop.mode === "system" ? `<button type="button" class="sc-back" data-sc-galaxy aria-label="Back to the galaxy">${"‹"} Galaxy</button>` : "";
  return `<header class="sc-bar">${back}${raceHtml(status)}
    <span class="sc-stat" title="Court Strength: when it falls, the era ends"><span>Court</span><b>${status.court.current}</b></span>
    <span class="sc-stat" title="Influence pays for decrees"><span>Influence</span><b>${Math.floor(status.influence)}</b></span>
    <span class="sc-stat" title="Production: how fast your systems build"><span>Production</span><b>${Math.round(production)}</b></span>
  </header>`;
};

const systemsHtml = (status: DukeStatus, stop: SpaceStop): string => {
  if (stop.mode !== "system") return "";
  const tabs = status.systems
    .map((s) => {
      const on = s.seasonId === stop.seasonId;
      const tone = s.stability >= 80 ? "ok" : s.stability >= 40 ? "warn" : "bad";
      return `<button type="button" class="sc-sys${on ? " sc-sys-on" : ""}" data-sc-system="${escapeHtml(s.seasonId)}" aria-pressed="${on}">
        ${s.order.ready ? `<span class="sc-dot" title="Order ready"></span>` : ""}${escapeHtml(s.label)}
        <span class="sc-stab sc-stab-${tone}"><span style="width:${s.stability}%"></span></span><span class="sc-num">${s.stability}</span>
      </button>`;
    })
    .join("");
  return `<nav class="sc-systems" aria-label="Your systems">${tabs}</nav>${bodiesHtml(status, stop.seasonId)}`;
};

const BODY_NAMES = { GAS_GIANT: "Gas giant", ASTEROID_BELT: "Belt", ICE_MOON: "Ice moon" } as const;

// What sits on each body of this system (§31), matching the 3D markers.
const bodiesHtml = (status: DukeStatus, seasonId: string): string => {
  const s = status.systems.find((x) => x.seasonId === seasonId);
  if (!s || s.bodies.length === 0) return "";
  const chips = s.bodies
    .map((b) => {
      const building = s.slot?.bodyIndex === b.index;
      const state = b.development ? escapeHtml(b.development.label) : b.base ? "Base" : "No base";
      const tone = b.development ? "sc-body-dev" : b.base ? "sc-body-base" : "sc-body-none";
      return `<span class="sc-body ${tone}${building ? " sc-body-building" : ""}"><b>${BODY_NAMES[b.kind]}</b>${state}${building ? " · building" : ""}</span>`;
    })
    .join("");
  // Smoking only while the hit is recent (the server's public 24h window).
  return `<div class="sc-bodies" aria-label="Bodies in this system">${chips}</div>`;
};

// The one line above the hand: whose turn it is, or when the next one comes.
const turnHtml = (status: DukeStatus, stop: SpaceStop, now: number, confirmingCancel: boolean): string => {
  if (stop.mode === "galaxy") {
    const ready = status.decree.ready;
    return `<p class="sc-turn">${ready ? "<b>Decree ready</b> · one a day, for your whole empire" : `Decree used · next in ${formatDuration((status.decree.readyAt ?? now) - now)}`}</p>`;
  }
  const s = status.systems.find((x) => x.seasonId === stop.seasonId);
  if (!s) return "";
  const cancelText = confirmingCancel ? "Really cancel? Today's order stays used" : "Cancel";
  const building = s.slot ? ` · building ${escapeHtml(s.slot.label)}, ${formatDuration(s.slot.completesAt - now)} <button type="button" class="sc-link" data-sc-cancel>${cancelText}</button>` : "";
  return `<p class="sc-turn">${s.order.ready ? `<b>${escapeHtml(s.label)}: order ready</b>` : `${escapeHtml(s.label)}: next order in ${formatDuration((s.order.readyAt ?? now) - now)}`}${building}</p>`;
};

export const spaceCardsHtml = (status: DukeStatus, stop: SpaceStop, hand: ReadonlyArray<SpaceCard>, now: number, message: string, confirmingCancel = false): string =>
  `<div class="sc-top">${barHtml(status, stop)}${systemsHtml(status, stop)}</div>
   <section class="sc-hand-wrap" aria-label="${stop.mode === "galaxy" ? "Your decrees" : "This system's orders"}">
     ${turnHtml(status, stop, now, confirmingCancel)}
     ${stop.mode === "system" && smokeReason(status, stop.seasonId, now) ? `<p class="sc-hit" role="status">${escapeHtml(smokeReason(status, stop.seasonId, now)!)}</p>` : ""}
     ${message ? `<p class="sc-message" role="status">${escapeHtml(message)}</p>` : ""}
     <div class="sc-hand">${hand.map(cardHtml).join("")}</div>
   </section>`;
