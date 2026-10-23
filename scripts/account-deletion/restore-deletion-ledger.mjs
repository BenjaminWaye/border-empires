import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { restoreDeletedAccounts } from "./deletion-ledger.mjs";

const { values } = parseArgs({ options: {
  database: { type: "string" }, ledger: { type: "string" }, apply: { type: "boolean" }, offline: { type: "boolean" }
} });
if (!values.database || !values.ledger) throw new Error("Supply --database <restored-db> --ledger <current-deletion-ledger>");
if (values.apply && !values.offline) throw new Error("Restoration must run offline before either server starts");
const db = new DatabaseSync(values.database, { readOnly: !values.apply });
try {
  console.log(JSON.stringify(restoreDeletedAccounts(db, JSON.parse(readFileSync(values.ledger, "utf8")), { apply: values.apply }), null, 2));
  if (values.apply) db.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);");
} finally { db.close(); }
