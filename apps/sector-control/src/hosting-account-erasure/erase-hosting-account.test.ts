import { createRequire } from "node:module";
import type { DatabaseSync as Database } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { SqliteHostingEmailOutbox } from "../hosting-email/hosting-email-outbox.js";
import { parseContestResults, SqliteHostedResultsStore } from "../hosting-results/hosted-results.js";
import { SqliteHostingStore } from "../hosting-store/sqlite-hosting-store.js";
import { eraseHostingAccount, scrubResultDetails } from "./erase-hosting-account.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

const UID = "uidGone0123456789abcdefgh";
const OTHER = "uidStays0123456789abcdefg";

const build = () => {
  const db = new DatabaseSync(":memory:");
  new SqliteHostingStore(db).applySchema();
  const outbox = new SqliteHostingEmailOutbox(db);
  outbox.applySchema();
  const results = new SqliteHostedResultsStore(db);
  results.applySchema();
  for (const uid of [UID, OTHER]) {
    db.prepare(`INSERT INTO hosted_sector_members (sector_id, account_uid, role, joined_at) VALUES ('s-1', ?, 'member', 1)`).run(uid);
    db.prepare(`INSERT INTO hosted_sector_invites (code, sector_id, created_by, created_at, expires_at) VALUES (?, 's-1', ?, 1, 99)`).run(uid === UID ? "code-a" : "code-b", uid);
    outbox.rememberAddress(uid, `${uid}@example.test`, 1);
    db.prepare(`INSERT INTO hosted_email_outbox (email_key, kind, account_uid, subject, text_body, html_body, to_address, created_at, next_attempt_at, sent_at)
      VALUES (?, 'order_confirmation', ?, 'Your order', 'text', 'html', ?, 1, 1, 2)`).run(uid === UID ? "sent-a" : "sent-b", uid, `${uid}@example.test`);
    db.prepare(`INSERT INTO hosted_email_outbox (email_key, kind, account_uid, subject, text_body, html_body, created_at, next_attempt_at)
      VALUES (?, 'sector_ready', ?, 'Ready', 'text', 'html', 1, 1)`).run(uid === UID ? "pending-a" : "pending-b", uid);
  }
  results.save("s-1", parseContestResults({
    seasonId: "x", status: "ended",
    overall: [{ id: UID, name: "Gone House", rank: 1, score: 9, tiles: 9 }, { id: OTHER, name: "Stays", rank: 2, score: 1, tiles: 1 }],
    seasonWinner: { playerId: UID, playerName: "Gone House" },
    seasonAwards: [{ kind: "NEVER_GAVE_UP", playerId: UID, playerName: "Gone House" }, { kind: "COMEBACK_KID", playerId: OTHER, playerName: "Stays" }]
  }), 5);
  return { db, outbox, results };
};

describe("erasing an account from the hosting database", () => {
  it("changes nothing on a dry run, and says what it would erase", () => {
    const { db } = build();
    const counts = eraseHostingAccount(db, UID, { apply: false, now: 10 });
    expect(counts).toEqual({ memberships: 1, invitesRevoked: 1, addresses: 1, emailsAbandoned: 1, emailAddressesCleared: 2, resultPlaces: 1, resultsScrubbed: 1 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM hosted_sector_members`).get()).toEqual({ n: 2 });
    expect(JSON.stringify(db.prepare(`SELECT * FROM hosted_results`).all())).toContain(UID);
  });

  it("removes every trace of the account and leaves other members alone", () => {
    const { db, outbox, results } = build();
    eraseHostingAccount(db, UID, { apply: true, now: 10 });
    const everything = ["hosted_sector_members", "hosted_sector_invites", "hosted_account_emails", "hosted_email_outbox", "hosted_results", "hosted_result_players"]
      .map((table) => JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all())).join("\n");
    expect(everything).not.toContain(UID);
    expect(everything).not.toContain("Gone House");
    expect(everything).toContain(OTHER);
    expect(outbox.getAddress(OTHER)).toBe(`${OTHER}@example.test`);
    // The invite it made no longer works; the email not yet sent never will be, and its key stays so it is not written again.
    expect(db.prepare(`SELECT revoked_at FROM hosted_sector_invites WHERE code = ?`).get("code-a")).toEqual({ revoked_at: 10 });
    expect(outbox.get("pending-a")).toMatchObject({ abandonedAt: 10 });
    // The order confirmation is a purchase record: kept, without the address.
    expect(outbox.get("sent-a")).toMatchObject({ subject: "Your order", sentAt: 2 });
    expect(results.get("s-1")?.standings.map((standing) => standing.playerId)).toEqual([OTHER]);
    expect(results.get("s-1")?.details).toEqual({ seasonAwards: [{ kind: "COMEBACK_KID", playerId: OTHER, playerName: "Stays" }] });
  });

  it("refuses an empty uid", () => {
    expect(() => eraseHostingAccount(build().db, " ", { apply: true, now: 1 })).toThrow("uid");
  });
});

describe("scrubResultDetails", () => {
  it("drops entries about the account wherever they sit", () => {
    expect(scrubResultDetails({ a: { b: [{ id: "u" }, { id: "v" }] }, holder: { playerId: "u" }, n: 1 }, "u")).toEqual({ a: { b: [{ id: "v" }] }, n: 1 });
  });
});
