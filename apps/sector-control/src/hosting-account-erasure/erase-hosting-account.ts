// Erases a deleted account from the hosting database (Privacy Policy,
// "How long we keep data"; docs/agents/account-deletion.md). Run with the
// game account's deletion, by its Firebase uid, while the hosting service is
// stopped (erase-hosting-account-cli.ts).
//
// Removed: the account's memberships, its email address, its places in saved
// results (and any mention of it in their winner, House Charges and awards),
// and the account and address on every email written to it. Emails not yet sent are given
// up, so they are never sent and the sweep that writes confirmations does not
// write them again. Invite links it made are revoked.
//
// Kept, as the Swedish Bookkeeping Act and EU VAT law require: purchase
// records (the sectors it bought, its shares, consents, withdrawals,
// refunds and payment disputes), and the text of the emails that confirmed
// them, without the address.
import type { DatabaseSync } from "node:sqlite";

export type HostingErasureCounts = {
  memberships: number;
  invitesRevoked: number;
  addresses: number;
  emailsAbandoned: number;
  emailAddressesCleared: number;
  resultPlaces: number;
  resultsScrubbed: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const mentions = (value: unknown, uid: string): boolean => isRecord(value) && (value.playerId === uid || value.id === uid);

/** The details of a saved result without any entry about `uid`: a winner, a House's charges, an award, a record holder. */
export const scrubResultDetails = (value: unknown, uid: string): unknown => {
  if (Array.isArray(value)) return value.filter((entry) => !mentions(entry, uid)).map((entry) => scrubResultDetails(entry, uid));
  if (!isRecord(value)) return value;
  const kept: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!mentions(entry, uid)) kept[key] = scrubResultDetails(entry, uid);
  }
  return kept;
};

const tableExists = (db: DatabaseSync, name: string): boolean =>
  db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) !== undefined;

const changes = (result: { changes: number | bigint }): number => Number(result.changes);

/**
 * Erases `uid`. Without `apply` nothing is changed and the counts say what
 * would be. Tables an older database does not have yet are skipped.
 */
export const eraseHostingAccount = (db: DatabaseSync, uid: string, options: { apply: boolean; now: number }): HostingErasureCounts => {
  if (!uid.trim()) throw new Error("an account uid is required");
  db.exec("BEGIN IMMEDIATE");
  try {
    const counts: HostingErasureCounts = { memberships: 0, invitesRevoked: 0, addresses: 0, emailsAbandoned: 0, emailAddressesCleared: 0, resultPlaces: 0, resultsScrubbed: 0 };
    if (tableExists(db, "hosted_sector_members")) {
      counts.memberships = changes(db.prepare(`DELETE FROM hosted_sector_members WHERE account_uid = ?`).run(uid));
    }
    if (tableExists(db, "hosted_sector_invites")) {
      counts.invitesRevoked = changes(db.prepare(`UPDATE hosted_sector_invites SET revoked_at = COALESCE(revoked_at, ?), created_by = 'erased' WHERE created_by = ?`).run(options.now, uid));
    }
    if (tableExists(db, "hosted_account_emails")) {
      counts.addresses = changes(db.prepare(`DELETE FROM hosted_account_emails WHERE account_uid = ?`).run(uid));
    }
    if (tableExists(db, "hosted_email_outbox")) {
      counts.emailsAbandoned = changes(db
        .prepare(`UPDATE hosted_email_outbox SET abandoned_at = ?, last_error = 'account deleted', to_address = NULL WHERE account_uid = ? AND sent_at IS NULL AND abandoned_at IS NULL`)
        .run(options.now, uid));
      // The email keeps its key (so it is never written again) and its text, but no longer names the account or its address.
      counts.emailAddressesCleared = changes(db.prepare(`UPDATE hosted_email_outbox SET to_address = NULL, account_uid = 'erased' WHERE account_uid = ?`).run(uid));
    }
    if (tableExists(db, "hosted_result_players")) {
      counts.resultPlaces = changes(db.prepare(`DELETE FROM hosted_result_players WHERE player_id = ?`).run(uid));
    }
    if (tableExists(db, "hosted_results")) {
      // The uid is long and random, so a plain text match finds every copy that mentions it.
      const rows = db.prepare(`SELECT sector_id, details_json FROM hosted_results WHERE instr(details_json, ?) > 0`).all(uid) as Array<{ sector_id: string; details_json: string }>;
      const update = db.prepare(`UPDATE hosted_results SET details_json = ? WHERE sector_id = ?`);
      for (const row of rows) {
        const scrubbed = JSON.stringify(scrubResultDetails(JSON.parse(row.details_json), uid));
        if (scrubbed !== row.details_json) {
          update.run(scrubbed, row.sector_id);
          counts.resultsScrubbed += 1;
        }
      }
    }
    db.exec(options.apply ? "COMMIT" : "ROLLBACK");
    return counts;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};
