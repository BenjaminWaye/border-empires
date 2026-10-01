import { createRequire } from "node:module";
import { once } from "node:events";
import { Worker } from "node:worker_threads";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "./auth-binding-store.js";
import { SqliteGatewayAuthBindingStore } from "../sqlite-auth-binding-store.js";

type Database = { exec(sql: string): void; close(): void };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

describe("InMemoryGatewayAuthBindingStore", () => {
  it("creates a new binding on first auth uid", async () => {
    const store = new InMemoryGatewayAuthBindingStore(() => 1_000);

    await expect(store.bindIdentity({ uid: "firebase-user-1", playerId: "player-1", email: "nauticus@example.com" })).resolves.toEqual({
      uid: "firebase-user-1",
      playerId: "player-1",
      email: "nauticus@example.com",
      updatedAt: 1_000
    });
  });

  it("keeps the original player binding for the same uid", async () => {
    let now = 1_000;
    const store = new InMemoryGatewayAuthBindingStore(() => now);

    await store.bindIdentity({ uid: "firebase-user-1", playerId: "player-1", email: "nauticus@example.com" });
    now = 2_000;

    await expect(store.bindIdentity({ uid: "firebase-user-1", playerId: "player-9", email: "nauticus+new@example.com" })).resolves.toEqual({
      uid: "firebase-user-1",
      playerId: "player-1",
      email: "nauticus+new@example.com",
      updatedAt: 2_000
    });
    await expect(store.getByUid("firebase-user-1")).resolves.toEqual({
      uid: "firebase-user-1",
      playerId: "player-1",
      email: "nauticus+new@example.com",
      updatedAt: 2_000
    });
  });

  it("finds the most recent binding by email", async () => {
    let now = 1_000;
    const store = new InMemoryGatewayAuthBindingStore(() => now);

    await store.bindIdentity({ uid: "firebase-user-1", playerId: "player-1", email: "nauticus@example.com" });
    now = 2_000;
    await store.bindIdentity({ uid: "firebase-user-2", playerId: "player-9", email: "NAUTICUS@example.com" });

    await expect(store.getByEmail("nauticus@example.com")).resolves.toEqual({
      uid: "firebase-user-2",
      playerId: "player-9",
      email: "NAUTICUS@example.com",
      updatedAt: 2_000
    });
  });

  it("finds the most recent binding by player id", async () => {
    let now = 1_000;
    const store = new InMemoryGatewayAuthBindingStore(() => now);

    await store.bindIdentity({ uid: "firebase-user-1", playerId: "player-1", email: "old@example.com" });
    now = 2_000;
    await store.bindIdentity({ uid: "firebase-user-2", playerId: "player-1", email: "new@example.com" });

    await expect(store.getByPlayerId("player-1")).resolves.toEqual({
      uid: "firebase-user-2",
      playerId: "player-1",
      email: "new@example.com",
      updatedAt: 2_000
    });
  });

  it("lists one binding per player id, only for players with an email, preferring the latest", async () => {
    let now = 1_000;
    const store = new InMemoryGatewayAuthBindingStore(() => now);

    await store.bindIdentity({ uid: "firebase-user-1", playerId: "player-1", email: "old@example.com" });
    now = 2_000;
    await store.bindIdentity({ uid: "firebase-user-2", playerId: "player-1", email: "new@example.com" });
    await store.bindIdentity({ uid: "firebase-user-3", playerId: "player-2" });
    now = 3_000;
    await store.bindIdentity({ uid: "firebase-user-4", playerId: "player-3", email: "third@example.com" });

    const listed = await store.listAllWithEmail();
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerId: "player-1", email: "new@example.com" }),
        expect.objectContaining({ playerId: "player-3", email: "third@example.com" })
      ])
    );
  });
});

describe("SqliteGatewayAuthBindingStore", () => {
  it("retries a contended first-time guest binding without blocking other gateway work", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "be-auth-binding-contention-"));
    const sqlitePath = path.join(dir, "world.db");
    const db = new DatabaseSync(sqlitePath);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 100;");
    const store = new SqliteGatewayAuthBindingStore(db as ConstructorParameters<typeof SqliteGatewayAuthBindingStore>[0]);
    await store.applySchema();
    const blocker = new Worker(`
      const { parentPort, workerData } = require("node:worker_threads");
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(workerData);
      db.exec("PRAGMA busy_timeout = 1000; BEGIN IMMEDIATE;");
      parentPort.postMessage("locked");
      setTimeout(() => { db.exec("COMMIT"); db.close(); parentPort.postMessage("released"); }, 900);
    `, { eval: true, workerData: sqlitePath });
    try {
      await once(blocker, "message");
      const startedAt = Date.now();
      let timerElapsedMs = Number.POSITIVE_INFINITY;
      const timer = new Promise<void>((resolve) => setTimeout(() => {
        timerElapsedMs = Date.now() - startedAt;
        resolve();
      }, 50));
      await expect(store.bindIdentity({ uid: "guest-uid-1", playerId: "guest-uid-1" })).resolves.toMatchObject({ uid: "guest-uid-1" });
      await timer;
      expect(timerElapsedMs).toBeLessThan(400);
    } finally {
      await blocker.terminate();
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
