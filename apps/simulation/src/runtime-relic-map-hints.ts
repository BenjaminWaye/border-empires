import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { isRedesignedRelic, relicOperationalState, RELIC_MAP_HINT_LIMIT, RELIC_RULES, WORLD_WIDTH, WORLD_HEIGHT, wrapX, wrapY, type RelicMapHint, type RelicResource } from "@border-empires/shared";
import { activeRelicTiles, type RelicReadContext } from "./runtime-relics.js";
import { hasRevealedResourceForPlayer } from "./tech-domain-bridge/tech-resource-reveal.js";

/**
 * The House operating a relic, or undefined while it is dormant or depleted.
 * Operating aether machinery gives off a wake every House can detect
 * (docs/relics.md, "Aether wake"); the dormant standby transponder does not.
 */
export const relicWakeOwner = (tile: DomainTileState): string | undefined =>
  tile.ownerId && tile.ownershipState === "SETTLED" && tile.naturalWonder && isRedesignedRelic(tile.naturalWonder) && relicOperationalState(tile.naturalWonder, true) === "active"
    ? tile.ownerId
    : undefined;

/** Fixed world-site index, reconstructed at boot; no per-viewer discovery history. */
export class RelicMapHintIndex {
  private readonly siteKeys = new Set<string>();
  /** Site key -> the House whose wake it gives off (absent while silent). */
  private readonly wakeOwners = new Map<string, string>();
  /** `onWakeChanged` runs synchronously whenever a relic starts, stops or changes hands operating (the caller defers and coalesces: relic-wake-broadcast.ts). */
  constructor(private readonly onWakeChanged?: () => void) {}
  /** `notify` is false while seeding at boot: a restart changes no wake anyone could see. */
  refresh(key: string, tile: DomainTileState, notify = true): void {
    if (!isRedesignedRelic(tile.naturalWonder)) { this.siteKeys.delete(key); this.setWake(key, undefined, notify); return; }
    if (!this.siteKeys.has(key) && this.siteKeys.size >= 9) throw new RangeError("World relic limit exceeded");
    this.siteKeys.add(key);
    this.setWake(key, relicWakeOwner(tile), notify);
  }
  private setWake(key: string, ownerId: string | undefined, notify: boolean): void {
    if (this.wakeOwners.get(key) === ownerId) return;
    if (ownerId) this.wakeOwners.set(key, ownerId); else this.wakeOwners.delete(key);
    if (notify) this.onWakeChanged?.();
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
      // An operating relic's aether wake reaches every other House, with its operator; it replaces the beam.
      const wakeOwner = relicWakeOwner(site);
      if (wakeOwner && wakeOwner !== player.id) { hints.push({ x: site.x, y: site.y, kind: "WAKE", ownerId: wakeOwner }); continue; }
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

// The guide town lead rides the same PLAYER_UPDATE field set as relic hints (guide-town-lead/player-map-hints.ts).
export { playerMapHints } from "./guide-town-lead/player-map-hints.js";
