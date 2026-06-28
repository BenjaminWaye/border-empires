import { fullDefensibilityExposureForTiles, idealExposureForTiles, integrityEconomyMult, integrityGrowthMult } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { exposedSidesForTile, isOwnedSettledLandTile } from "../client-defensibility-tile.js";

type DefensibilityBreakdown = {
  settledTiles: number;
  exposedEdges: number;
  internalEdges: number;
  naturalShieldEdges: number;
  borderEdges: number;
  tips: string[];
};

type DefensibilityArgs = {
  tiles: Map<string, Tile>;
  me: string;
  defensibilityPct: number;
  settledT: number;
  settledE: number;
  showWeakDefensibility: boolean;
  empireIntegrityEnabled: boolean;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
};

const settledOwnedTiles = (args: Pick<DefensibilityArgs, "tiles" | "me">): Tile[] =>
  [...args.tiles.values()].filter((tile) => isOwnedSettledLandTile(tile, args.me));

const settledTileExposureEntries = (args: Pick<DefensibilityArgs, "tiles" | "me" | "keyFor" | "wrapX" | "wrapY" | "terrainAt">) =>
  settledOwnedTiles(args).map((tile) => ({ tile, exposedSides: exposedSidesForTile(tile, args) }));

const weakDefensibilityTiles = (args: Pick<DefensibilityArgs, "tiles" | "me" | "keyFor" | "wrapX" | "wrapY" | "terrainAt">) =>
  settledTileExposureEntries(args).filter((entry) => entry.exposedSides.length >= 2);

const formatDefenseNumber = (value: number): string => (Number.isInteger(value) ? `${value}` : value.toFixed(1));

const defensibilityBreakdown = (args: Pick<DefensibilityArgs, "tiles" | "me" | "keyFor" | "wrapX" | "wrapY" | "terrainAt">): DefensibilityBreakdown => {
  const tileExposureEntries = settledTileExposureEntries(args);
  const tiles = tileExposureEntries.map((entry) => entry.tile);
  let exposedEdges = 0;
  let internalEdges = 0;
  let naturalShieldEdges = 0;
  for (const tile of tiles) {
    const neighbors = [
      { x: args.wrapX(tile.x), y: args.wrapY(tile.y - 1) },
      { x: args.wrapX(tile.x + 1), y: args.wrapY(tile.y) },
      { x: args.wrapX(tile.x), y: args.wrapY(tile.y + 1) },
      { x: args.wrapX(tile.x - 1), y: args.wrapY(tile.y) }
    ];
    for (const neighbor of neighbors) {
      const neighborTile = args.tiles.get(args.keyFor(neighbor.x, neighbor.y));
      if (isOwnedSettledLandTile(neighborTile, args.me)) {
        internalEdges += 1;
        continue;
      }
      const terrain = args.terrainAt(neighbor.x, neighbor.y);
      if (terrain === "SEA" || terrain === "COASTAL_SEA" || terrain === "MOUNTAIN") {
        naturalShieldEdges += 1;
        continue;
      }
      exposedEdges += 1;
    }
  }
  const borderEdges = naturalShieldEdges + exposedEdges;
  const tips: string[] = [];
  if (exposedEdges > naturalShieldEdges) tips.push("Build next to water or mountains. They work like walls that enemies can't walk through.");
  if (tiles.length > 0 && exposedEdges / tiles.length > 1.6) tips.push("Your land is too long and thin. Fill the gaps so your shape looks like a fat blob, not a snake.");
  if (internalEdges < borderEdges * 1.4) tips.push("Fat blobs are safer than long lines. Connect your scattered tiles into one big chunk.");
  if (tips.length === 0) tips.push("Nice shape! Keep growing in fat chunks and keep your water and mountain walls.");
  return {
    settledTiles: tiles.length,
    exposedEdges,
    internalEdges,
    naturalShieldEdges,
    borderEdges,
    tips
  };
};

export const renderDefensibilityPanelHtml = (args: DefensibilityArgs): string => {
  const sharedArgs = {
    tiles: args.tiles,
    me: args.me,
    keyFor: args.keyFor,
    wrapX: args.wrapX,
    wrapY: args.wrapY,
    terrainAt: args.terrainAt
  };
  const summary = defensibilityBreakdown(sharedArgs);
  const rounded = Math.round(args.defensibilityPct);
  const weakCount = weakDefensibilityTiles(sharedArgs).length;
  const authoritativeSettledTiles = Math.max(0, Number.isFinite(args.settledT) ? args.settledT : 0);
  const authoritativeWeightedExposure = Math.max(0, Number.isFinite(args.settledE) ? args.settledE : 0);
  const compactFrontierTarget = authoritativeSettledTiles > 0 ? idealExposureForTiles(authoritativeSettledTiles) : 0;
  const fullScoreCutoff = authoritativeSettledTiles > 0 ? fullDefensibilityExposureForTiles(authoritativeSettledTiles) : 0;
  const weightedExposureClass = authoritativeWeightedExposure <= fullScoreCutoff ? "is-positive" : "is-negative";
  const goodShape = rounded >= 100;
  const shapeClause = goodShape
    ? "Great shape! Your kingdom is squished into a tight blob, so very few sides face open ground for enemies to attack."
    : "Your kingdom has too many sides facing open ground where enemies can attack. Try to grow into one fat blob instead of long thin shapes.";
  const economicClause = args.empireIntegrityEnabled
    ? (goodShape ? " You're earning the full income and growth bonus." : " Your income and growth bonus scales with this score.")
    : "";
  const scoreCopy = shapeClause + economicClause;
  return `<div class="defense-panel">
    <article class="card defense-hero-card">
      <div class="defense-hero-head">
        <div>
          <div class="defense-kicker">Empire Integrity</div>
          <strong>${rounded}%</strong>
        </div>
      </div>
      <p class="defense-copy">${scoreCopy}</p>
      <button class="panel-btn defense-toggle-btn" type="button" data-toggle-weak-def="true">${args.showWeakDefensibility ? "Hide weak tiles" : "Show weak tiles"}${weakCount > 0 ? ` (${weakCount})` : ""}</button>
    </article>
    <article class="card defense-breakdown-card">
      <strong>What is an "open side"?</strong>
      <p class="defense-copy">Every land tile you own has 4 sides. A side is <em>open</em> if it touches enemy land or empty land — that's where enemies can walk in. Water and mountains block enemies, so those sides do <em>not</em> count as open. <strong>Fewer open sides = harder to invade = higher score.</strong></p>
    </article>
    <article class="card defense-breakdown-card">
      <div class="defense-stat-grid">
        <div class="defense-stat"><span>Tiles you own</span><strong>${summary.settledTiles}</strong></div>
        <div class="defense-stat"><span>Open sides</span><strong>${summary.exposedEdges}</strong></div>
        <div class="defense-stat"><span>Walls (water + mountain)</span><strong>${summary.naturalShieldEdges}</strong></div>
        <div class="defense-stat"><span>Tile-to-tile borders</span><strong>${Math.round(summary.internalEdges / 2)}</strong></div>
      </div>
    </article>
    <article class="card defense-breakdown-card">
      <strong>Where does the % come from?</strong>
      <p class="defense-copy">The game compares your open-side count to the smallest amount any kingdom your size could possibly have (a perfect blob). The closer you are to that, the higher your score. Tiles with 3 or 4 open sides hurt extra because they're really hard to defend.</p>
      <div class="defense-line"><span>A perfect blob your size would have</span><strong>${formatDefenseNumber(compactFrontierTarget)}</strong></div>
      <div class="defense-line"><span>You score 100% if you stay at or below</span><strong>${formatDefenseNumber(fullScoreCutoff)}</strong></div>
      <div class="defense-line"><span>You actually have</span><strong class="${weightedExposureClass}">${formatDefenseNumber(authoritativeWeightedExposure)}</strong></div>
    </article>
    <article class="card defense-breakdown-card">
      <strong>How to make it better</strong>
      ${summary.tips.map((tip) => `<div class="defense-tip">${tip}</div>`).join("")}
    </article>
    ${args.empireIntegrityEnabled ? (() => {
      const t = Math.max(0, Math.min(1, args.defensibilityPct / 100));
      const econMult = integrityEconomyMult(t);
      const growthMult = integrityGrowthMult(t);
      const econPct = Math.round((econMult - 1) * 100);
      const growthPct = Math.round((growthMult - 1) * 100);
      const sign = (n: number) => (n >= 0 ? `+${n}%` : `${n}%`);
      const cls = (n: number) => (n >= 0 ? "is-positive" : "is-negative");
      const maxEconPct = Math.round((integrityEconomyMult(1) - 1) * 100);
      const minEconPct = Math.round((integrityEconomyMult(0) - 1) * 100);
      const maxGrowthPct = Math.round((integrityGrowthMult(1) - 1) * 100);
      const minGrowthPct = Math.round((integrityGrowthMult(0) - 1) * 100);
      return `<article class="card defense-breakdown-card">
        <strong>Income &amp; growth effect</strong>
        <p class="defense-copy">Compact empires earn a bonus; sprawling empires take a penalty. At 100% that's ${sign(maxEconPct)} income and ${sign(maxGrowthPct)} growth — at 0% it flips to ${sign(minEconPct)} and ${sign(minGrowthPct)}.</p>
        <div class="defense-stat-grid">
          <div class="defense-stat"><span>Income effect</span><strong class="${cls(econPct)}">${sign(econPct)}</strong></div>
          <div class="defense-stat"><span>Growth effect</span><strong class="${cls(growthPct)}">${sign(growthPct)}</strong></div>
        </div>
      </article>`;
    })() : ""}
  </div>`;
};
