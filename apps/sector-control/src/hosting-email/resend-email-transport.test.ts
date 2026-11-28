// What is posted to Resend: the outbox key as idempotency key, the Terms as a base64 attachment.
import { describe, expect, it } from "vitest";

import { createResendEmailTransport } from "./resend-email-transport.js";

describe("the Resend email transport", () => {
  it("sends the outbox key as the idempotency key and attachments in base64", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const transport = createResendEmailTransport({ apiKey: "re_test", from: "Border Empires <hosting@example.test>", replyTo: "help@example.test", fetchImpl });
    await transport.send({ to: "a@example.test", subject: "s", text: "t", html: "h", idempotencyKey: "order:s-1", attachments: [{ filename: "terms.html", content: "<p>é</p>", contentType: "text/html" }] });
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBe("order:s-1");
    expect(headers.authorization).toBe("Bearer re_test");
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ to: ["a@example.test"], reply_to: "help@example.test", attachments: [{ filename: "terms.html", content: Buffer.from("<p>é</p>").toString("base64"), content_type: "text/html" }] });
  });

  it("throws when Resend refuses, so the outbox retries", async () => {
    const fetchImpl = (async () => new Response("invalid", { status: 422 })) as unknown as typeof fetch;
    const transport = createResendEmailTransport({ apiKey: "re_test", from: "f", fetchImpl });
    await expect(transport.send({ to: "a", subject: "s", text: "t", html: "h", idempotencyKey: "k" })).rejects.toThrow("resend returned 422: invalid");
  });
});
