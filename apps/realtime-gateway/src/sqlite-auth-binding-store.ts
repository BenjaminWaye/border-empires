import type { DatabaseSync } from "node:sqlite";

import type { GatewayAuthBindingStore, StoredAuthIdentityBinding } from "./auth-binding-store/auth-binding-store.js";

type Row = {
  auth_uid: string;
  player_id: string;
  auth_email: string | null;
  updated_at: number;
};

const toBinding = (row: Row): StoredAuthIdentityBinding => ({
  uid: row.auth_uid,
  playerId: row.player_id,
  ...(row.auth_email ? { email: row.auth_email } : {}),
  updatedAt: row.updated_at
});

export class SqliteGatewayAuthBindingStore implements GatewayAuthBindingStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => number = () => Date.now()) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_identity_bindings (
        auth_uid TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        auth_email TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS auth_identity_bindings_player_id_idx ON auth_identity_bindings (player_id);
      CREATE INDEX IF NOT EXISTS auth_identity_bindings_auth_email_lower_idx ON auth_identity_bindings (LOWER(auth_email));
    `);
  }

  async getByUid(uid: string): Promise<StoredAuthIdentityBinding | undefined> {
    const row = this.db
      .prepare(`SELECT auth_uid, player_id, auth_email, updated_at FROM auth_identity_bindings WHERE auth_uid = ?`)
      .get(uid) as Row | undefined;
    return row ? toBinding(row) : undefined;
  }

  async getByEmail(email: string): Promise<StoredAuthIdentityBinding | undefined> {
    const row = this.db
      .prepare(
        `SELECT auth_uid, player_id, auth_email, updated_at
         FROM auth_identity_bindings
         WHERE LOWER(auth_email) = LOWER(?)
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(email) as Row | undefined;
    return row ? toBinding(row) : undefined;
  }

  async getByPlayerId(playerId: string): Promise<StoredAuthIdentityBinding | undefined> {
    const row = this.db
      .prepare(
        `SELECT auth_uid, player_id, auth_email, updated_at
         FROM auth_identity_bindings
         WHERE player_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(playerId) as Row | undefined;
    return row ? toBinding(row) : undefined;
  }

  async bindIdentity(binding: { uid: string; playerId: string; email?: string }): Promise<StoredAuthIdentityBinding> {
    const now = this.now();
    const row = this.db
      .prepare(
        `INSERT INTO auth_identity_bindings (auth_uid, player_id, auth_email, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(auth_uid) DO UPDATE SET
           auth_email = COALESCE(excluded.auth_email, auth_identity_bindings.auth_email),
           updated_at = excluded.updated_at
         RETURNING auth_uid, player_id, auth_email, updated_at`
      )
      .get(binding.uid, binding.playerId, binding.email ?? null, now) as Row;
    return toBinding(row);
  }
}
