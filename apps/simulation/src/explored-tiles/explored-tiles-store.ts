import { encodeExploredTilesRuns, forEachExploredTile, type ExploredTilesRuns } from "@border-empires/shared";

/**
 * Server-side explored-tile memory: for each player, every tile that has ever
 * been in their vision this season ("remembered fog" vs "unexplored storm").
 *
 * Before this existed the memory lived only in the browser (in-memory plus a
 * localStorage copy keyed by season and player), so a reload after browser
 * storage was cleared, a new device, or any mismatch on reconnect turned
 * explored land back into unexplored storm. The simulation now records it as
 * tiles enter vision (VisibilityCoverageCache's 0→1 edge), saves it in every
 * snapshot, and sends it on subscribe; the client unions it into its own set.
 *
 * Bounds: one fixed-size bitset (width*height/8 bytes, ~25KB on the default
 * map) per player id; `retainOnly` drops ids that are no longer players at
 * every snapshot export, so the map is bounded by the player count.
 */
export type ExploredTilesSnapshotEntry = { playerId: string } & ExploredTilesRuns;

export type ExploredTilesStats = { players: number; runNumbers: number };

export class ExploredTilesStore {
  private readonly bitsets = new Map<string, Uint8Array>();
  // Explored-tile count per player, kept in step with the bitsets (Cartographer achievement).
  private readonly counts = new Map<string, number>();
  private readonly byteLength: number;

  constructor(
    private readonly width: number,
    private readonly height: number
  ) {
    this.byteLength = Math.ceil((width * height) / 8);
  }

  /** Records `tileKey` ("x,y") as explored by `playerId`. Malformed or off-world keys are ignored. */
  markKey(playerId: string, tileKey: string): void {
    let x = 0;
    let i = 0;
    for (; i < tileKey.length; i += 1) {
      const code = tileKey.charCodeAt(i);
      if (code === 44) break;
      if (code < 48 || code > 57) return;
      x = x * 10 + code - 48;
    }
    if (i === 0 || i >= tileKey.length - 1) return;
    let y = 0;
    for (i += 1; i < tileKey.length; i += 1) {
      const code = tileKey.charCodeAt(i);
      if (code < 48 || code > 57) return;
      y = y * 10 + code - 48;
    }
    this.mark(playerId, x, y);
  }

  mark(playerId: string, x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const cell = y * this.width + x;
    const bits = this.bitsetFor(playerId);
    const byte = bits[cell >> 3] ?? 0;
    const bit = 1 << (cell & 7);
    if ((byte & bit) !== 0) return;
    bits[cell >> 3] = byte | bit;
    this.counts.set(playerId, (this.counts.get(playerId) ?? 0) + 1);
  }

  /** How many tiles `playerId` has explored. */
  exploredCount(playerId: string): number {
    return this.counts.get(playerId) ?? 0;
  }

  isExplored(playerId: string, x: number, y: number): boolean {
    const bits = this.bitsets.get(playerId);
    if (!bits || x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const cell = y * this.width + x;
    return (((bits[cell >> 3] ?? 0) >> (cell & 7)) & 1) === 1;
  }

  /** The encoded memory for one player, or undefined when they have explored nothing. */
  encodedFor(playerId: string): ExploredTilesRuns | undefined {
    const bits = this.bitsets.get(playerId);
    return bits ? encodeExploredTilesRuns(bits, this.width, this.height) : undefined;
  }

  /** Unions a persisted snapshot into memory (order-independent with live marks). */
  restore(entries: readonly ExploredTilesSnapshotEntry[] | undefined): void {
    // Persisted data: a malformed field must start with empty memory, never crash the runtime constructor.
    if (!Array.isArray(entries)) return;
    for (const entry of entries as readonly unknown[]) {
      if (!entry || typeof entry !== "object") continue;
      const { playerId } = entry as Partial<ExploredTilesSnapshotEntry>;
      if (typeof playerId !== "string" || playerId.length === 0) continue;
      forEachExploredTile(entry, this.width, this.height, (x, y) => this.mark(playerId, x, y));
    }
  }

  /** Drops memory for ids that are no longer players (deleted accounts, removed AI). */
  retainOnly(isPlayer: (playerId: string) => boolean): void {
    for (const playerId of [...this.bitsets.keys()]) if (!isPlayer(playerId)) { this.bitsets.delete(playerId); this.counts.delete(playerId); }
  }

  exportSnapshot(): ExploredTilesSnapshotEntry[] {
    return [...this.bitsets.keys()]
      .sort()
      .map((playerId) => ({ playerId, ...encodeExploredTilesRuns(this.bitsets.get(playerId)!, this.width, this.height) }));
  }

  private bitsetFor(playerId: string): Uint8Array {
    let bits = this.bitsets.get(playerId);
    if (!bits) {
      bits = new Uint8Array(this.byteLength);
      this.bitsets.set(playerId, bits);
    }
    return bits;
  }
}

/** Size gauge for checkpoint logging (players held, total run numbers written). */
export const exploredTilesStats = (entries: readonly ExploredTilesSnapshotEntry[] | undefined): ExploredTilesStats => ({
  players: entries?.length ?? 0,
  runNumbers: (entries ?? []).reduce((total, entry) => total + entry.runs.length, 0)
});
