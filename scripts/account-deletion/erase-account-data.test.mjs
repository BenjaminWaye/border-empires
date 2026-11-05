import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anonymizeJson, eraseAccountData } from "./erase-account-data.mjs";
import { restoreDeletedAccounts, saveDeletionLedger } from "./deletion-ledger.mjs";

const fixture = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE account_deletion_requests(uid_hash TEXT PRIMARY KEY, request_id TEXT, auth_uid TEXT, player_id TEXT, requested_at INTEGER, status TEXT, completed_at INTEGER);
    INSERT INTO account_deletion_requests VALUES('hash', 'receipt', 'auth-user-1', 'p1', 1, 'pending', NULL);
    CREATE TABLE auth_identity_bindings(auth_uid TEXT PRIMARY KEY, player_id TEXT, auth_email TEXT);
    INSERT INTO auth_identity_bindings VALUES('auth-user-1', 'p1', 'removed@example.invalid'), ('auth-linked-1', 'p1', NULL), ('auth-user-2', 'p10', 'kept@example.invalid');
    CREATE TABLE player_profiles(player_id TEXT PRIMARY KEY, display_name TEXT, country_flag TEXT);
    INSERT INTO player_profiles VALUES('p1', 'Private name', 'SE'), ('p10', 'Other player', 'FI');
    CREATE TABLE social_players(player_id TEXT PRIMARY KEY, name TEXT);
    INSERT INTO social_players VALUES('p1', 'Private name'), ('p10', 'Other player');
    CREATE TABLE commands(command_id TEXT PRIMARY KEY, player_id TEXT, payload_json TEXT);
    INSERT INTO commands VALUES('c1', 'p1', '{}'), ('c2', 'p10', '{}');
    CREATE TABLE command_results(command_id TEXT PRIMARY KEY REFERENCES commands(command_id) ON DELETE CASCADE, status TEXT);
    INSERT INTO command_results VALUES('c1', 'QUEUED'), ('c2', 'QUEUED');
    CREATE TABLE world_snapshots(snapshot_payload TEXT);
    CREATE TABLE world_events(player_id TEXT, event_payload TEXT);
    CREATE TABLE social_alliances(player_a_id TEXT, player_b_id TEXT);
    INSERT INTO social_alliances VALUES('p1', 'p10');
    CREATE TABLE galaxy_planets(owner_auth_uid TEXT, planet_name TEXT);
    INSERT INTO galaxy_planets VALUES('auth-user-1', 'Private home'), ('auth-user-2', 'Other home');`);
  const snapshot = { initialState: {
    players: [{ id: "p1", name: "Private name", gold: 12 }, { id: "p10", name: "Other player", gold: 22 }],
    tiles: [{ ownerId: "p1", x: 1, y: 2 }, { ownerId: "p10", x: 2, y: 2 }]
  }, frontier: [["p1", { playerName: "Private name", targetId: "p10" }]] };
  db.prepare("INSERT INTO world_snapshots VALUES(?)").run(JSON.stringify(snapshot));
  db.prepare("UPDATE account_deletion_requests SET uid_hash = ?").run(createHash("sha256").update("auth-user-1").digest("hex"));
  db.prepare("INSERT INTO world_events VALUES(?, ?)").run("p1", JSON.stringify({ playerId: "p1", payloadJson: JSON.stringify({ displayName: "Private name" }) }));
  return { db, snapshot };
};

test("erases identity/profile/queued commands, anonymises recovery data consistently and preserves neighbours", () => {
  const { db } = fixture();
  try {
    const result = eraseAccountData(db, "receipt", { apply: true, now: 50 });
    assert.equal(result.completed, true);
    assert.deepEqual(db.prepare("SELECT * FROM player_profiles").all().map((row) => ({ ...row })), [{ player_id: "p10", display_name: "Other player", country_flag: "FI" }]);
    assert.equal(db.prepare("SELECT count(*) AS n FROM auth_identity_bindings").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM command_results WHERE command_id = 'c1'").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM command_results WHERE command_id = 'c2'").get().n, 1);
    const raw = db.prepare("SELECT snapshot_payload FROM world_snapshots").get().snapshot_payload;
    const snapshot = JSON.parse(raw);
    const anon = snapshot.initialState.players[0].id;
    assert.match(anon, /^deleted-/);
    assert.equal(snapshot.initialState.players[0].name, "Deleted empire");
    assert.equal(snapshot.initialState.tiles[0].ownerId, anon);
    assert.equal(snapshot.frontier[0][0], anon);
    assert.equal(snapshot.frontier[0][1].playerName, "Deleted empire");
    assert.equal(snapshot.initialState.players[1].id, "p10");
    assert.equal(snapshot.initialState.players[1].name, "Other player");
    assert.equal(snapshot.initialState.tiles[1].ownerId, "p10");
    const event = db.prepare("SELECT * FROM world_events").get();
    assert.equal(event.player_id, anon);
    assert.equal(JSON.parse(JSON.parse(event.event_payload).payloadJson).displayName, "Deleted empire");
    assert.equal(db.prepare("SELECT player_a_id FROM social_alliances").get().player_a_id, anon);
    assert.equal(db.prepare("SELECT planet_name FROM galaxy_planets WHERE owner_auth_uid != 'auth-user-2'").get().planet_name, "Unnamed planet");
    const request = db.prepare("SELECT * FROM account_deletion_requests").get();
    assert.equal(request.auth_uid, null);
    assert.equal(request.player_id, null);
    assert.equal(request.status, "completed");
    assert.equal(request.completed_at, 50);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(eraseAccountData(db, "receipt", { apply: true }).changedRows, 0);
  } finally { db.close(); }
});

test("dry run makes no changes", () => {
  const { db, snapshot } = fixture();
  try {
    const result = eraseAccountData(db, "receipt");
    assert.equal(result.completed, false);
    assert.ok(result.changedRows > 0);
    assert.deepEqual(JSON.parse(db.prepare("SELECT snapshot_payload FROM world_snapshots").get().snapshot_payload), snapshot);
    assert.equal(db.prepare("SELECT status FROM account_deletion_requests").get().status, "pending");
    assert.equal(db.prepare("SELECT count(*) AS n FROM player_profiles").get().n, 2);
  } finally { db.close(); }
});

test("unknown identity-bearing stores stop the entire transaction rather than silently omit data", () => {
  const { db } = fixture();
  try {
    db.exec("CREATE TABLE z_new_personal_store(auth_uid TEXT); INSERT INTO z_new_personal_store VALUES('auth-user-1');");
    assert.throws(() => eraseAccountData(db, "receipt", { apply: true }), /Unclassified/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM player_profiles").get().n, 2);
    assert.equal(db.prepare("SELECT count(*) AS n FROM auth_identity_bindings").get().n, 3);
    assert.equal(db.prepare("SELECT status FROM account_deletion_requests").get().status, "pending");
  } finally { db.close(); }
});

test("does not change similarly prefixed identities and handles nested JSON/composite keys", () => {
  const replacements = new Map([["p1", "deleted-one"]]);
  assert.equal(anonymizeJson("p10", replacements), "p10");
  assert.equal(anonymizeJson("p1|p10", replacements), "deleted-one|p10");
  assert.deepEqual(anonymizeJson({ p1: { name: "Private name" }, p10: { name: "Other player" } }, replacements),
    { "deleted-one": { name: "Deleted empire" }, p10: { name: "Other player" } });
  assert.deepEqual(anonymizeJson({ uid: "p1", email: "private@example.invalid", ipAddress: "192.0.2.1", name: "Private name" }, replacements),
    { uid: "deleted-one", name: "Deleted empire" });
});

test("never processes an unconfirmed Firebase identity deletion", () => {
  const { db } = fixture();
  try {
    db.exec("UPDATE account_deletion_requests SET status = 'awaiting_identity'");
    assert.throws(() => eraseAccountData(db, "receipt", { apply: true }), /Firebase/);
  } finally { db.close(); }
});

test("operator can recover an interrupted identity deletion only with an explicit assertion", () => {
  const { db } = fixture();
  try {
    db.exec("UPDATE account_deletion_requests SET status = 'awaiting_identity'");
    const result = eraseAccountData(db, "receipt", { apply: true, identityDeletionConfirmed: true });
    assert.equal(result.completed, true);
    assert.equal(db.prepare("SELECT count(*) AS n FROM player_profiles WHERE player_id = 'p1'").get().n, 0);
  } finally { db.close(); }
});

test("restoration retains replay markers for accounts absent from the old backup", () => {
  const { db } = fixture();
  try {
    const hash = createHash("sha256").update("account-not-in-backup").digest("hex");
    const ledger = { version: 1, deletions: [{ uid_hash: hash, request_id: "other-receipt", completed_at: 50 }] };
    assert.equal(restoreDeletedAccounts(db, ledger, { apply: true, now: 60 }).matchedAccounts, 0);
    const marker = db.prepare("SELECT status, auth_uid, player_id FROM account_deletion_requests WHERE uid_hash = ?").get(hash);
    assert.deepEqual({ ...marker }, { status: "completed", auth_uid: null, player_id: null });
    assert.equal(db.prepare("SELECT count(*) AS n FROM player_profiles").get().n, 2);
  } finally { db.close(); }
});

test("restoring an older backup reapplies deletion using every linked UID, without retaining identity mappings", () => {
  const { db } = fixture();
  const { db: backup } = fixture();
  const directory = mkdtempSync(join(tmpdir(), "be-erasure-ledger-"));
  const path = join(directory, "ledger.json");
  try {
    eraseAccountData(db, "receipt", { apply: true, now: 50, beforeCommit: () => saveDeletionLedger(db, path, 50) });
    const text = readFileSync(path, "utf8");
    assert.equal(text.includes("auth-user-1"), false);
    assert.equal(text.includes("auth-linked-1"), false);
    assert.equal(text.includes("Private name"), false);
    // The backup predates the latest login: only its older alias survives.
    backup.exec("DELETE FROM auth_identity_bindings WHERE auth_uid = 'auth-user-1'; DROP TABLE account_deletion_requests;");
    const ledger = JSON.parse(text);
    assert.equal(restoreDeletedAccounts(backup, ledger).matchedAccounts, 1);
    assert.equal(backup.prepare("SELECT count(*) AS n FROM player_profiles").get().n, 2);
    const applied = restoreDeletedAccounts(backup, ledger, { apply: true, now: 60 });
    assert.equal(applied.applied, true);
    assert.equal(backup.prepare("SELECT count(*) AS n FROM player_profiles WHERE player_id = 'p1'").get().n, 0);
    assert.equal(backup.prepare("SELECT count(*) AS n FROM auth_identity_bindings WHERE player_id = 'p1'").get().n, 0);
    assert.equal(backup.prepare("SELECT count(*) AS n FROM player_profiles WHERE player_id = 'p10'").get().n, 1);
    assert.equal(restoreDeletedAccounts(backup, ledger).matchedAccounts, 0);
  } finally { db.close(); backup.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("does not commit erasure when the restoration ledger could not be saved", () => {
  const { db } = fixture();
  try {
    assert.throws(() => eraseAccountData(db, "receipt", { apply: true, beforeCommit: () => { throw new Error("disk full"); } }), /disk full/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM player_profiles").get().n, 2);
    assert.equal(db.prepare("SELECT status FROM account_deletion_requests").get().status, "pending");
  } finally { db.close(); }
});
