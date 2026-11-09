// Score-over-time line chart for the season-ended screen's "Score Graph" tab
// (see client-season-end-overlay.ts). Hand-rolled inline SVG -- there is no
// charting library anywhere in the repo, and this is a single simple line
// chart, so no new dependency is warranted.
import type { ScoreHistorySeriesView } from "./client-types.js";
import { escapeHtml, missingHistoryNotice } from "./client-season-end-overlay/client-season-end-html.js";
import { playerBadge, safeColorValue } from "./client-season-end-overlay.js";

const CHART_WIDTH = 640;
const CHART_HEIGHT = 260;
const PAD_LEFT = 44;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

const FALLBACK_PALETTE = ["#e0b04a", "#6fb3d1", "#c76b6b", "#8fbf6f", "#b98fd1", "#d19a6f"];

const seriesColor = (
  series: ScoreHistorySeriesView,
  colors: ReadonlyMap<string, string>,
  index: number
): string => safeColorValue(colors.get(series.playerId)) ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]!;

/** Use a score list when the saved samples are too sparse to draw a line. */
export const scoreGraphPanel = (
  scoreHistory: ScoreHistorySeriesView[],
  colors: ReadonlyMap<string, string>,
  selfId: string | undefined,
  winnerId: string | undefined
): string => {
  const series = scoreHistory.filter((s) => s.points.length > 0);
  if (series.length === 0) {
    return `<section class="se-panel se-graph">
      <h3 class="se-panel-title">Score Over Time</h3>
      ${missingHistoryNotice("timeline", "Score timeline", "No score timeline was saved for this Sector Contest.")}
    </section>`;
  }
  if (series.every((s) => s.points.length === 1)) {
    const scores = series.map((s) => `
      <div>
        <dt>${playerBadge(s.playerId, s.playerId === selfId ? "You" : s.playerName, colors)}</dt>
        <dd>${s.points[0]!.score.toLocaleString()}</dd>
      </div>`).join("");
    return `<section class="se-panel se-graph">
      <h3 class="se-panel-title">Score Over Time</h3>
      ${missingHistoryNotice("timeline", "Score timeline", "Only one score sample per empire was saved. A trend needs at least two.")}
      <h4 class="se-saved-scores-title">Saved scores</h4>
      <dl class="se-saved-scores">${scores}</dl>
    </section>`;
  }

  let minT = Infinity, maxT = -Infinity, maxScore = 0;
  for (const s of series) {
    for (const p of s.points) {
      if (p.t < minT) minT = p.t;
      if (p.t > maxT) maxT = p.t;
      if (p.score > maxScore) maxScore = p.score;
    }
  }
  const spanT = Math.max(1, maxT - minT);
  const spanScore = Math.max(1, maxScore);
  const innerW = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const xFor = (t: number): number => PAD_LEFT + ((t - minT) / spanT) * innerW;
  const yFor = (score: number): number => PAD_TOP + innerH - (score / spanScore) * innerH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((frac) => {
      const y = PAD_TOP + innerH * (1 - frac);
      const label = Math.round(spanScore * frac);
      return `<line class="se-graph-grid" x1="${PAD_LEFT}" y1="${y}" x2="${CHART_WIDTH - PAD_RIGHT}" y2="${y}" />
        <text class="se-graph-axis" x="${PAD_LEFT - 6}" y="${y}" text-anchor="end" dominant-baseline="middle">${label}</text>`;
    })
    .join("");

  const marks = series
    .map((s, index) => {
      const color = seriesColor(s, colors, index);
      const isSelf = Boolean(selfId && s.playerId === selfId);
      const isWinner = Boolean(winnerId && s.playerId === winnerId);
      if (s.points.length === 1) {
        const point = s.points[0]!;
        return `<circle cx="${xFor(point.t)}" cy="${yFor(point.score)}" r="${isSelf || isWinner ? 4 : 3}" fill="${color}">
          <title>${escapeHtml(s.playerName)} · ${point.score.toLocaleString()}</title>
        </circle>`;
      }
      const points = s.points.map((p) => `${xFor(p.t).toFixed(1)},${yFor(p.score).toFixed(1)}`).join(" ");
      return `<polyline class="se-graph-line${isWinner ? " is-winner" : ""}${isSelf ? " is-self" : ""}" points="${points}" style="--series-color:${color}" fill="none" stroke="${color}" stroke-width="${isSelf || isWinner ? 3 : 2}" />`;
    })
    .join("");

  const legend = series
    .map((s, index) => {
      const color = seriesColor(s, colors, index);
      const isSelf = Boolean(selfId && s.playerId === selfId);
      return `<span class="se-graph-legend-item"><span class="se-graph-legend-dot" style="--series-color:${color}" aria-hidden="true"></span>${playerBadge(s.playerId, isSelf ? "You" : s.playerName, colors)}</span>`;
    })
    .join("");

  return `
    <section class="se-panel se-graph">
      <h3 class="se-panel-title">Score Over Time</h3>
      <svg class="se-graph-svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="${escapeHtml("Each player's score over the course of the Sector Contest")}">
        ${gridLines}
        ${marks}
      </svg>
      <div class="se-graph-legend">${legend}</div>
    </section>`;
};
