import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { eraseAccountData } from "./erase-account-data.mjs";

const HASH_RETENTION_MS = 45 * 86_400_000;
export const saveDeletionLedger = (db, path, now = Date.now()) => {
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { version: 1, deletions: [] };
  if (previous.version !== 1 || !Array.isArray(previous.deletions)) throw new Error("Invalid deletion ledger");
  const current = db.prepare("SELECT uid_hash, request_id, completed_at FROM account_deletion_requests WHERE status = 'completed'").all();
  const deletions = [...new Map([...previous.deletions, ...current].filter((row) => row.completed_at >= now - HASH_RETENTION_MS)
    .map((row) => [row.uid_hash, { uid_hash: row.uid_hash, request_id: row.request_id, completed_at: row.completed_at }])).values()];
  if (deletions.length > 50_000) throw new Error("Deletion ledger capacity reached; review expired backups before retrying");
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify({ version: 1, deletions }, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, path);
};

/** Apply the current deletion ledger to an OLD backup before allowing traffic. */
export const restoreDeletedAccounts = (db, ledger, { apply = false, now = Date.now() } = {}) => {
  if (ledger.version !== 1 || !Array.isArray(ledger.deletions)) throw new Error("Invalid deletion ledger");
  if (ledger.deletions.length > 50_000) throw new Error("Deletion ledger capacity reached");
  const deleted = new Map(ledger.deletions.map((row) => [row.uid_hash, row]));
  const bindings = db.prepare("SELECT auth_uid, player_id FROM auth_identity_bindings").all();
  const matches = bindings.flatMap((binding) => {
    const receipt = deleted.get(createHash("sha256").update(binding.auth_uid).digest("hex"));
    return receipt ? [{ binding, receipt }] : [];
  });
  if (!apply) return { matchedAccounts: matches.length, applied: false };
  db.exec(`CREATE TABLE IF NOT EXISTS account_deletion_requests (
    uid_hash TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, auth_uid TEXT, player_id TEXT,
    requested_at INTEGER NOT NULL, status TEXT NOT NULL, completed_at INTEGER
  )`);
  for (const { binding, receipt } of matches) {
    db.prepare(`INSERT INTO account_deletion_requests(uid_hash, request_id, auth_uid, player_id, requested_at, status)
      VALUES (?, ?, ?, ?, ?, 'pending') ON CONFLICT(uid_hash) DO UPDATE SET
      auth_uid = excluded.auth_uid, player_id = excluded.player_id, status = 'pending'`)
      .run(receipt.uid_hash, receipt.request_id, binding.auth_uid, binding.player_id, receipt.completed_at);
    eraseAccountData(db, receipt.request_id, { apply: true, now });
  }
  // Preserve replay protection even for identities whose bindings weren't in
  // this particular backup. The external ledger remains the restore authority.
  db.exec("BEGIN EXCLUSIVE;");
  try {
    const marker = db.prepare(`INSERT INTO account_deletion_requests(uid_hash, request_id, requested_at, status, completed_at)
      VALUES (?, ?, ?, 'completed', ?) ON CONFLICT(uid_hash) DO NOTHING`);
    for (const receipt of deleted.values()) marker.run(receipt.uid_hash, receipt.request_id, receipt.completed_at, receipt.completed_at);
    if (db.prepare("SELECT count(*) AS n FROM account_deletion_requests").get().n > 50_000) throw new Error("Restored deletion marker capacity reached; keep service offline");
    db.exec("COMMIT;");
  } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return { matchedAccounts: matches.length, applied: true };
};
