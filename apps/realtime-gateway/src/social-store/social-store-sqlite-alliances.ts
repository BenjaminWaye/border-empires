// Alliance and alliance-offer rows for SqliteGatewaySocialStore, extracted out
// of social-store-sqlite.ts to keep it under the repo's 500-line cap. Both
// carry the recorded fealty (alliance-fealty.ts in shared) as fealty_json; a
// row from before that column existed has NULL and reads plain "Alliance".
import type { DatabaseSync } from "node:sqlite";
import { parseAllianceFealty, type AllianceFealty } from "@border-empires/shared";

import type { SocialAllianceRequest } from "../social-state/social-state.js";
import { orderedPair } from "./social-store.js";

/** Adds fealty_json to the alliance and alliance-offer tables (added after both shipped). */
export const applyAllianceFealtySchema = (db: DatabaseSync): void => {
  for (const table of ["social_alliances", "social_alliance_requests"]) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((column) => column.name === "fealty_json")) db.exec(`ALTER TABLE ${table} ADD COLUMN fealty_json TEXT`);
  }
};

const fealtyJson = (fealty: AllianceFealty | undefined): string | null => (fealty ? JSON.stringify(fealty) : null);

/** The recorded fealty in a fealty_json column; a missing or unreadable one is treated as never recorded. */
export const fealtyFromJson = (json: string | null | undefined): { fealty?: AllianceFealty } => {
  if (!json) return {};
  try {
    const fealty = parseAllianceFealty(JSON.parse(json));
    return fealty ? { fealty } : {};
  } catch {
    return {};
  }
};

export const saveAllianceRequestRow = (db: DatabaseSync, request: SocialAllianceRequest): void => {
  db.prepare(
    `INSERT INTO social_alliance_requests (id, from_player_id, to_player_id, created_at, from_name, to_name, terms_json, settlement_phase, fealty_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       from_player_id = excluded.from_player_id,
       to_player_id = excluded.to_player_id,
       created_at = excluded.created_at,
       from_name = excluded.from_name,
       to_name = excluded.to_name,
       terms_json = excluded.terms_json,
       settlement_phase = excluded.settlement_phase,
       fealty_json = excluded.fealty_json`
  ).run(
    request.id,
    request.fromPlayerId,
    request.toPlayerId,
    request.createdAt,
    request.fromName ?? null,
    request.toName ?? null,
    request.terms ? JSON.stringify(request.terms) : null,
    request.settlementPhase ?? null,
    fealtyJson(request.fealty)
  );
};

export const addAllianceRow = (db: DatabaseSync, playerAId: string, playerBId: string, createdAt: number, fealty?: AllianceFealty): void => {
  const [aId, bId] = orderedPair(playerAId, playerBId);
  db.prepare(
    `INSERT INTO social_alliances (player_a_id, player_b_id, created_at, fealty_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(player_a_id, player_b_id) DO UPDATE SET created_at = excluded.created_at, fealty_json = excluded.fealty_json`
  ).run(aId, bId, createdAt, fealtyJson(fealty));
};
