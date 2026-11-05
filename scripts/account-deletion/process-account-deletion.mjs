import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { dirname, join } from "node:path";
import { eraseAccountData } from "./erase-account-data.mjs";
import { saveDeletionLedger } from "./deletion-ledger.mjs";

const { values } = parseArgs({ options: {
  database: { type: "string" }, request: { type: "string" }, list: { type: "boolean" }, identities: { type: "boolean" },
  apply: { type: "boolean" }, offline: { type: "boolean" }, "linked-identities-deleted": { type: "boolean" }, ledger: { type: "string" }
} });
if (!values.database) throw new Error("Supply --database /path/to/border-empires.db");
if (values.apply && (!values.offline || !values["linked-identities-deleted"])) {
  throw new Error("Stop the gateway/simulation first, verify all linked Firebase identities are deleted, then supply --offline --linked-identities-deleted");
}
const db = new DatabaseSync(values.database, { readOnly: !values.apply });
try {
  if (values.list) {
    console.log(JSON.stringify(db.prepare("SELECT request_id, requested_at, status, requested_at + 2592000000 AS complete_by FROM account_deletion_requests WHERE status != 'completed' ORDER BY requested_at").all(), null, 2));
  } else {
    if (!values.request) throw new Error("Supply --list or --request <receipt-id>; dry-run is the default");
    if (values.identities) {
      if (values.apply) throw new Error("--identities is a private read-only inspection, not an erasure command");
      console.log(JSON.stringify(db.prepare(`SELECT DISTINCT auth_uid FROM auth_identity_bindings WHERE player_id IN
        (SELECT player_id FROM account_deletion_requests WHERE request_id = ?)
        UNION SELECT auth_uid FROM account_deletion_requests WHERE request_id = ? AND auth_uid IS NOT NULL`)
        .all(values.request, values.request), null, 2));
    } else {
      const result = eraseAccountData(db, values.request, {
        apply: values.apply,
        identityDeletionConfirmed: values["linked-identities-deleted"],
        beforeCommit: () => saveDeletionLedger(db, values.ledger ?? join(dirname(values.database), "account-deletion-ledger.json"))
      });
      if (values.apply) {
        // Remove old page contents and WAL copies before the service restarts.
        db.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);");
      }
      console.log(JSON.stringify(result, null, 2));
    }
  }
} finally { db.close(); }
