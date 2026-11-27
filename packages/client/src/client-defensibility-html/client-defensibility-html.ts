import { formatCoinPerDay, INTEGRITY_MIN_GARRISON_SHARE, INTEGRITY_UNGARRISONED_PENALTY, fullDefensibilityExposureForTiles, idealExposureForTiles, integrityEconomyMult, integrityGrowthMult, integrityParts } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import "./client-defensibility-html.css";
import { exposedSidesForTile, isOwnedLandTile } from "../client-defensibility-tile.js";
import { weakDefensibilityEntries, type WeakDefensibilityEntry } from "../client-defensibility-weak-tiles/client-defensibility-weak-tiles.js";
import { integrityDropCardHtml } from "../client-integrity-drop/client-integrity-drop-card.js";
import type { IntegrityDropNotice } from "../client-integrity-drop/client-integrity-drop-cause.js";
import { scanIntegrityShape, type IntegrityShapeSpot } from "../client-integrity-drop/client-integrity-shape.js";

type DefensibilityBreakdown = {
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
  /** Owned land tiles from the server (PLAYER_UPDATE T); counted from `tiles` until the first update arrives. */
  ownedT?: number;
  showWeakDefensibility: boolean;
  empireIntegrityEnabled: boolean;
  /** The Empire Integrity line of the shared coin breakdown (what accrual actually pays). */
  integrityCoinPerMinute?: number;
  /** The last Integrity drop explained (client-integrity-drop/), shown as "Why it fell" on top. */
  dropNotice?: IntegrityDropNotice;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
};

// Integrity reads all owned land, garrisoned or not (empireIntegrity in packages/shared).
const ownedLandTiles = (args: Pick<DefensibilityArgs, "tiles" | "me">): Tile[] =>
  [...args.tiles.values()].filter((tile) => isOwnedLandTile(tile, args.me));

const ownedTileExposureEntries = (args: Pick<DefensibilityArgs, "tiles" | "me" | "keyFor" | "wrapX" | "wrapY" | "terrainAt">) =>
  ownedLandTiles(args).map((tile) => ({ tile, exposedSides: exposedSidesForTile(tile, args) }));

const WEAK_TILE_LIST_LIMIT = 8;

// Shown under the toggle while weak tiles are highlighted: where each one is
// and why it is weak, with a button that pans the camera to it.
const weakTileListHtml = (entries: readonly WeakDefensibilityEntry[]): string => {
  if (entries.length === 0) return "";
  const rows = entries
    .slice(0, WEAK_TILE_LIST_LIMIT)
    .map(
      (entry) =>
        `<li class="defense-weak-tile is-${entry.severity}"><button class="panel-btn defense-weak-tile-go" type="button" data-weak-def-focus="${entry.x},${entry.y}">(${entry.x}, ${entry.y})</button><span>${entry.reason}</span></li>`
    )
    .join("");
  const more = entries.length > WEAK_TILE_LIST_LIMIT ? `<p class="defense-copy">+${entries.length - WEAK_TILE_LIST_LIMIT} more highlighted on the map.</p>` : "";
  return `<ul class="defense-weak-tile-list">${rows}</ul>${more}`;
};

// Holes (land you don't own walled in by yours) are highlighted with the weak tiles; taking one closes several open sides.
const holeListHtml = (holes: readonly IntegrityShapeSpot[]): string =>
  holes.length === 0
    ? ""
    : `<ul class="defense-weak-tile-list">${holes
        .slice(0, WEAK_TILE_LIST_LIMIT)
        .map((hole) => `<li class="defense-weak-tile is-critical"><button class="panel-btn defense-weak-tile-go" type="button" data-weak-def-focus="${hole.x},${hole.y}">(${hole.x}, ${hole.y})</button><span>Hole · take it</span></li>`)
        .join("")}</ul>`;

const formatDefenseNumber = (value: number): string => (Number.isInteger(value) ? `${value}` : value.toFixed(1));

const defensibilityBreakdown = (args: Pick<DefensibilityArgs, "tiles" | "me" | "keyFor" | "wrapX" | "wrapY" | "terrainAt">): DefensibilityBreakdown => {
  const tileExposureEntries = ownedTileExposureEntries(args);
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
      if (isOwnedLandTile(neighborTile, args.me)) {
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
  if (tiles.length > 0 && tiles.filter((tile) => tile.ownershipState === "SETTLED").length / tiles.length < INTEGRITY_MIN_GARRISON_SHARE) tips.push(`Garrison at least ${Math.round(INTEGRITY_MIN_GARRISON_SHARE * 100)}% of your land to avoid the penalty.`);
  if (tips.length === 0) tips.push("Nice shape! Keep growing in fat chunks and keep your water and mountain walls.");
  return {
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
  const weakEntries = weakDefensibilityEntries(sharedArgs);
  const weakCount = weakEntries.length;
  // Owned land counts from the tiles here (your own land is always known); garrisoned and open sides from the server.
  const ownedTiles = args.ownedT ?? ownedLandTiles(sharedArgs).length;
  const garrisonedTiles = Math.max(0, Number.isFinite(args.settledT) ? args.settledT : 0);
  const openSides = Math.max(0, Number.isFinite(args.settledE) ? args.settledE : 0);
  const parts = integrityParts(ownedTiles, openSides, garrisonedTiles);
  const shapePct = Math.round(parts.shape * 100);
  const garrisonPct = Math.round(parts.garrisonShare * 100);
  const minGarrisonPct = Math.round(INTEGRITY_MIN_GARRISON_SHARE * 100);
  const penaltyPct = Math.round(parts.garrisonPenalty * 100);
  const compactFrontierTarget = ownedTiles > 0 ? idealExposureForTiles(ownedTiles) : 0;
  const fullScoreCutoff = ownedTiles > 0 ? fullDefensibilityExposureForTiles(ownedTiles) : 0;
  const weightedExposureClass = openSides <= fullScoreCutoff ? "is-positive" : "is-negative";
  const shapeClause = shapePct >= 100
    ? "Great shape: no more open sides than the most compact empire your size."
    : "Too many sides of your land face open ground. Grow into one fat blob, not long thin lines.";
  const garrisonClause = penaltyPct > 0 ? ` Only ${garrisonPct}% of your land is garrisoned: −${penaltyPct}% until you garrison ${minGarrisonPct}%.` : "";
  const economicClause = args.empireIntegrityEnabled
    ? (rounded >= 100 ? " You're earning the full income and growth bonus." : " Your income and growth bonus scales with this score.")
    : "";
  const scoreCopy = shapeClause + garrisonClause + economicClause;
  // The hero's right half sat empty beside a body-size "82%" (playtest 2026-11-18: "half blank"). The score is
  // the headline, and what it is worth right now (the income effect) fills the other side.
  const heroEconPct = Math.round((integrityEconomyMult(Math.max(0, Math.min(1, args.defensibilityPct / 100))) - 1) * 100);
  const heroEffect = args.empireIntegrityEnabled
    ? `<span class="defense-rating defense-rating-${heroEconPct >= 0 ? "strong" : "fragile"}">${heroEconPct >= 0 ? "+" : ""}${heroEconPct}% income</span>`
    : "";
  return `<div class="defense-panel">
    ${integrityDropCardHtml(args.dropNotice)}
    <article class="card defense-hero-card">
      <div class="defense-hero-head">
        <div>
          <div class="defense-kicker">Empire Integrity</div>
          <strong class="defense-score">${rounded}%</strong>
        </div>
        ${heroEffect}
      </div>
      <p class="defense-copy">${scoreCopy}</p>
      <button class="panel-btn defense-toggle-btn" type="button" data-toggle-weak-def="true">${args.showWeakDefensibility ? "Hide weak tiles" : "Show weak tiles"}${weakCount > 0 ? ` (${weakCount})` : ""}</button>
      ${args.showWeakDefensibility ? weakTileListHtml(weakEntries) + holeListHtml(scanIntegrityShape(sharedArgs).holes) : ""}
    </article>
    <article class="card defense-breakdown-card">
      <strong>What is an "open side"?</strong>
      <p class="defense-copy">All your land counts, garrisoned or not. A side is <em>open</em> when it faces land that isn't yours: empty, enemy or barbarian land is where enemies walk in. Water and mountains block them, so those sides are <em>not</em> open. <strong>Fewer open sides = harder to invade = higher score.</strong></p>
    </article>
    <article class="card defense-breakdown-card">
      <div class="defense-stat-grid">
        <div class="defense-stat"><span>Your land</span><strong>${ownedTiles}</strong></div>
        <div class="defense-stat"><span>Garrisoned</span><strong>${garrisonedTiles} · ${garrisonPct}%</strong></div>
        <div class="defense-stat"><span>Open sides</span><strong>${summary.exposedEdges}</strong></div>
        <div class="defense-stat"><span>Walls (water + mountain)</span><strong>${summary.naturalShieldEdges}</strong></div>
        <div class="defense-stat"><span>Tile-to-tile borders</span><strong>${Math.round(summary.internalEdges / 2)}</strong></div>
      </div>
    </article>
    <article class="card defense-breakdown-card">
      <strong>Where does the % come from?</strong>
      <p class="defense-copy">Your shape: your open sides against the fewest any empire your size could have (a perfect blob). With under ${minGarrisonPct}% of your land garrisoned, you lose up to ${Math.round(INTEGRITY_UNGARRISONED_PENALTY * 100)}%.</p>
      <div class="defense-line"><span>Shape</span><strong>${shapePct}%</strong></div>
      <div class="defense-line"><span>Too little garrisoned</span><strong class="${penaltyPct > 0 ? "is-negative" : "is-positive"}">${penaltyPct > 0 ? `−${penaltyPct}%` : "none"}</strong></div>
      <div class="defense-line"><span>A perfect blob your size would have</span><strong>${formatDefenseNumber(compactFrontierTarget)}</strong></div>
      <div class="defense-line"><span>You score 100% if you stay at or below</span><strong>${formatDefenseNumber(fullScoreCutoff)}</strong></div>
      <div class="defense-line"><span>You actually have</span><strong class="${weightedExposureClass}">${formatDefenseNumber(openSides)}</strong></div>
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
          <div class="defense-stat"><span>Income effect</span><strong class="${cls(econPct)}">${sign(econPct)}${args.integrityCoinPerMinute ? ` · ${formatCoinPerDay(args.integrityCoinPerMinute)}` : ""}</strong></div>
          <div class="defense-stat"><span>Growth effect</span><strong class="${cls(growthPct)}">${sign(growthPct)}</strong></div>
        </div>
      </article>`;
    })() : ""}
  </div>`;
};
