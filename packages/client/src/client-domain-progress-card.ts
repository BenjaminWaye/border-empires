import type { ClientShardRainAlert } from "./client-shard-alert/client-shard-alert.js";
import { formatShardRainCountdown } from "./client-shard-alert/client-shard-alert.js";
import { currentDomainChoiceTier } from "./client-tech-html/client-tech-html.js";
import type { DomainInfo } from "./client-types.js";

export const visibleShardCacheCount = (tiles: Iterable<{ fogged?: boolean; shardSite?: { kind: string } | null }>): number =>
  [...tiles].filter((tile) => !tile.fogged && tile.shardSite?.kind === "CACHE").length;

export const renderDomainProgressCardHtml = (args: {
  visibleShardCacheCount: number;
  shardStock: number;
  currentTier: number | undefined;
  chosenDomainCount: number;
  shardAlert: ClientShardRainAlert | undefined;
  nowMs: number;
}): string => {
  const { visibleShardCacheCount, shardStock, currentTier, chosenDomainCount, shardAlert, nowMs } = args;
  const statusLine =
    currentTier !== undefined
      ? `Tier ${currentTier} is open for your next doctrine shift. Explore for shard caches to build toward your next doctrine pick.`
      : "All open domain tiers are currently committed. Keep hunting shards to afford the next doctrine window.";
  const scoutingLine =
    visibleShardCacheCount > 0 ? `${visibleShardCacheCount} shard cache${visibleShardCacheCount === 1 ? "" : "s"} visible in explored territory.` : "";
  const rainLine = formatShardRainCountdown(shardAlert, nowMs);
  const noteLine = [rainLine, scoutingLine].filter(Boolean).join(" · ");
  return `<article class="card domain-progress-card">
    <div class="domain-progress-head">
      <div>
        <div class="domain-summary-kicker">Shard Network</div>
        <strong>Shards fuel your doctrine path</strong>
      </div>
      <span class="domain-progress-badge">${currentTier !== undefined ? `Tier ${currentTier} live` : `${chosenDomainCount} chosen`}</span>
    </div>
    <p>${statusLine}</p>
    <div class="domain-progress-metrics">
      <div class="domain-progress-metric">
        <span>Shard stock</span>
        <strong>${shardStock.toFixed(1)}</strong>
      </div>
    </div>
    ${noteLine ? `<p class="domain-progress-note">${noteLine}</p>` : ""}
  </article>`;
};

export const renderDomainProgressCard = (deps: {
  tiles: Iterable<{ fogged?: boolean; shardSite?: { kind: string } | null }>;
  shardStock: number;
  domainCatalog: DomainInfo[];
  domainChoices: string[];
  domainIds: string[];
  shardAlert: ClientShardRainAlert | undefined;
  nowMs: number;
}): string =>
  renderDomainProgressCardHtml({
    visibleShardCacheCount: visibleShardCacheCount(deps.tiles),
    shardStock: deps.shardStock,
    currentTier: currentDomainChoiceTier(deps.domainCatalog, deps.domainChoices),
    chosenDomainCount: deps.domainIds.length,
    shardAlert: deps.shardAlert,
    nowMs: deps.nowMs
  });
