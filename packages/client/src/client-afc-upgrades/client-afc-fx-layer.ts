// Screen-space AFC effects drawn over either map renderer. Every point goes
// through the active renderer's own projection (the true-3D camera, or the 2D
// grid with its tile-centre offset), so the 2D accessibility fallback and the
// 3D map show the same thing in the same place, including wrapped copies.
//
// - Resonance Hijack: a pulsing beam from the casting tower to the target and
//   a ring that fills as the 10-minute takeover runs; a white flash and
//   shockwave when it lands, or a snapping red beam when it is broken.
// - Breakthrough Protocol: a breach line from the won tile to each tile that
//   surrendered, with a shockwave ring on each.
// - Counterphase: a crackling ring on every visible suppressed tower.
import { AFC_SPECIALIZATION_BALANCE } from "@border-empires/shared";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import type { ClientState } from "../client-state/client-state.js";
import { AFC_MAP_EFFECT_TTL_MS } from "./client-afc-state.js";

const SVG_NS = "http://www.w3.org/2000/svg";
export interface AfcFxProjection { size: number; project: (x: number, y: number) => { sx: number; sy: number } }
export interface AfcFxTower { wx: number; wy: number; suppressed: boolean }
type FxState = Pick<ClientState, "me" | "afcHijacks" | "afcHijackOutcomes" | "afcBreakthroughs">;

const formatClock = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** Creates the layer; `render` redraws it each frame (bounded by the state lists' own caps). */
export function createAfcFxLayer(canvas: HTMLCanvasElement, state: FxState): { render: (projection: AfcFxProjection, towers: readonly AfcFxTower[], now?: number, hidden?: boolean) => void } {
  const doc = canvas.ownerDocument;
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "afc-fx-layer");
  svg.setAttribute("aria-hidden", "true");
  canvas.parentElement?.append(svg);
  const el = (name: string, attrs: Record<string, string | number>, text?: string): SVGElement => {
    const node = doc.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    svg.append(node);
    return node;
  };
  return {
    render({ size, project }, towers, now = Date.now(), hidden = false) {
      svg.replaceChildren();
      if (hidden) return;
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width / Math.max(1, canvas.width), scaleY = bounds.height / Math.max(1, canvas.height);
      const at = (x: number, y: number): { x: number; y: number } => {
        const point = project(x, y);
        const offset = isTrue3DRendererActive() ? 0 : size / 2;
        return { x: (point.sx + offset) * scaleX, y: (point.sy + offset) * scaleY };
      };
      const radius = Math.max(10, size * 0.6 * scaleX);
      for (const hijack of state.afcHijacks) {
        const from = at(hijack.casterX, hijack.casterY), to = at(hijack.targetX, hijack.targetY);
        const progress = Math.min(1, Math.max(0, (now - hijack.startedAt) / AFC_SPECIALIZATION_BALANCE.hijackTakeoverMs));
        const mine = hijack.attackerId === state.me;
        el("line", { class: `afc-fx-hijack-beam${mine ? " is-mine" : ""}`, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
        const circumference = 2 * Math.PI * radius;
        el("circle", { class: "afc-fx-hijack-track", cx: to.x, cy: to.y, r: radius });
        el("circle", { class: `afc-fx-hijack-progress${mine ? " is-mine" : ""}`, cx: to.x, cy: to.y, r: radius, "stroke-dasharray": `${circumference * progress} ${circumference}`, transform: `rotate(-90 ${to.x} ${to.y})` });
        el("text", { class: "afc-fx-label", x: to.x, y: to.y - radius - 6 }, `${mine ? "Taking over" : "Hijack!"} ${formatClock(hijack.endsAt - now)}`);
        if (!mine) el("text", { class: "afc-fx-label is-alert", x: from.x, y: from.y - radius - 6 }, "Hijacking tower");
      }
      for (const outcome of state.afcHijackOutcomes) {
        const age = (now - outcome.at) / AFC_MAP_EFFECT_TTL_MS;
        if (age >= 1) continue;
        const to = at(outcome.targetX, outcome.targetY);
        const won = outcome.status === "succeeded";
        if (won) {
          el("circle", { class: "afc-fx-shockwave", cx: to.x, cy: to.y, r: radius * (1 + age * 3), opacity: 1 - age });
          el("circle", { class: "afc-fx-flash", cx: to.x, cy: to.y, r: radius * 0.8, opacity: Math.max(0, 1 - age * 3) });
        } else if (outcome.casterX !== undefined && outcome.casterY !== undefined) {
          const from = at(outcome.casterX, outcome.casterY);
          const midX = from.x + (to.x - from.x) * (0.5 - age / 2), midY = from.y + (to.y - from.y) * (0.5 - age / 2);
          el("line", { class: "afc-fx-hijack-snap", x1: from.x, y1: from.y, x2: midX, y2: midY, opacity: 1 - age });
        }
        const label = won ? (outcome.attackerId === state.me ? "Tower hijacked" : "Tower lost") : "Hijack broken";
        el("text", { class: `afc-fx-label${won && outcome.attackerId !== state.me ? " is-alert" : ""}`, x: to.x, y: to.y - radius - 6, opacity: 1 - age }, label);
      }
      for (const breakthrough of state.afcBreakthroughs) {
        const age = (now - breakthrough.at) / AFC_MAP_EFFECT_TTL_MS;
        if (age >= 1) continue;
        const from = at(breakthrough.fromX, breakthrough.fromY);
        for (const tile of breakthrough.tiles) {
          const to = at(tile.x, tile.y);
          el("line", { class: "afc-fx-breach", x1: from.x, y1: from.y, x2: to.x, y2: to.y, opacity: 1 - age });
          el("circle", { class: "afc-fx-shockwave is-breach", cx: to.x, cy: to.y, r: radius * (0.6 + age * 2), opacity: 1 - age });
        }
        el("text", { class: "afc-fx-label is-breach", x: from.x, y: from.y - radius - 6, opacity: 1 - age }, "Breakthrough!");
      }
      for (const tower of towers) {
        if (!tower.suppressed) continue;
        const centre = at(tower.wx, tower.wy);
        el("circle", { class: "afc-fx-static", cx: centre.x, cy: centre.y, r: radius * (0.9 + 0.1 * Math.sin(now / 90)) });
      }
    }
  };
}
