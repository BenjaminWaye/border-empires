import type { DatabaseSync } from "node:sqlite";

import { newPublicProfileId, type PublicProfileLink, type PublicProfileLinkStore } from "./public-profile-link-store.js";

type Row = { public_id: string; player_id: string; created_at: number };
const fromRow = (row: Row | undefined): PublicProfileLink | undefined =>
  row ? { publicId: row.public_id, playerId: row.player_id, createdAt: Number(row.created_at) } : undefined;

// Personal data: scripts/account-deletion/erase-account-data.mjs deletes an
// erased account's row (PERSONAL_TABLES).
export class SqlitePublicProfileLinkStore implements PublicProfileLinkStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS public_profile_links (
        public_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
    `);
  }

  async getOrCreate(playerId: string, now: number): Promise<PublicProfileLink> {
    this.db
      .prepare("INSERT OR IGNORE INTO public_profile_links (public_id, player_id, created_at) VALUES (?, ?, ?)")
      .run(newPublicProfileId(), playerId, now);
    const link = await this.getByPlayerId(playerId);
    if (!link) throw new Error("public profile link was not stored");
    return link;
  }

  async getByPlayerId(playerId: string): Promise<PublicProfileLink | undefined> {
    return fromRow(this.db.prepare("SELECT public_id, player_id, created_at FROM public_profile_links WHERE player_id = ?").get(playerId) as Row | undefined);
  }

  async getByPublicId(publicId: string): Promise<PublicProfileLink | undefined> {
    return fromRow(this.db.prepare("SELECT public_id, player_id, created_at FROM public_profile_links WHERE public_id = ?").get(publicId) as Row | undefined);
  }

  async remove(playerId: string): Promise<boolean> {
    return Number(this.db.prepare("DELETE FROM public_profile_links WHERE player_id = ?").run(playerId).changes) > 0;
  }
}
