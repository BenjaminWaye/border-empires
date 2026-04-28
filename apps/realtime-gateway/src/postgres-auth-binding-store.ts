import { createResilientPostgresPool } from "./postgres-pool.js";
import type { GatewayAuthBindingStore, StoredAuthIdentityBinding } from "./auth-binding-store.js";

type QueryResultRow = Record<string, unknown>;

type Queryable = {
  query: <TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[]
  ) => Promise<{ rows: TRow[]; rowCount: number | null }>;
};

type AuthIdentityBindingRow = {
  auth_uid: string;
  player_id: string;
  auth_email: string | null;
  updated_at: number | string;
};

const parseDbNumber = (value: number | string | null | undefined): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const toStoredAuthIdentityBinding = (row: AuthIdentityBindingRow): StoredAuthIdentityBinding => ({
  uid: row.auth_uid,
  playerId: row.player_id,
  ...(typeof row.auth_email === "string" ? { email: row.auth_email } : {}),
  updatedAt: parseDbNumber(row.updated_at) ?? Date.now()
});

export class PostgresGatewayAuthBindingStore implements GatewayAuthBindingStore {
  constructor(private readonly db: Queryable, private readonly now: () => number = () => Date.now()) {}

  async applySchema(sql: string): Promise<void> {
    await this.db.query(sql);
  }

  async getByUid(uid: string): Promise<StoredAuthIdentityBinding | undefined> {
    const result = await this.db.query<AuthIdentityBindingRow>(
      `
      SELECT auth_uid, player_id, auth_email, updated_at
      FROM auth_identity_bindings
      WHERE auth_uid = $1
      `,
      [uid]
    );
    return result.rows[0] ? toStoredAuthIdentityBinding(result.rows[0]) : undefined;
  }

  async getByEmail(email: string): Promise<StoredAuthIdentityBinding | undefined> {
    const result = await this.db.query<AuthIdentityBindingRow>(
      `
      SELECT auth_uid, player_id, auth_email, updated_at
      FROM auth_identity_bindings
      WHERE LOWER(auth_email) = LOWER($1)
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [email]
    );
    return result.rows[0] ? toStoredAuthIdentityBinding(result.rows[0]) : undefined;
  }

  async bindIdentity(binding: { uid: string; playerId: string; email?: string }): Promise<StoredAuthIdentityBinding> {
    const now = this.now();
    const result = await this.db.query<AuthIdentityBindingRow>(
      `
      INSERT INTO auth_identity_bindings (auth_uid, player_id, auth_email, updated_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (auth_uid) DO UPDATE SET
        auth_email = COALESCE(EXCLUDED.auth_email, auth_identity_bindings.auth_email),
        updated_at = EXCLUDED.updated_at
      RETURNING auth_uid, player_id, auth_email, updated_at
      `,
      [binding.uid, binding.playerId, binding.email ?? null, now]
    );
    if (!result.rows[0]) throw new Error("failed to bind auth identity");
    return toStoredAuthIdentityBinding(result.rows[0]);
  }
}

export const createPostgresGatewayAuthBindingStore = (connectionString: string): PostgresGatewayAuthBindingStore =>
  new PostgresGatewayAuthBindingStore(
    createResilientPostgresPool(connectionString, "gateway-auth-binding-store")
  );
