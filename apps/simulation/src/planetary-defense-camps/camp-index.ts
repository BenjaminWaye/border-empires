// Main-thread index of Planetary Defense camps: which tiles belong to which
// camp. Derived from tile state (Runtime.replaceTileState feeds every write),
// rebuilt on boot, never saved. Bounded by the number of Planetary Defense
// tiles; `sizes()` feeds the gauges (docs/agents/state-and-persistence-discipline.md).
import { isPlanetaryDefenseCampTile, isPlanetaryDefenseOwner, type CampTileFields } from "./camp-rules.js";

export type CampMembershipListener = {
  /** `tileKey` became part of `campId`. */
  readonly onTileJoined: (tileKey: string, campId: string) => void;
  /** `tileKey` stopped being part of `campId`. */
  readonly onTileLeft: (tileKey: string, campId: string) => void;
};

const campIdOf = (tile: CampTileFields | undefined): string | undefined =>
  tile && isPlanetaryDefenseOwner(tile.ownerId) && tile.campId ? tile.campId : undefined;

export class PlanetaryDefenseCampIndex {
  private readonly tilesByCamp = new Map<string, Set<string>>();
  private readonly campByTile = new Map<string, string>();
  private readonly liveCampKeys = new Set<string>();
  // Camps that lost a tile (or their camp tile) and must be re-checked for
  // land cut off from the camp. Bounded by the number of camps.
  private readonly dirtyCamps = new Set<string>();
  private listener: CampMembershipListener | undefined;
  // The worker-side copy (planner) never drains, so it doesn't keep a dirty set.
  private readonly trackDirty: boolean;

  constructor(options: { readonly trackDirty?: boolean } = {}) {
    this.trackDirty = options.trackDirty ?? true;
  }

  setListener(listener: CampMembershipListener): void {
    this.listener = listener;
  }

  /**
   * Feed one tile write. Cheap when neither side is a Planetary Defense tile.
   * Returns true when a camp lost a tile or its camp tile (it needs a drain).
   */
  onTileWrite(tileKey: string, next: CampTileFields | undefined): boolean {
    const before = this.campByTile.get(tileKey);
    const after = campIdOf(next);
    let lost = false;
    if (isPlanetaryDefenseCampTile(tileKey, next)) this.liveCampKeys.add(tileKey);
    else if (this.liveCampKeys.delete(tileKey)) {
      this.markDirty(tileKey);
      lost = true;
    }
    if (before === after) return lost;
    if (before) this.removeMember(tileKey, before);
    if (after) this.addMember(tileKey, after);
    return lost || before !== undefined;
  }

  /** Replace the whole index from the current tiles (boot / hydration). */
  rebuild(tiles: Iterable<[string, CampTileFields]>): void {
    for (const [tileKey, campId] of [...this.campByTile]) this.removeMember(tileKey, campId);
    this.liveCampKeys.clear();
    this.dirtyCamps.clear();
    for (const [tileKey, tile] of tiles) {
      const campId = campIdOf(tile);
      if (!campId) continue;
      this.addMember(tileKey, campId);
      if (isPlanetaryDefenseCampTile(tileKey, tile)) this.liveCampKeys.add(tileKey);
    }
    // A tile whose camp is gone (or never existed) is collapsed on the next drain.
    for (const campId of this.tilesByCamp.keys()) if (!this.liveCampKeys.has(campId)) this.markDirty(campId);
  }

  campOf(tileKey: string): string | undefined {
    return this.campByTile.get(tileKey);
  }

  tilesOf(campId: string): ReadonlySet<string> {
    return this.tilesByCamp.get(campId) ?? EMPTY;
  }

  /** Number of live camps (a SETTLED camp tile that is its own camp). */
  campCount(): number {
    return this.liveCampKeys.size;
  }

  liveCamps(): ReadonlySet<string> {
    return this.liveCampKeys;
  }

  /** Every Planetary Defense tile key that belongs to some camp. */
  memberTileKeys(): IterableIterator<string> {
    return this.campByTile.keys();
  }

  markDirty(campId: string): void {
    if (this.trackDirty) this.dirtyCamps.add(campId);
  }

  hasDirtyCamps(): boolean {
    return this.dirtyCamps.size > 0;
  }

  /** Hand over the camps to re-check and clear the set. */
  takeDirtyCamps(): string[] {
    const camps = [...this.dirtyCamps];
    this.dirtyCamps.clear();
    return camps;
  }

  sizes(): { camps: number; tiles: number; dirtyCamps: number } {
    return { camps: this.liveCampKeys.size, tiles: this.campByTile.size, dirtyCamps: this.dirtyCamps.size };
  }

  private addMember(tileKey: string, campId: string): void {
    this.campByTile.set(tileKey, campId);
    let members = this.tilesByCamp.get(campId);
    if (!members) {
      members = new Set();
      this.tilesByCamp.set(campId, members);
    }
    members.add(tileKey);
    this.listener?.onTileJoined(tileKey, campId);
  }

  private removeMember(tileKey: string, campId: string): void {
    this.campByTile.delete(tileKey);
    const members = this.tilesByCamp.get(campId);
    if (members) {
      members.delete(tileKey);
      if (members.size === 0) this.tilesByCamp.delete(campId);
    }
    this.markDirty(campId);
    this.listener?.onTileLeft(tileKey, campId);
  }
}

const EMPTY: ReadonlySet<string> = new Set();
