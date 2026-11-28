// pnpm --filter @border-empires/sector-control erase-account --database <hosting.db> --uid <firebase uid> [--apply --offline]
// A dry run by default: prints what would be erased. docs/agents/account-deletion.md.
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";

import { eraseHostingAccount } from "./erase-hosting-account.js";

const { values } = parseArgs({ options: { database: { type: "string" }, uid: { type: "string" }, apply: { type: "boolean" }, offline: { type: "boolean" } } });
if (!values.database || !values.uid) throw new Error("Supply --database /path/to/hosting.db and --uid <the account's Firebase uid>");
if (values.apply && !values.offline) throw new Error("Stop the hosting service first, then supply --apply --offline");
// A dry run makes the changes in a transaction and rolls them back, so it opens the file for writing too.
const db = new DatabaseSync(values.database);
db.exec("PRAGMA busy_timeout = 5000;");
try {
  const counts = eraseHostingAccount(db, values.uid, { apply: values.apply === true, now: Date.now() });
  // Old page contents and WAL copies would still hold what was erased.
  if (values.apply) db.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);");
  console.log(JSON.stringify({ applied: values.apply === true, ...counts }, null, 2));
} finally {
  db.close();
}
