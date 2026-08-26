import type { DomainTileState } from "@border-empires/game-domain";
import { reachSetForPlayer, isInReach, type ReachAnchor } from "@border-empires/shared";
import type { DockRouteDefinition } from "../dock-network/dock-network.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";

/**
 * Pure reach-anchor helpers extracted out of runtime.ts (Stage 2 of the
 * god-class breakup plan). These are read-mostly query/diff functions over
 * `this.tiles` and a few adjacency indexes — see each function's doc
 * comment (carried over verbatim from the private methods they replace) for
 * the domain rules. `applyReachAnchorActivation` / `applyReachAnchorDeactivation`
 * deliberately stay on SimulationRuntime: they mutate `this.reachBorder` and
 * call `this.replaceTileState`, which is tightly coupled to other spine
 * state (economy/index caches, event emission) and too risky to peel off
 * here.
 */

export interface GatherReachAnchorsDeps {
  playerSummaries: ReadonlyMap<string, PlayerRuntimeSummary>;
  tiles: ReadonlyMap<string, DomainTileState>;
  activeRelayBeaconsByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  activeSiegeOutpostsByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  docks: readonly DockRouteDefinition[];
  tileSettledAtByKey: ReadonlyMap<string, number>;
  now: number;
}

// Every reach anchor world-wide, right now: every player's town tiles,
// every active outpost-family structure tile (RELAY_BEACON /
// SIEGE_OUTPOST / SIEGE_TOWER / DREAD_TOWER — same "active" predicate
// outpost-aura.ts uses, sourced from the already-maintained
// activeRelayBeaconsByOwner / activeSiegeOutpostsByOwner indexes), and
// every owned dock tile. Used both for `liveReachForOwner`'s "can this
// owner currently defend this tile" check during a contest, and once at
// startup to seed `reachBorder`. `activatedAt` is unused by the current
// border model (grantAnchorToBorder resolves contests via live coverage,
// not build order) but is still populated for API completeness / possible
// future use.
export function gatherReachAnchors(deps: GatherReachAnchorsDeps): ReachAnchor[] {
  const { playerSummaries, tiles, activeRelayBeaconsByOwner, activeSiegeOutpostsByOwner, docks, tileSettledAtByKey, now } = deps;
  const anchors: ReachAnchor[] = [];
  for (const [playerId, summary] of playerSummaries) {
    for (const tileKey of summary.ownedTownTierByTile.keys()) {
      const tile = tiles.get(tileKey);
      // ownershipState gate: a tile that was overtaken by the unsettle
      // transition keeps its `town`/`siegeOutpost`/`economicStructure`
      // fields untouched (structures stay, only ownershipState flips), so
      // without this check a dormant/downgraded structure would keep
      // functioning as a full reach anchor forever — contradicting the
      // same SETTLED-only dormancy rule already enforced for combat aura
      // in outpost-aura.ts. Gate TOWN, OUTPOST, and DOCK anchors on it.
      if (!tile || tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
      anchors.push({ x: tile.x, y: tile.y, ownerId: playerId, activatedAt: tileSettledAtByKey.get(tileKey) ?? now, kind: "TOWN" });
    }
  }
  for (const [ownerId, keys] of activeRelayBeaconsByOwner) {
    for (const tileKey of keys) {
      const tile = tiles.get(tileKey);
      if (!tile || tile.ownershipState !== "SETTLED") continue;
      anchors.push({ x: tile.x, y: tile.y, ownerId, activatedAt: tile.economicStructure?.activatedAt ?? now, kind: "OUTPOST" });
    }
  }
  for (const [ownerId, keys] of activeSiegeOutpostsByOwner) {
    for (const tileKey of keys) {
      const tile = tiles.get(tileKey);
      if (!tile || tile.ownershipState !== "SETTLED") continue;
      anchors.push({ x: tile.x, y: tile.y, ownerId, activatedAt: tile.siegeOutpost?.activatedAt ?? now, kind: "OUTPOST" });
    }
  }
  for (const dock of docks) {
    const tile = tiles.get(dock.tileKey);
    // Gated on ownershipState === "SETTLED", same as TOWN/OUTPOST above. A
    // captured dock tile lands FRONTIER first; it needs to actually be
    // settled (including via the out-of-reach auto-settle path in
    // runtime-lock-resolution.ts) before it projects reach, so a raw
    // capture can't instantly bootstrap territory nobody chose to hold.
    if (!tile?.ownerId || tile.ownershipState !== "SETTLED") continue;
    anchors.push({ x: tile.x, y: tile.y, ownerId: tile.ownerId, activatedAt: tileSettledAtByKey.get(dock.tileKey) ?? now, kind: "DOCK" });
  }
  return anchors;
}

// Detects any reach anchor that just became active on this tile as a
// result of `previous` -> `tile` (town gained/changed owner, an
// outpost-family structure went active, or a dock tile gained an owner —
// AND, for TOWN/OUTPOST, the tile just became SETTLED: re-settling a tile
// that was downgraded by the unsettle transition while it still carried a
// live structure must re-fire the grant, since gatherReachAnchors now
// excludes non-SETTLED tiles entirely — without this, a re-settled anchor
// would silently stop extending the border even though it once did).
// A single tile can in principle activate more than one anchor kind at
// once (e.g. a town tile that also carries a dock), so this returns a
// list. Deactivations (structure destroyed/captured away, town lost, or a
// downgrade to FRONTIER) are NOT reported here — the border is sticky and
// only changes on a new activation contesting it (see
// grantAnchorToBorder's doc comment).
export function newlyActivatedReachAnchors(previous: DomainTileState | undefined, tile: DomainTileState, now: number): ReachAnchor[] {
  const anchors: ReachAnchor[] = [];
  const wasSettled = previous?.ownershipState === "SETTLED";
  const isSettled = tile.ownershipState === "SETTLED";

  const wasActiveTown = wasSettled && previous?.town ? previous.ownerId : undefined;
  const isActiveTown = isSettled && tile.town ? tile.ownerId : undefined;
  if (isActiveTown && isActiveTown !== wasActiveTown) {
    anchors.push({ x: tile.x, y: tile.y, ownerId: isActiveTown, activatedAt: now, kind: "TOWN" });
  }
  const wasActiveSiege = wasSettled && previous?.siegeOutpost?.status === "active" ? previous.siegeOutpost.ownerId : undefined;
  const isActiveSiege = isSettled && tile.siegeOutpost?.status === "active" ? tile.siegeOutpost.ownerId : undefined;
  if (isActiveSiege && isActiveSiege !== wasActiveSiege) {
    anchors.push({ x: tile.x, y: tile.y, ownerId: isActiveSiege, activatedAt: tile.siegeOutpost?.activatedAt ?? now, kind: "OUTPOST" });
  }
  const wasActiveBeacon =
    wasSettled && previous?.economicStructure?.status === "active" && previous.economicStructure.type === "RELAY_BEACON"
      ? previous.economicStructure.ownerId
      : undefined;
  const isActiveBeacon =
    isSettled && tile.economicStructure?.status === "active" && tile.economicStructure.type === "RELAY_BEACON"
      ? tile.economicStructure.ownerId
      : undefined;
  if (isActiveBeacon && isActiveBeacon !== wasActiveBeacon) {
    anchors.push({ x: tile.x, y: tile.y, ownerId: isActiveBeacon, activatedAt: tile.economicStructure?.activatedAt ?? now, kind: "OUTPOST" });
  }
  // DOCK now gated on SETTLED, same as TOWN/OUTPOST — see gatherReachAnchors.
  const wasActiveDock = wasSettled && previous?.dockId ? previous.ownerId : undefined;
  const isActiveDock = isSettled && tile.dockId ? tile.ownerId : undefined;
  if (isActiveDock && isActiveDock !== wasActiveDock) {
    anchors.push({ x: tile.x, y: tile.y, ownerId: isActiveDock, activatedAt: now, kind: "DOCK" });
  }
  return anchors;
}

// Mirror of newlyActivatedReachAnchors, inverted: detects any reach anchor
// that just went INACTIVE on this tile as a result of `previous` -> `tile`
// (town lost/downgraded, an outpost-family structure destroyed/captured
// away, a dock tile losing its owner, or a SETTLED -> FRONTIER downgrade
// taking a TOWN/OUTPOST anchor down with it). Feeds
// applyReachAnchorDeactivation, which re-checks only the tiles this
// specific anchor used to help defend against rival coverage that already
// exists right now — see reassessBorderOnAnchorDeactivation's doc comment
// for why this is needed even though the border is otherwise sticky.
export function newlyDeactivatedReachAnchors(previous: DomainTileState | undefined, tile: DomainTileState, now: number): ReachAnchor[] {
  const anchors: ReachAnchor[] = [];
  const wasSettled = previous?.ownershipState === "SETTLED";
  const isSettled = tile.ownershipState === "SETTLED";

  const wasActiveTown = wasSettled && previous?.town ? previous.ownerId : undefined;
  const isActiveTown = isSettled && tile.town ? tile.ownerId : undefined;
  if (wasActiveTown && wasActiveTown !== isActiveTown) {
    anchors.push({ x: tile.x, y: tile.y, ownerId: wasActiveTown, activatedAt: now, kind: "TOWN" });
  }
  const wasActiveSiege = wasSettled && previous?.siegeOutpost?.status === "active" ? previous.siegeOutpost.ownerId : undefined;
  const isActiveSiege = isSettled && tile.siegeOutpost?.status === "active" ? tile.siegeOutpost.ownerId : undefined;
  if (wasActiveSiege && wasActiveSiege !== isActiveSiege) {
    anchors.push({ x: tile.x, y: tile.y, ownerId: wasActiveSiege, activatedAt: now, kind: "OUTPOST" });
  }
  const wasActiveBeacon =
    wasSettled && previous?.economicStructure?.status === "active" && previous.economicStructure.type === "RELAY_BEACON"
      ? previous.economicStructure.ownerId
      : undefined;
  const isActiveBeacon =
    isSettled && tile.economicStructure?.status === "active" && tile.economicStructure.type === "RELAY_BEACON"
      ? tile.economicStructure.ownerId
      : undefined;
  if (wasActiveBeacon && wasActiveBeacon !== isActiveBeacon) {
    anchors.push({ x: tile.x, y: tile.y, ownerId: wasActiveBeacon, activatedAt: now, kind: "OUTPOST" });
  }
  // DOCK now gated on SETTLED, same as TOWN/OUTPOST — see gatherReachAnchors.
  const wasActiveDock = wasSettled && previous?.dockId ? previous.ownerId : undefined;
  const isActiveDock = isSettled && tile.dockId ? tile.ownerId : undefined;
  if (wasActiveDock && wasActiveDock !== isActiveDock) {
    anchors.push({ x: tile.x, y: tile.y, ownerId: wasActiveDock, activatedAt: now, kind: "DOCK" });
  }
  return anchors;
}

export function isPlayerTileInReach(playerId: string, x: number, y: number, reachBorder: ReadonlyMap<string, string>): boolean {
  return isInReach(playerId, x, y, reachBorder);
}

// Diagnostic-only (admin debug surface): size of the persistent reach
// border currently granted to a player, LAND-ONLY — the "reachTiles"
// answer to "how much of their reach is frontier / still usable" (owned
// tiles are always a SUBSET of granted reach — a border can extend into
// ground not yet claimed). The border itself is purely geometric (a
// radius disk with no terrain awareness — same as the client's
// computeLocalReachSet), so a coastal or island anchor's disk routinely
// covers SEA/COASTAL_SEA/MOUNTAIN tiles that can never actually be
// EXPANDed onto (handleFrontierCommandImpl requires terrain === "LAND").
// Reporting the raw geometric size overstated how much room a player
// actually has — an island empire could read as having plenty of "reach"
// left when most of that disk was open water. Filtered here, not on
// reachTileKeysForPlayer below: that one feeds the AI planner's actual
// legality lookup and must stay exactly geometric to match the server's
// authoritative isInReach check bit-for-bit (filtering there would be
// harmless for legality — EXPAND already separately requires LAND — but
// needlessly risks drifting from the ground truth it's meant to mirror).
// O(border size), not called from any hot path.
export function reachTileCountForPlayer(playerId: string, reachBorder: ReadonlyMap<string, string>, tiles: ReadonlyMap<string, DomainTileState>): number {
  let count = 0;
  for (const tileKey of reachSetForPlayer(playerId, reachBorder)) {
    if (tiles.get(tileKey)?.terrain === "LAND") count += 1;
  }
  return count;
}

// Real (non-diagnostic) accessor: the full key set the AI planner needs to
// build its own reachLookup, for both the in-process and worker-thread
// planning paths — see buildRuntimePlannerPlayerViews's reachTileKeys.
export function reachTileKeysForPlayer(playerId: string, reachBorder: ReadonlyMap<string, string>): string[] {
  return [...reachSetForPlayer(playerId, reachBorder)];
}

// Every owner's tile keys, grouped in ONE pass over reachBorder — for
// rival-reach-push.ts's connect-time push, which needs every OTHER owner's
// border. Calling reachTileKeysForPlayer per owner there would be
// O(owners x reachBorder size): each call rescans the entire global border
// just to filter down to one owner. This does the equivalent work once,
// regardless of how many owners are being looked up.
export function reachTileKeysGroupedByOwner(reachBorder: ReadonlyMap<string, string>): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const [tileKey, ownerId] of reachBorder) {
    let keys = grouped.get(ownerId);
    if (!keys) {
      keys = [];
      grouped.set(ownerId, keys);
    }
    keys.push(tileKey);
  }
  return grouped;
}
