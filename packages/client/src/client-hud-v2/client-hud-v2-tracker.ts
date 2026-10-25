// Left-hand tracker for the new HUD: what needs a decision, your muster flags,
// and everything on a timer. Rows carry tile coordinates; clicking one centres
// the map there (wired by the controller).

import { musterStatusText, type ManpowerPanelMusterFlag } from "../client-side-panel-html/client-side-panel-html.js";
import type { DevelopmentSlotOccupant } from "../client-development-panel/client-development-html.js";

export type TrackerNeed = { kind: "build_slot" | "afc" | "flag"; title: string; sub: string; x?: number; y?: number };

export type TrackerInput = {
  freeBuildSlots: number;
  afcReady: number;
  flags: ManpowerPanelMusterFlag[];
  flagCap: number;
  building: DevelopmentSlotOccupant[];
  capture?: { x: number; y: number; resolvesAt: number } | undefined;
  nowMs: number;
};

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
  if (input.freeBuildSlots > 0) {
    needs.push({ kind: "build_slot", title: input.freeBuildSlots === 1 ? "Free build slot" : `${input.freeBuildSlots} free build slots`, sub: "" });
  }
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

const capped = <T>(items: T[], render: (item: T) => string): string => {
  const shown = items.slice(0, TRACKER_GROUP_CAP).map(render).join("");
  const rest = items.length - TRACKER_GROUP_CAP;
  return rest > 0 ? `${shown}<div class="hud-v2-tracker-more">+${rest} more</div>` : shown;
};

export const trackerHtml = (input: TrackerInput): string => {
  const needs = trackerNeeds(input);
  const parts: string[] = [];
  if (needs.length > 0) {
    parts.push(`<div class="hud-v2-tracker-head hud-v2-tracker-head-needs"><span>Needs you · ${needs.length}</span></div>`);
    parts.push(capped(needs, (n) => {
      const open = n.kind === "afc" ? ` data-hud-v2-open="domains"` : "";
      return `<button type="button" class="hud-v2-tracker-row hud-v2-need-${n.kind}"${focusAttrs(n.x, n.y)}${open}><span class="hud-v2-tracker-title">${esc(n.title)}</span>${n.sub ? `<span class="hud-v2-tracker-sub">${esc(n.sub)}</span>` : ""}</button>`;
    }));
  }
  if (input.flags.length > 0) {
    parts.push(`<div class="hud-v2-tracker-head"><span>Flags · ${input.flags.length}</span></div>`);
    parts.push(capped(input.flags, (f) => {
      const pct = input.flagCap > 0 ? Math.min(100, Math.round((f.amount / input.flagCap) * 100)) : 0;
      return `<button type="button" class="hud-v2-tracker-row"${focusAttrs(f.x, f.y)}><span class="hud-v2-tracker-title">⚑ (${f.x}, ${f.y}) · <b>${MODE_LABEL[f.mode]}</b><span class="hud-v2-tracker-amt">${Math.round(f.amount)} / ${Math.round(input.flagCap)}</span></span><span class="hud-v2-tracker-bar"><span style="width:${pct}%"></span></span><span class="hud-v2-tracker-sub">${esc(musterStatusText(f, input.nowMs))}</span></button>`;
    }));
  }
  const timed: Array<{ label: string; ms: number; x: number; y: number }> = input.building.map((b) => ({ label: b.label, ms: b.remainingMs, x: b.x, y: b.y }));
  if (input.capture) timed.unshift({ label: `Battle at (${input.capture.x}, ${input.capture.y})`, ms: input.capture.resolvesAt - input.nowMs, x: input.capture.x, y: input.capture.y });
  if (timed.length > 0) {
    parts.push(`<div class="hud-v2-tracker-head"><span>In progress</span></div>`);
    parts.push(capped(timed, (t) => `<button type="button" class="hud-v2-tracker-row hud-v2-tracker-timed"${focusAttrs(t.x, t.y)}><span class="hud-v2-tracker-title">${esc(t.label)}</span><span class="hud-v2-tracker-time">${formatRemaining(t.ms)}</span></button>`));
  }
  return parts.join("");
};
