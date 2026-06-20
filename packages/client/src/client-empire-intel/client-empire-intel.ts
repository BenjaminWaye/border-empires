import type { RevealEmpireStatsView } from "../client-types.js";

const formatInt = (value: number): string => Math.round(value).toLocaleString();
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);

const statCardHtml = (label: string, value: string, detail?: string): string => `
  <div class="intel-stat-card">
    <div class="intel-stat-label">${escapeHtml(label)}</div>
    <div class="intel-stat-value">${escapeHtml(value)}</div>
    ${detail ? `<div class="intel-stat-detail">${escapeHtml(detail)}</div>` : ""}
  </div>`;

export const revealEmpireStatsSummaryLines = (stats: RevealEmpireStatsView | undefined): string[] => {
  if (!stats) return [];
  return [
    `Intel: ${stats.playerName}`,
    `Economy ${stats.incomePerMinute.toFixed(1)}/m • Gold ${formatInt(stats.gold)}`,
    `Territory ${formatInt(stats.tiles)} total • ${formatInt(stats.settledTiles)} settled • ${formatInt(stats.frontierTiles)} frontier`,
    `Towns ${formatInt(stats.controlledTowns)} • Tech ${formatInt(stats.techCount)}`,
    `Manpower ${formatInt(stats.manpower)}/${formatInt(stats.manpowerCap)}`,
    `Stockpiles F ${formatInt(stats.strategicResources.FOOD)} I ${formatInt(stats.strategicResources.IRON)} C ${formatInt(stats.strategicResources.CRYSTAL)} S ${formatInt(stats.strategicResources.SUPPLY)} Sh ${formatInt(stats.strategicResources.SHARD)}`
  ];
};

export const revealEmpireStatsFeedText = (stats: RevealEmpireStatsView): string =>
  `${stats.playerName}: ${stats.incomePerMinute.toFixed(1)}/m, ${formatInt(stats.tiles)} tiles, ${formatInt(stats.controlledTowns)} towns, ${formatInt(stats.gold)} gold.`;

export const revealEmpireStatsDossierHtml = (stats: RevealEmpireStatsView): string => {
  const stockpile = stats.strategicResources;
  return `
    <div class="intel-backdrop" data-intel-close></div>
    <section class="intel-modal card" role="dialog" aria-modal="true" aria-labelledby="intel-title">
      <div class="intel-hero">
        <div class="intel-hero-copy">
          <div class="intel-kicker">Observatory dossier • One-shot empire intel</div>
          <h2 id="intel-title" class="intel-title">${escapeHtml(stats.playerName)}</h2>
          <p class="intel-summary">Surveyors decoded a snapshot of this empire's economy, territory, manpower, and strategic reserves.</p>
        </div>
        <div class="intel-hero-sigil" aria-hidden="true">◈</div>
      </div>
      <div class="intel-stat-grid">
        ${statCardHtml("Economy", `${stats.incomePerMinute.toFixed(1)}/m`, `${formatInt(stats.gold)} gold held`)}
        ${statCardHtml("Territory", formatInt(stats.tiles), `${formatInt(stats.settledTiles)} settled • ${formatInt(stats.frontierTiles)} frontier`)}
        ${statCardHtml("Towns", formatInt(stats.controlledTowns), `${formatInt(stats.techCount)} techs known`)}
        ${statCardHtml("Manpower", `${formatInt(stats.manpower)}/${formatInt(stats.manpowerCap)}`)}
      </div>
      <div class="intel-stockpile">
        <div class="intel-section-label">Strategic stockpiles</div>
        <div class="intel-stockpile-grid">
          ${statCardHtml("Food", formatInt(stockpile.FOOD))}
          ${statCardHtml("Iron", formatInt(stockpile.IRON))}
          ${statCardHtml("Crystal", formatInt(stockpile.CRYSTAL))}
          ${statCardHtml("Supply", formatInt(stockpile.SUPPLY))}
          ${statCardHtml("Shard", formatInt(stockpile.SHARD))}
        </div>
      </div>
      <div class="intel-actions">
        <button class="panel-btn intel-primary-btn" type="button" data-intel-close>OK</button>
      </div>
    </section>`;
};
