import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { isRedesignedRelic, RELIC_MAP_HINT_LIMIT, RELIC_RULES, WORLD_WIDTH, WORLD_HEIGHT, wrapX, wrapY, type RelicMapHint, type RelicResource } from "@border-empires/shared";
import { activeRelicTiles, type RelicReadContext } from "./runtime-relics.js";
import { hasRevealedResourceForPlayer } from "./tech-domain-bridge/tech-resource-reveal.js";

/** Fixed world-site index, reconstructed at boot; no per-viewer discovery history. */
export class RelicMapHintIndex {
  private readonly siteKeys = new Set<string>();
  refresh(key: string, tile: DomainTileState): void {
    if (!isRedesignedRelic(tile.naturalWonder)) { this.siteKeys.delete(key); return; }
    if (!this.siteKeys.has(key) && this.siteKeys.size >= 9) throw new RangeError("World relic limit exceeded");
    this.siteKeys.add(key);
  }
  hintsFor(context: RelicReadContext, player: DomainPlayer): RelicMapHint[] {
    const hints: RelicMapHint[] = [];
    for (const key of this.siteKeys) {
      const site = context.tiles.get(key);
      if (!site) continue;
      let close = false;
      visitRadius(site, RELIC_RULES.signalRadius, (x, y) => {
        const tile = context.tiles.get(`${x},${y}`);
        if (tile?.ownerId === player.id && tile.ownershipState === "SETTLED") close = true;
      });
      // Anonymous stationary maintenance transponder. Its presence says nothing about operation.
      if (close) hints.push({ x: site.x, y: site.y, kind: "RELIC" });
    }
    const surveyed = new Set<string>(); // At most 9 × 313 coordinates, below the payload cap.
    for (const array of activeRelicTiles(context, player.id, "CARTOGRAPHERS_LENS")) {
      visitRadius(array, RELIC_RULES.surveyRadius, (x, y) => {
        const key = `${x},${y}`;
        if (surveyed.has(key)) return;
        if (surveyed.size >= RELIC_MAP_HINT_LIMIT || hints.length >= RELIC_MAP_HINT_LIMIT) throw new RangeError("Relic survey payload limit exceeded");
        surveyed.add(key);
        const resource = context.tiles.get(key)?.resource;
        if (!resource || !hasRevealedResourceForPlayer(player, resource)) return;
        const strategic: RelicResource | undefined = resource === "GEMS" ? "CRYSTAL" : resource === "TITANIUM" || resource === "UMBRITE" ? resource : undefined;
        if (strategic) hints.push({ x, y, kind: "RESOURCE", resource: strategic });
      });
    }
    return hints;
  }
}
function visitRadius(center: { x: number; y: number }, radius: number, visit: (x: number, y: number) => void): void {
  for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
    if (Math.abs(dx) + Math.abs(dy) <= radius) visit(wrapX(center.x + dx, WORLD_WIDTH), wrapY(center.y + dy, WORLD_HEIGHT));
  }
}
