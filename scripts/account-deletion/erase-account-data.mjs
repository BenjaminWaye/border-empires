import { createHash, randomUUID } from "node:crypto";

const PERSONAL_TABLES = new Set([
  "auth_identity_bindings", "player_profiles", "player_growth_baseline", "player_funnel",
  "player_funnel_session", "rally_links", "season_participation", "social_players",
  "social_alliance_requests", "social_truce_requests", "social_offer_cooldowns",
  "social_forced_truce_cooldowns", "social_truce_lockouts", "social_truce_breaks",
  "commands", "client_seq_watermarks", "galaxy_survey_snapshot", "galaxy_economy_balances",
  "galaxy_fleet_blueprints", "galaxy_fleet_orders", "galaxy_endorsements", "galaxy_senate_votes",
  "galaxy_court_contributions"
]);
const SHARED_TABLES = new Set([
  "world_snapshots", "world_events", "world_status_current", "season_archive", "season_deadliest_tiles",
  "season_activity_logs", "command_results", "social_alliances", "social_alliance_breaks",
  "social_completed_alliance_breaks", "social_active_truces", "galaxy_planets",
  "galaxy_territory_stability", "galaxy_battle_log", "galaxy_senate_proposals", "galaxy_contested_queue",
  "galaxy_ownership_transfers", "galaxy_duke_state", "galaxy_court_era", "galaxy_hall_of_fame",
  "sovereign_siege_engine_strikes", "player_funnel_acquisition"
]);
const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
const isIdentityKey = (key) => /^(?:id|uid|playerId|authUid|ownerId|ownerAuthUid|player_id|auth_uid|owner_auth_uid)$/i.test(key);
const isPersonalName = (key) => /^(?:name|displayName|playerName|player_name|display_name|empireName|countryFlag|country_flag)$/i.test(key);
const isPrivateField = (key) => /^(?:email|authEmail|auth_email|emailAddress|ipAddress|ip|userAgent|refreshToken|idToken|accessToken|password|providerData)$/i.test(key);

/** Keep the multiplayer world's references consistent while severing account identity. */
export const anonymizeJson = (value, replacements, owned = false) => {
  if (typeof value === "string") {
    if (replacements.has(value)) return replacements.get(value);
    // Several wire/snapshot fields contain a second JSON-encoded object.
    if (value.startsWith("{") || value.startsWith("[")) {
      try { return JSON.stringify(anonymizeJson(JSON.parse(value), replacements, owned)); } catch { /* plain text */ }
    }
    let result = value;
    for (const [oldId, newId] of replacements) {
      if (oldId.length >= 20) { result = result.replaceAll(oldId, newId); continue; }
      // Composite keys/synthetic command IDs embed identity. Use boundaries for
      // short legacy IDs so deleting "p1" never changes the unrelated "p10".
      const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "g"), newId);
    }
    return result;
  }
  if (Array.isArray(value)) {
    const tupleOwned = typeof value[0] === "string" && replacements.has(value[0]);
    return value.map((entry) => anonymizeJson(entry, replacements, owned || tupleOwned));
  }
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value);
  const explicitIdentities = entries.filter(([key, entry]) => isIdentityKey(key) && typeof entry === "string");
  const localOwned = explicitIdentities.length ? explicitIdentities.some(([, entry]) => replacements.has(entry)) : owned;
  return Object.fromEntries(entries.filter(([key]) => !localOwned || !isPrivateField(key)).map(([key, entry]) => [
    replacements.get(key) ?? key,
    localOwned && isPersonalName(key) ? (key.toLowerCase().includes("flag") ? "" : "Deleted empire") :
      anonymizeJson(entry, replacements, localOwned || replacements.has(key))
  ]));
};

/** Run ONLY after the gateway and simulation have stopped and checkpointed. */
export const eraseAccountData = (db, requestId, { apply = false, now = Date.now(), beforeCommit, identityDeletionConfirmed = false } = {}) => {
  const request = db.prepare("SELECT * FROM account_deletion_requests WHERE request_id = ?").get(requestId);
  if (!request) throw new Error("Deletion request not found");
  if (request.status === "completed") return { completed: true, changedRows: 0, deletedRows: 0, tables: [] };
  if ((request.status !== "pending" && !(request.status === "awaiting_identity" && identityDeletionConfirmed)) || !request.auth_uid || !request.player_id) throw new Error("Firebase identity deletion must be confirmed before erasing game data");
  const bindings = db.prepare("SELECT auth_uid FROM auth_identity_bindings WHERE player_id = ?").all(request.player_id);
  const identities = new Set([request.auth_uid, request.player_id, ...bindings.map((binding) => binding.auth_uid)]);
  const replacements = new Map([...identities].map((id) => [id, `deleted-${randomUUID()}`]));
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const result = { completed: false, changedRows: 0, deletedRows: 0, tables: [] };
  if (apply) {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON; BEGIN EXCLUSIVE; PRAGMA defer_foreign_keys = ON;");
  }
  try {
    // command_results has an FK to commands; normal application schema uses ON
    // DELETE CASCADE. Nothing else should point to personal rows by SQL FK.
    for (const { name: table } of tables) {
      if (table === "account_deletion_requests") continue;
      const columns = db.prepare(`PRAGMA table_info(${quote(table)})`).all();
      const textColumns = columns.filter((column) => /TEXT|CHAR|CLOB/i.test(column.type)).map((column) => column.name);
      if (!textColumns.length) continue;
      const needles = [...identities];
      const predicates = textColumns.flatMap((column) => needles.map(() => `instr(${quote(column)}, ?) > 0`));
      const params = textColumns.flatMap(() => needles);
      const rows = db.prepare(`SELECT rowid AS __rowid, * FROM ${quote(table)} WHERE ${predicates.join(" OR ")}`).all(...params);
      if (!rows.length) continue;
      let changed = false;
      for (const row of rows) {
        const owned = textColumns.some((column) => identities.has(row[column]));
        if (PERSONAL_TABLES.has(table) && owned) {
          if (apply) db.prepare(`DELETE FROM ${quote(table)} WHERE rowid = ?`).run(row.__rowid);
          result.deletedRows += 1;
          changed = true;
          continue;
        }
        const updates = [];
        for (const column of textColumns) {
          const value = row[column];
          if (typeof value !== "string") continue;
          let next;
          try { next = JSON.stringify(anonymizeJson(JSON.parse(value), replacements, owned)); }
          catch { next = anonymizeJson(value, replacements, owned); }
          if (owned && isPersonalName(column)) next = column.toLowerCase().includes("flag") ? "" : "Deleted empire";
          if (owned && isPrivateField(column)) next = "";
          // Social request/history names correlate to their corresponding IDs.
          if (column === "from_name" && identities.has(row.from_player_id)) next = "Deleted empire";
          if (column === "to_name" && identities.has(row.to_player_id)) next = "Deleted empire";
          if (column === "planet_name" && identities.has(row.owner_auth_uid)) next = "Unnamed planet";
          if (next !== value) updates.push([column, next]);
        }
        if (!updates.length) continue;
        if (!PERSONAL_TABLES.has(table) && !SHARED_TABLES.has(table)) throw new Error(`Unclassified identity-bearing table: ${table}. Add an explicit erasure policy before processing.`);
        if (apply) db.prepare(`UPDATE ${quote(table)} SET ${updates.map(([column]) => `${quote(column)} = ?`).join(", ")} WHERE rowid = ?`)
          .run(...updates.map(([, value]) => value), row.__rowid);
        result.changedRows += 1;
        changed = true;
      }
      if (changed) result.tables.push(table);
    }
    if (apply) {
      // Retain a bounded token-replay tombstone and receipt, never an identity
      // mapping. Other requests for the same game account are also completed.
      db.prepare("UPDATE account_deletion_requests SET auth_uid = NULL, player_id = NULL, status = 'completed', completed_at = ? WHERE player_id = ?")
        .run(now, request.player_id);
      // A backup may predate the most recent login UID. Preserve hashes for
      // every linked login so restoring that older binding cannot revive data.
      for (const uid of new Set([request.auth_uid, ...bindings.map((binding) => binding.auth_uid)])) {
        const hash = createHash("sha256").update(uid).digest("hex");
        db.prepare(`INSERT INTO account_deletion_requests(uid_hash, request_id, requested_at, status, completed_at)
          VALUES (?, ?, ?, 'completed', ?) ON CONFLICT(uid_hash) DO UPDATE SET
          auth_uid = NULL, player_id = NULL, status = 'completed', completed_at = excluded.completed_at`)
          .run(hash, `${requestId}:${hash.slice(0, 16)}`, request.requested_at, now);
      }
      // Linked aliases also consume storage. Fail and roll back rather than
      // dropping the markers needed to safely restore an older backup.
      if (db.prepare("SELECT count(*) AS n FROM account_deletion_requests").get().n > 50_000) {
        throw new Error("Deletion marker capacity reached; review expired backups/markers before retrying");
      }
      const violations = db.prepare("PRAGMA foreign_key_check").all();
      if (violations.length) throw new Error("Erasure would leave broken foreign keys");
      beforeCommit?.();
      db.exec("COMMIT;");
      result.completed = true;
    }
    return result;
  } catch (error) {
    if (apply) db.exec("ROLLBACK;");
    throw error;
  }
};
