import type { Tile } from "./client-types.js";

type EdgeDirection = "north" | "east" | "south" | "west";

type DefensibilityBreakdown = {
  settledTiles: number;
  exposedEdges: number;
  internalEdges: number;
  naturalShieldEdges: number;
  borderEdges: number;
  exposedEdgeRatio: number;
  rating: "Strong" | "Stable" | "Fragile" | "Very Exposed";
  tips: string[];
};

type DefensibilityArgs = {
  tiles: Map<string, Tile>;
  me: string;
  defensibilityPct: number;
  showWeakDefensibility: boolean;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
};

const settledOwnedTiles = (args: Pick<DefensibilityArgs, "tiles" | "me">): Tile[] =>
  [...args.tiles.values()].filter((tile) => tile.ownerId === args.me && tile.terrain === "LAND" && tile.ownershipState === "SETTLED" && !tile.fogged);

export const exposedSidesForTile = (
  tile: Tile,
  args: Pick<DefensibilityArgs, "tiles" | "me" | "keyFor" | "wrapX" | "wrapY" | "terrainAt">
): EdgeDirection[] => {
  const dirs = [
    { name: "north" as const, x: tile.x, y: tile.y - 1 },
    { name: "east" as const, x: tile.x + 1, y: tile.y },
    { name: "south" as const, x: tile.x, y: tile.y + 1 },
    { name: "west" as const, x: tile.x - 1, y: tile.y }
  ];
  const out: EdgeDirection[] = [];
  for (const dir of dirs) {
    const neighbor = args.tiles.get(args.keyFor(args.wrapX(dir.x), args.wrapY(dir.y)));
    if (neighbor?.ownerId === args.me && neighbor.terrain === "LAND" && neighbor.ownershipState === "SETTLED" && !neighbor.fogged) continue;
    const terrain = args.terrainAt(dir.x, dir.y);
    if (terrain === "SEA" || terrain === "MOUNTAIN") continue;
    out.push(dir.name);
  }
  return out;
};

const weakDefensibilityTiles = (args: Pick<DefensibilityArgs, "tiles" | "me" | "keyFor" | "wrapX" | "wrapY" | "terrainAt">) =>
  settledOwnedTiles(args)
    .map((tile) => ({ tile, exposedSides: exposedSidesForTile(tile, args) }))
    .filter((entry) => entry.exposedSides.length >= 2);

const defensibilityBreakdown = (args: Pick<DefensibilityArgs, "tiles" | "me" | "keyFor" | "wrapX" | "wrapY" | "terrainAt">): DefensibilityBreakdown => {
  const tiles = settledOwnedTiles(args);
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
      if (neighborTile?.ownerId === args.me && neighborTile.terrain === "LAND" && neighborTile.ownershipState === "SETTLED" && !neighborTile.fogged) {
        internalEdges += 1;
        continue;
      }
      const terrain = args.terrainAt(neighbor.x, neighbor.y);
      if (terrain === "SEA" || terrain === "MOUNTAIN") {
        naturalShieldEdges += 1;
        continue;
      }
      exposedEdges += 1;
    }
  }
  const borderEdges = naturalShieldEdges + exposedEdges;
  const exposedEdgeRatio = borderEdges > 0 ? exposedEdges / borderEdges : 0;
  const rating =
    exposedEdgeRatio <= 0.18 ? "Strong" : exposedEdgeRatio <= 0.32 ? "Stable" : exposedEdgeRatio <= 0.5 ? "Fragile" : "Very Exposed";
  const tips: string[] = [];
  if (exposedEdges > naturalShieldEdges) tips.push("Anchor more of your border on coastlines or mountains to replace exposed edges with natural shields.");
  if (tiles.length > 0 && exposedEdges / tiles.length > 1.6) tips.push("Your empire is stretched thin. Fill inward gaps and avoid long one-tile corridors.");
  if (internalEdges < borderEdges * 1.4) tips.push("Compact blocks defend better than snakes. Settling tiles that connect nearby clusters will lift defensibility fastest.");
  if (tips.length === 0) tips.push("Your current shape is efficient. Keep expanding in compact blocks and preserve natural barriers where possible.");
  return { settledTiles: tiles.length, exposedEdges, internalEdges, naturalShieldEdges, borderEdges, exposedEdgeRatio, rating, tips };
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
  return `<div class="defense-panel">
    <article class="card defense-hero-card">
      <div class="defense-hero-head">
        <div>
          <div class="defense-kicker">Empire Shape</div>
          <strong>${rounded}% defensibility</strong>
        </div>
        <span class="defense-rating defense-rating-${summary.rating.toLowerCase().replace(/ /g, "-")}">${summary.rating}</span>
      </div>
      <p class="defense-copy">Compact settled land with fewer exposed sides defends better. Coastlines and mountains count as safer borders than open land.</p>
      <button class="panel-btn defense-toggle-btn" type="button" data-toggle-weak-def="true">${args.showWeakDefensibility ? "Hide Weak Tiles" : "Show Weak Tiles"}${weakCount > 0 ? ` (${weakCount})` : ""}</button>
    </article>
    <article class="card defense-breakdown-card">
      <div class="defense-stat-grid">
        <div class="defense-stat"><span>Settled tiles</span><strong>${summary.settledTiles}</strong></div>
        <div class="defense-stat"><span>Exposed edges</span><strong>${summary.exposedEdges}</strong></div>
        <div class="defense-stat"><span>Natural shields</span><strong>${summary.naturalShieldEdges}</strong></div>
        <div class="defense-stat"><span>Connected interiors</span><strong>${Math.round(summary.internalEdges / 2)}</strong></div>
      </div>
    </article>
    <article class="card defense-breakdown-card">
      <strong>How this works</strong>
      <div class="defense-line"><span>Open land borders</span><strong class="is-negative">${Math.round(summary.exposedEdgeRatio * 100)}%</strong></div>
      <div class="defense-line"><span>Coast / mountain cover</span><strong class="is-positive">${summary.borderEdges > 0 ? Math.round((summary.naturalShieldEdges / summary.borderEdges) * 100) : 0}%</strong></div>
      <div class="defense-line"><span>Shape efficiency</span><strong>${rounded >= 100 ? "Maxed" : rounded >= 70 ? "Good" : rounded >= 45 ? "Needs work" : "Very loose"}</strong></div>
    </article>
    <article class="card defense-breakdown-card">
      <strong>Tips to improve</strong>
      ${summary.tips.map((tip) => `<div class="defense-tip">${tip}</div>`).join("")}
    </article>
  </div>`;
};
