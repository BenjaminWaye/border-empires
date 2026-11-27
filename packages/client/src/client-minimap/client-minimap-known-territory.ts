// Which known owned tiles the minimap / phone map overview paints in their owner's colour.
//
// Fogged tiles normally get no owner tint and are dimmed (the last-known owner may be stale). Allies are the
// exception: their land is the viewer's side, so whatever of it this client knows -- even remembered under fog,
// far from home -- is drawn in the ally's colour and not dimmed. Without this a far-off ally (playtest: Lantern
// Accord at (450, 301), reached from its profile's Show on map) widened the overview's frame but never showed.

type KnownTile = { ownerId?: string | undefined; fogged?: boolean | undefined };

/** Whether a known tile belongs to one of the viewer's allies. */
export const isMiniMapAlliedTile = (tile: KnownTile | undefined, alliedOwnerIds: ReadonlySet<string> | undefined): boolean =>
  Boolean(tile?.ownerId && alliedOwnerIds?.has(tile.ownerId));

/** Whether the minimap tints this known tile in its owner's colour: an owned tile in sight, or any known allied tile. */
export const miniMapTintsOwner = (tile: KnownTile, alliedOwnerIds: ReadonlySet<string> | undefined): boolean =>
  Boolean(tile.ownerId) && (!tile.fogged || isMiniMapAlliedTile(tile, alliedOwnerIds));
