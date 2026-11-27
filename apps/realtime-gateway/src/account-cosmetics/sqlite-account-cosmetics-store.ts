import type { DatabaseSync } from "node:sqlite";

import {
  FREE_COSMETIC_IDS,
  cosmeticDefinition,
  isCosmeticId,
  isFreeCosmetic,
  sanitizeCosmeticSelection,
  type CosmeticId,
  type CosmeticSlot,
  type PlayerCosmeticSelection
} from "@border-empires/shared";

import { withGatewaySqliteRetry } from "../sqlite-busy-retry.js";
import type { AccountCosmeticsStore, CosmeticGrantResult, ShownLookKind } from "./account-cosmetics-store.js";

// SQL literal list of the free ids. They come from the shared catalogue, never
// from a client, and are plain `[a-z-]` ids; quoted defensively all the same.
const FREE_ID_LIST = FREE_COSMETIC_IDS.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ") || "''";

// Accounts whose look includes a paid cosmetic, or only free ones (crests).
const ACCOUNTS_OF_KIND: Record<ShownLookKind, string> = {
  paid: `SELECT DISTINCT player_id FROM account_cosmetics_selected WHERE cosmetic_id NOT IN (${FREE_ID_LIST})`,
  freeOnly: `SELECT DISTINCT s.player_id FROM account_cosmetics_selected s WHERE NOT EXISTS
    (SELECT 1 FROM account_cosmetics_selected p WHERE p.player_id = s.player_id AND p.cosmetic_id NOT IN (${FREE_ID_LIST}))`
};

// Both tables are private per-account rows. They are listed as PERSONAL_TABLES
// in scripts/account-deletion/erase-account-data.mjs, so account deletion
// removes them.
export class SqliteAccountCosmeticsStore implements AccountCosmeticsStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => number = Date.now) {}

  applySchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS account_cosmetics_owned (
        player_id TEXT NOT NULL,
        cosmetic_id TEXT NOT NULL,
        granted_at INTEGER NOT NULL,
        grant_ref TEXT NOT NULL,
        PRIMARY KEY (player_id, cosmetic_id)
      );
      CREATE TABLE IF NOT EXISTS account_cosmetics_selected (
        player_id TEXT NOT NULL,
        slot TEXT NOT NULL,
        cosmetic_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (player_id, slot)
      );
    `);
  }

  async listOwned(playerId: string): Promise<CosmeticId[]> {
    const rows = await withGatewaySqliteRetry(() => this.db
      .prepare("SELECT cosmetic_id FROM account_cosmetics_owned WHERE player_id = ? ORDER BY granted_at, cosmetic_id")
      .all(playerId) as Array<{ cosmetic_id: string }>);
    return rows.map((row) => row.cosmetic_id).filter(isCosmeticId);
  }

  async grant(playerId: string, cosmeticId: CosmeticId, grantRef: string): Promise<CosmeticGrantResult> {
    const result = await withGatewaySqliteRetry(() => this.db
      .prepare("INSERT OR IGNORE INTO account_cosmetics_owned(player_id, cosmetic_id, granted_at, grant_ref) VALUES (?, ?, ?, ?)")
      .run(playerId, cosmeticId, this.now(), grantRef));
    return { newlyGranted: Number(result.changes) > 0 };
  }

  async revoke(playerId: string, cosmeticId: CosmeticId): Promise<{ revoked: boolean }> {
    // A free cosmetic is owned by everyone and never stored; its selection stays.
    if (isFreeCosmetic(cosmeticId)) return { revoked: false };
    return withGatewaySqliteRetry(() => {
      this.db.exec("BEGIN IMMEDIATE;");
      try {
        const result = this.db.prepare("DELETE FROM account_cosmetics_owned WHERE player_id = ? AND cosmetic_id = ?").run(playerId, cosmeticId);
        this.db.prepare("DELETE FROM account_cosmetics_selected WHERE player_id = ? AND cosmetic_id = ?").run(playerId, cosmeticId);
        this.db.exec("COMMIT;");
        return { revoked: Number(result.changes) > 0 };
      } catch (error) {
        this.db.exec("ROLLBACK;");
        throw error;
      }
    });
  }

  async getSelection(playerId: string): Promise<PlayerCosmeticSelection> {
    const rows = await withGatewaySqliteRetry(() => this.db
      .prepare("SELECT slot, cosmetic_id FROM account_cosmetics_selected WHERE player_id = ?")
      .all(playerId) as Array<{ slot: string; cosmetic_id: string }>);
    return sanitizeCosmeticSelection(Object.fromEntries(rows.map((row) => [row.slot, row.cosmetic_id])));
  }

  async setSelection(playerId: string, slot: CosmeticSlot, cosmeticId: CosmeticId | null): Promise<PlayerCosmeticSelection> {
    if (cosmeticId !== null && cosmeticDefinition(cosmeticId)?.slot !== slot) throw new Error(`cosmetic ${cosmeticId} does not fit slot ${slot}`);
    await withGatewaySqliteRetry(() => cosmeticId === null
      ? this.db.prepare("DELETE FROM account_cosmetics_selected WHERE player_id = ? AND slot = ?").run(playerId, slot)
      : this.db.prepare(`INSERT INTO account_cosmetics_selected(player_id, slot, cosmetic_id, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(player_id, slot) DO UPDATE SET cosmetic_id = excluded.cosmetic_id, updated_at = excluded.updated_at`)
        .run(playerId, slot, cosmeticId, this.now()));
    return this.getSelection(playerId);
  }

  async listSelections(limit: number, kind: ShownLookKind): Promise<{ selections: Array<[string, PlayerCosmeticSelection]>; truncated: boolean }> {
    // Count accounts, not rows: an account has one row per slot.
    const accounts = `${ACCOUNTS_OF_KIND[kind]} ORDER BY player_id LIMIT ?`;
    const playerIds = await withGatewaySqliteRetry(() => this.db.prepare(accounts).all(limit + 1) as Array<{ player_id: string }>);
    const truncated = playerIds.length > limit;
    const rows = await withGatewaySqliteRetry(() => this.db
      .prepare(`SELECT player_id, slot, cosmetic_id FROM account_cosmetics_selected WHERE player_id IN (${accounts})`)
      .all(limit) as Array<{ player_id: string; slot: string; cosmetic_id: string }>);
    const raw = new Map<string, Record<string, string>>();
    for (const row of rows) {
      const entry = raw.get(row.player_id) ?? {};
      entry[row.slot] = row.cosmetic_id;
      raw.set(row.player_id, entry);
    }
    const selections: Array<[string, PlayerCosmeticSelection]> = [];
    for (const [playerId, entry] of raw) {
      const selection = sanitizeCosmeticSelection(entry);
      if (Object.keys(selection).length > 0) selections.push([playerId, selection]);
    }
    return { selections, truncated };
  }

  async counts(): Promise<{ owned: number; selected: number }> {
    return withGatewaySqliteRetry(() => {
      const owned = this.db.prepare("SELECT count(*) AS count FROM account_cosmetics_owned").get() as { count: number };
      const selected = this.db.prepare("SELECT count(*) AS count FROM account_cosmetics_selected").get() as { count: number };
      return { owned: owned.count, selected: selected.count };
    });
  }
}
