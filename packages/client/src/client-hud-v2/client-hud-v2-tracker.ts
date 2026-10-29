// Left-hand tracker for the new HUD: your development slots (and what fills them), what needs a
// decision, your muster flags, and everything on a timer. Rows carry tile coordinates; clicking one centres
// the map there (wired by the controller).

import { musterStatusText, type ManpowerPanelMusterFlag } from "../client-side-panel-html/client-side-panel-html.js";
import type { DevelopmentSlotOccupant } from "../client-development-panel/client-development-html.js";

export type TrackerNeed = { kind: "afc" | "flag"; title: string; sub: string; x?: number; y?: number };

export type TrackerInput = {
  /** Development slots in use (builds, garrisons) out of the limit. */
  buildSlots: { busy: number; limit: number };
  afcReady: number;
  flags: ManpowerPanelMusterFlag[];
  flagCap: number;
  building: DevelopmentSlotOccupant[];
  /** Settles and builds waiting for a free slot, in order. */
  queue: Array<{ label: string; x: number; y: number }>;
  /** The Dev slots section is expanded in place (the player can fold it away). */
  slotsOpen: boolean;
  /** battle: an attack (opens the battle screen); otherwise a frontier expansion still landing. */
  capture?: { x: number; y: number; resolvesAt: number; battle: boolean } | undefined;
  nowMs: number;
};

/** An attack (opens the battle screen) rather than a frontier expansion still landing. */
export const captureIsBattle = (capture: { actionType?: "EXPAND" | "ATTACK"; combatSnapshot?: unknown }): boolean =>
  capture.actionType === "ATTACK" || Boolean(capture.combatSnapshot);

/** Caps each group so a busy empire never pushes the tracker off screen. */
export const TRACKER_GROUP_CAP = 4;

const MODE_LABEL: Record<ManpowerPanelMusterFlag["mode"], string> = { HOLD: "Hold", ADVANCE: "Advance", MARCH: "March" };

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const formatRemaining = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

export const trackerNeeds = (input: TrackerInput): TrackerNeed[] => {
  const needs: TrackerNeed[] = [];
  if (input.afcReady > 0) needs.push({ kind: "afc", title: "AFC upgrade ready", sub: "" });
  for (const flag of input.flags) {
    if (!flag.insufficientManpower && !flag.noTargetInRange && !flag.unfundableTarget) continue;
    const sub = flag.insufficientManpower ? "Needs manpower" : flag.unfundableTarget ? "Target too costly" : "No target in range";
    needs.push({ kind: "flag", title: `Flag (${flag.x}, ${flag.y}) stalled`, sub, x: flag.x, y: flag.y });
  }
  return needs;
};

const focusAttrs = (x?: number, y?: number): string =>
  x === undefined || y === undefined ? "" : ` data-hud-v2-focus-x="${x}" data-hud-v2-focus-y="${y}"`;

/** Always-visible slot pips: filled for busy, open for free; free slots are called out since they are idle capacity. The row folds the slot list open and closed. */
export const buildSlotsHtml = (slots: TrackerInput["buildSlots"], open: boolean): string => {
  const limit = Math.max(0, slots.limit);
  const busy = Math.min(limit, Math.max(0, slots.busy));
  const free = limit - busy;
  const pips = Array.from({ length: limit }, (_, i) => `<span class="hud-v2-slot-pip${i < busy ? " hud-v2-slot-busy" : ""}"></span>`).join("");
  return `<button type="button" class="hud-v2-slots${free > 0 ? " hud-v2-slots-free" : ""}" data-hud-v2-slots-toggle aria-expanded="${open}" aria-label="Development slots ${busy} of ${limit} in use"><span class="hud-v2-slots-label">Dev slots</span><span class="hud-v2-slot-pips" aria-hidden="true">${pips}</span><span class="hud-v2-slots-count">${busy}/${limit}${free > 0 ? ` · ${free} free` : ""}</span><span class="hud-v2-slots-fold" aria-hidden="true">${open ? "▾" : "▸"}</span></button>`;
};

/** Folds the Dev slots list on a click of its row. The caller repaints the tracker at once: its own refresh runs only once a second. */
export const handleSlotsToggle = (target: Element, fold: { open: boolean }, repaint: () => void): boolean => {
  if (!target.closest("[data-hud-v2-slots-toggle]")) return false;
  fold.open = !fold.open;
  repaint();
  return true;
};

/** What fills each slot (with its progress) and what waits for one, right under the pips. */
export const slotListHtml = (input: Pick<TrackerInput, "building" | "queue">): string => {
  const busy = input.building.map((b) => {
    const pct = b.totalMs > 0 ? Math.min(100, Math.max(0, Math.round((1 - b.remainingMs / b.totalMs) * 100))) : 0;
    return `<button type="button" class="hud-v2-tracker-row hud-v2-slot-row"${focusAttrs(b.x, b.y)}><span class="hud-v2-tracker-title">${esc(b.label)} <span class="hud-v2-tracker-at">(${b.x}, ${b.y})</span><span class="hud-v2-tracker-time">${formatRemaining(b.remainingMs)}</span></span><span class="hud-v2-tracker-bar"><span style="width:${pct}%"></span></span></button>`;
  });
  const waiting = input.queue.slice(0, TRACKER_GROUP_CAP).map((q, i) =>
    `<button type="button" class="hud-v2-tracker-row hud-v2-slot-row hud-v2-slot-waiting"${focusAttrs(q.x, q.y)}><span class="hud-v2-tracker-title">${i === 0 ? "Next" : `#${i + 1}`} · ${esc(q.label)} <span class="hud-v2-tracker-at">(${q.x}, ${q.y})</span></span></button>`);
  const more = input.queue.length - TRACKER_GROUP_CAP;
  return `<div class="hud-v2-slot-list">${busy.join("")}${waiting.join("")}${more > 0 ? `<div class="hud-v2-tracker-more">+${more} waiting</div>` : ""}</div>`;
};

const capped = <T>(items: T[], render: (item: T) => string): string => {
  const shown = items.slice(0, TRACKER_GROUP_CAP).map(render).join("");
  const rest = items.length - TRACKER_GROUP_CAP;
  return rest > 0 ? `${shown}<div class="hud-v2-tracker-more">+${rest} more</div>` : shown;
};

export const trackerHtml = (input: TrackerInput): string => {
  const needs = trackerNeeds(input);
  const parts: string[] = [];
  // Needs you leads, so an unfolded slot list can never push it below the tracker's scroll fold.
  if (needs.length > 0) {
    parts.push(`<div class="hud-v2-tracker-head hud-v2-tracker-head-needs"><span>Needs you · ${needs.length}</span></div>`);
    parts.push(capped(needs, (n) => {
      const open = n.kind === "afc" ? ` data-hud-v2-open="afc"` : "";
      return `<button type="button" class="hud-v2-tracker-row hud-v2-need-${n.kind}"${focusAttrs(n.x, n.y)}${open}><span class="hud-v2-tracker-title">${esc(n.title)}</span>${n.sub ? `<span class="hud-v2-tracker-sub">${esc(n.sub)}</span>` : ""}</button>`;
    }));
  }
  parts.push(buildSlotsHtml(input.buildSlots, input.slotsOpen));
  if (input.slotsOpen && (input.building.length > 0 || input.queue.length > 0)) parts.push(slotListHtml(input));
  if (input.flags.length > 0) {
    parts.push(`<div class="hud-v2-tracker-head"><span>Flags · ${input.flags.length}</span></div>`);
    parts.push(capped(input.flags, (f) => {
      const pct = input.flagCap > 0 ? Math.min(100, Math.round((f.amount / input.flagCap) * 100)) : 0;
      return `<button type="button" class="hud-v2-tracker-row"${focusAttrs(f.x, f.y)}><span class="hud-v2-tracker-title">⚑ (${f.x}, ${f.y}) · <b>${MODE_LABEL[f.mode]}</b><span class="hud-v2-tracker-amt">${Math.round(f.amount)} / ${Math.round(input.flagCap)}</span></span><span class="hud-v2-tracker-bar"><span style="width:${pct}%"></span></span><span class="hud-v2-tracker-sub">${esc(musterStatusText(f, input.nowMs))}</span></button>`;
    }));
  }
  // Builds and garrisons are listed under Dev slots; this group is the attack or expansion still landing.
  const timed: Array<{ label: string; ms: number; x: number; y: number; open?: string }> = [];
  if (input.capture) {
    const c = input.capture;
    timed.unshift({ label: `${c.battle ? "Battle at" : "Expanding to"} (${c.x}, ${c.y})`, ms: c.resolvesAt - input.nowMs, x: c.x, y: c.y, ...(c.battle ? { open: "battle" } : {}) });
  }
  if (timed.length > 0) {
    parts.push(`<div class="hud-v2-tracker-head"><span>In progress</span></div>`);
    parts.push(capped(timed, (t) => `<button type="button" class="hud-v2-tracker-row hud-v2-tracker-timed"${t.open ? ` data-hud-v2-open="${t.open}"` : focusAttrs(t.x, t.y)}><span class="hud-v2-tracker-title">${esc(t.label)}</span><span class="hud-v2-tracker-time">${formatRemaining(t.ms)}</span></button>`));
  }
  return parts.join("");
};
