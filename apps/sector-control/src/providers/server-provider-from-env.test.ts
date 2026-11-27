import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import { releaseShaFrom, ticketPublicKeyFromPrivate } from "./server-provider-from-env.js";

describe("server provider from env", () => {
  it("gives sector servers the public half of the ticket key, in the form they read", async () => {
    const keys = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const expected = (await exportSPKI(keys.publicKey)).replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
    expect(ticketPublicKeyFromPrivate(await exportPKCS8(keys.privateKey))).toBe(expected);
  });

  it("starts new sectors only on a release that is a full git sha", async () => {
    const answer = (status: number, text: string) => async () => ({ status, text: async () => text });
    await expect(releaseShaFrom("https://x/sha", answer(200, `${"c".repeat(40)}\n`))()).resolves.toBe("c".repeat(40));
    await expect(releaseShaFrom("https://x/sha", answer(200, "<html>"))()).rejects.toThrow(/release sha/);
    await expect(releaseShaFrom("https://x/sha", answer(404, "c".repeat(40)))()).rejects.toThrow(/release sha/);
  });
});
