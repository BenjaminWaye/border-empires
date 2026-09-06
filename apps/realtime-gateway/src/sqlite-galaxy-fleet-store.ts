import type { DatabaseSync } from "node:sqlite";

import type { FleetComposition, FleetWeaponEmphasis } from "./galaxy-fleet-config/galaxy-fleet-config.js";
import type {
  CreateFleetBlueprintInput,
  CreateFleetOrderInput,
  GalaxyFleetBlueprint,
  GalaxyFleetOrder,
  GalaxyFleetOrderOutcome,
  GalaxyFleetStore
} from "./galaxy-fleet-store/galaxy-fleet-store.js";

type BlueprintRow = {
  id: string;
  owner_auth_uid: string;
  name: string;
  composition_json: string;
  weapon_emphasis: FleetWeaponEmphasis;
  created_at: number;
};

type OrderRow = {
  id: string;
  owner_auth_uid: string;
  target_auth_uid: string;
  target_season_id: string;
  composition_json: string;
  weapon_emphasis: FleetWeaponEmphasis;
  sent_at: number;
  arrives_at: number;
  status: GalaxyFleetOrder["status"];
  resolved_at: number | null;
  outcome_json: string | null;
};

const toBlueprint = (row: BlueprintRow): GalaxyFleetBlueprint => ({
  id: row.id,
  ownerAuthUid: row.owner_auth_uid,
  name: row.name,
  composition: JSON.parse(row.composition_json) as FleetComposition,
  weaponEmphasis: row.weapon_emphasis,
  createdAt: row.created_at
});

const toOrder = (row: OrderRow): GalaxyFleetOrder => ({
  id: row.id,
  ownerAuthUid: row.owner_auth_uid,
  targetAuthUid: row.target_auth_uid,
  targetSeasonId: row.target_season_id,
  composition: JSON.parse(row.composition_json) as FleetComposition,
  weaponEmphasis: row.weapon_emphasis,
  sentAt: row.sent_at,
  arrivesAt: row.arrives_at,
  status: row.status,
  ...(row.resolved_at !== null ? { resolvedAt: row.resolved_at } : {}),
  ...(row.outcome_json !== null ? { outcome: JSON.parse(row.outcome_json) as GalaxyFleetOrderOutcome } : {})
});

export class SqliteGalaxyFleetStore implements GalaxyFleetStore {
  private nextBlueprintId = 1;
  private nextOrderId = 1;

  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS galaxy_fleet_blueprints (
        id TEXT PRIMARY KEY,
        owner_auth_uid TEXT NOT NULL,
        name TEXT NOT NULL,
        composition_json TEXT NOT NULL,
        weapon_emphasis TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS galaxy_fleet_blueprints_owner_idx ON galaxy_fleet_blueprints (owner_auth_uid);
      CREATE TABLE IF NOT EXISTS galaxy_fleet_orders (
        id TEXT PRIMARY KEY,
        owner_auth_uid TEXT NOT NULL,
        target_auth_uid TEXT NOT NULL,
        target_season_id TEXT NOT NULL,
        composition_json TEXT NOT NULL,
        weapon_emphasis TEXT NOT NULL,
        sent_at INTEGER NOT NULL,
        arrives_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        resolved_at INTEGER,
        outcome_json TEXT
      );
      CREATE INDEX IF NOT EXISTS galaxy_fleet_orders_owner_idx ON galaxy_fleet_orders (owner_auth_uid);
      CREATE INDEX IF NOT EXISTS galaxy_fleet_orders_status_arrives_idx ON galaxy_fleet_orders (status, arrives_at);
    `);
  }

  private nextBlueprintIdFor(): string {
    if (this.nextBlueprintId === 1) {
      const row = this.db.prepare(`SELECT id FROM galaxy_fleet_blueprints ORDER BY rowid DESC LIMIT 1`).get() as { id: string } | undefined;
      const match = row?.id.match(/^fleet-blueprint-(\d+)$/);
      if (match?.[1]) this.nextBlueprintId = Number.parseInt(match[1], 10) + 1;
    }
    return `fleet-blueprint-${this.nextBlueprintId++}`;
  }

  private nextOrderIdFor(): string {
    if (this.nextOrderId === 1) {
      const row = this.db.prepare(`SELECT id FROM galaxy_fleet_orders ORDER BY rowid DESC LIMIT 1`).get() as { id: string } | undefined;
      const match = row?.id.match(/^fleet-order-(\d+)$/);
      if (match?.[1]) this.nextOrderId = Number.parseInt(match[1], 10) + 1;
    }
    return `fleet-order-${this.nextOrderId++}`;
  }

  async saveBlueprint(input: CreateFleetBlueprintInput): Promise<GalaxyFleetBlueprint> {
    const id = this.nextBlueprintIdFor();
    this.db
      .prepare(`INSERT INTO galaxy_fleet_blueprints (id, owner_auth_uid, name, composition_json, weapon_emphasis, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, input.ownerAuthUid, input.name, JSON.stringify(input.composition), input.weaponEmphasis, input.createdAt);
    const row = this.db.prepare(`SELECT * FROM galaxy_fleet_blueprints WHERE id = ?`).get(id) as BlueprintRow;
    return toBlueprint(row);
  }

  async listBlueprints(ownerAuthUid: string): Promise<GalaxyFleetBlueprint[]> {
    const rows = this.db
      .prepare(`SELECT * FROM galaxy_fleet_blueprints WHERE owner_auth_uid = ? ORDER BY created_at DESC`)
      .all(ownerAuthUid) as BlueprintRow[];
    return rows.map(toBlueprint);
  }

  async deleteBlueprint(id: string, ownerAuthUid: string): Promise<void> {
    this.db.prepare(`DELETE FROM galaxy_fleet_blueprints WHERE id = ? AND owner_auth_uid = ?`).run(id, ownerAuthUid);
  }

  async createOrder(input: CreateFleetOrderInput): Promise<GalaxyFleetOrder> {
    const id = this.nextOrderIdFor();
    this.db
      .prepare(
        `INSERT INTO galaxy_fleet_orders
           (id, owner_auth_uid, target_auth_uid, target_season_id, composition_json, weapon_emphasis, sent_at, arrives_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TRAVELING')`
      )
      .run(
        id,
        input.ownerAuthUid,
        input.targetAuthUid,
        input.targetSeasonId,
        JSON.stringify(input.composition),
        input.weaponEmphasis,
        input.sentAt,
        input.arrivesAt
      );
    const row = this.db.prepare(`SELECT * FROM galaxy_fleet_orders WHERE id = ?`).get(id) as OrderRow;
    return toOrder(row);
  }

  async getOrder(id: string): Promise<GalaxyFleetOrder | undefined> {
    const row = this.db.prepare(`SELECT * FROM galaxy_fleet_orders WHERE id = ?`).get(id) as OrderRow | undefined;
    return row ? toOrder(row) : undefined;
  }

  async getArrivedTravelingOrders(now: number): Promise<GalaxyFleetOrder[]> {
    const rows = this.db
      .prepare(`SELECT * FROM galaxy_fleet_orders WHERE status = 'TRAVELING' AND arrives_at <= ?`)
      .all(now) as OrderRow[];
    return rows.map(toOrder);
  }

  async listOrdersForOwner(ownerAuthUid: string): Promise<GalaxyFleetOrder[]> {
    const rows = this.db
      .prepare(`SELECT * FROM galaxy_fleet_orders WHERE owner_auth_uid = ? ORDER BY sent_at DESC`)
      .all(ownerAuthUid) as OrderRow[];
    return rows.map(toOrder);
  }

  async resolveOrder(id: string, input: { resolvedAt: number; outcome: GalaxyFleetOrderOutcome }): Promise<void> {
    this.db
      .prepare(`UPDATE galaxy_fleet_orders SET status = 'RESOLVED', resolved_at = ?, outcome_json = ? WHERE id = ?`)
      .run(input.resolvedAt, JSON.stringify(input.outcome), id);
  }
}
