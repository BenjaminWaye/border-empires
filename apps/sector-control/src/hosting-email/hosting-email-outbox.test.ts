// The outbox keeps each email once, hands out what is due, and is pruned.
import { createRequire } from "node:module";
import type { DatabaseSync as Database } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { SqliteHostingEmailOutbox } from "./hosting-email-outbox.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

const outbox = (): SqliteHostingEmailOutbox => {
  const created = new SqliteHostingEmailOutbox(new DatabaseSync(":memory:"));
  created.applySchema();
  return created;
};
const email = (emailKey: string, groupKey?: string) => ({ emailKey, kind: "sector_ready" as const, accountUid: "a", subject: "s", text: "t", html: "h", ...(groupKey ? { groupKey } : {}) });

describe("the hosting email outbox", () => {
  it("keeps one email per key, whether or not it was sent", () => {
    const box = outbox();
    expect(box.enqueue({ ...email("k"), attachTermsVersion: "v1" }, 10)).toBe(true);
    expect(box.enqueue(email("k"), 20)).toBe(false);
    box.markSent("k", 30);
    expect(box.enqueue(email("k"), 40)).toBe(false);
    expect(box.get("k")).toMatchObject({ createdAt: 10, sentAt: 30, attempts: 1, attachTermsVersion: "v1" });
  });

  it("hands out what is due, oldest first, and holds back what waits for a retry", () => {
    const box = outbox();
    box.enqueue(email("a"), 10);
    box.enqueue(email("b"), 20);
    box.enqueue(email("c"), 30);
    box.markRetry("a", "busy", 100);
    box.markAbandoned("c", "no address", 40);
    expect(box.listDue(50, 10).map((due) => due.emailKey)).toEqual(["b"]);
    expect(box.listDue(100, 10).map((due) => due.emailKey)).toEqual(["b", "a"]);
    expect(box.get("a")).toMatchObject({ attempts: 1, lastError: "busy" });
    expect(box.countPending()).toBe(2);
  });

  it("reports when a group was first written and first sent, and how many still wait", () => {
    const box = outbox();
    expect(box.groupStatus("g")).toEqual({ pending: 0 });
    box.enqueue(email("g:1", "g"), 10);
    box.enqueue(email("g:2", "g"), 20);
    box.enqueue(email("g:3", "g"), 20);
    expect(box.groupStatus("g")).toEqual({ writtenAt: 10, pending: 3 });
    box.markSent("g:2", 30);
    box.markAbandoned("g:3", "no address", 30);
    expect(box.groupStatus("g")).toEqual({ writtenAt: 10, sentAt: 30, pending: 1 });
  });

  it("keeps the address of the first attempt", () => {
    const box = outbox();
    box.enqueue(email("k"), 0);
    box.setToAddress("k", "first@example.test");
    box.setToAddress("k", "second@example.test");
    expect(box.get("k")?.toAddress).toBe("first@example.test");
  });

  it("forgets an account's address and unsent emails, and prunes unused addresses", () => {
    const box = outbox();
    box.rememberAddress("gone", "gone@example.test", 0);
    box.enqueue({ ...email("unsent"), accountUid: "gone" }, 0);
    box.enqueue({ ...email("sent"), accountUid: "gone" }, 0);
    box.markSent("sent", 1);
    box.forgetAccount("gone");
    expect(box.getAddress("gone")).toBeUndefined();
    expect(box.get("unsent")).toBeUndefined();
    expect(box.get("sent")).toBeDefined();
  });

  it("prunes only finished emails older than the cut-off", () => {
    const box = outbox();
    for (const key of ["old-sent", "old-gone", "new-sent", "waiting"]) box.enqueue(email(key), 0);
    box.markSent("old-sent", 10);
    box.markAbandoned("old-gone", "x", 10);
    box.markSent("new-sent", 100);
    expect(box.pruneFinished(50)).toBe(2);
    expect(box.get("old-sent")).toBeUndefined();
    expect(box.get("new-sent")).toBeDefined();
    expect(box.get("waiting")).toBeDefined();
  });

  it("keeps the latest address of an account", () => {
    const box = outbox();
    box.rememberAddress("a", "one@example.test", 1);
    box.rememberAddress("a", "two@example.test", 2);
    expect(box.getAddress("a")).toBe("two@example.test");
    expect(box.getAddress("b")).toBeUndefined();
  });
});
