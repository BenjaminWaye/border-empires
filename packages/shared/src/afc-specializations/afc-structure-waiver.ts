interface WaiverTile {
  x: number; y: number; ownerId?: string | undefined; ownershipState?: string | undefined;
  fort?: { ownerId?: string | undefined; activatedAt?: number | undefined } | null | undefined;
}
/** Earliest qualifying forts keep their waiver through an in-place tier upgrade. */
export function fortIsWithinSlotWaiver(target: WaiverTile, tiles: Iterable<WaiverTile>, playerId: string, count: number): boolean {
  if (!target.fort || count <= 0) return false;
  const forts = [...tiles].filter(tile => tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.fort?.ownerId === playerId)
    .sort((a, b) => (a.fort?.activatedAt ?? 0) - (b.fort?.activatedAt ?? 0) || `${a.x},${a.y}:fort`.localeCompare(`${b.x},${b.y}:fort`));
  return forts.slice(0, count).some(tile => tile.x === target.x && tile.y === target.y);
}
