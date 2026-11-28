// Sends one email through Resend, the provider the game gateway already uses
// (apps/realtime-gateway/src/email-alerts). The outbox key goes with it as
// Resend's idempotency key, so a send that timed out but did go through is
// not delivered twice when it is retried within Resend's 24-hour window.

export type HostingEmailAttachment = { filename: string; content: string; contentType: string };

export type HostingEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  attachments?: HostingEmailAttachment[];
};

export type HostingEmailTransport = { send: (message: HostingEmailMessage) => Promise<void> };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const POST_TIMEOUT_MS = 10_000;

export const createResendEmailTransport = (options: { apiKey: string; from: string; replyTo?: string; fetchImpl?: typeof fetch }): HostingEmailTransport => {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  return {
    async send(message) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
      try {
        const response = await fetchImpl(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
            // Resend accepts at most 256 characters; outbox keys are far shorter.
            "idempotency-key": message.idempotencyKey.slice(0, 256)
          },
          body: JSON.stringify({
            from: options.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            ...(options.replyTo ? { reply_to: options.replyTo } : {}),
            ...(message.attachments?.length
              ? { attachments: message.attachments.map((file) => ({ filename: file.filename, content: Buffer.from(file.content, "utf8").toString("base64"), content_type: file.contentType })) }
              : {})
          }),
          signal: controller.signal
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`resend returned ${response.status}: ${body.slice(0, 200)}`);
        }
      } finally {
        clearTimeout(timer);
      }
    }
  };
};
