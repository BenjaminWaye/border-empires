import type { BugReportInput } from "../slack-alerts/slack-alerts.js";
import { escapeHtml } from "./escape-html.js";

export type BugReportEmailConfig = {
  resendApiKey?: string;
  from?: string;
  to?: string;
  appLabel?: string;
  fetchImpl?: typeof fetch;
  log?: { error?: (payload: unknown, message?: string) => void };
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const POST_TIMEOUT_MS = 5_000;
const DEFAULT_APP_LABEL = "border-empires-combined-staging";

const buildBugReportEmailBody = (report: BugReportInput, appLabel: string): { subject: string; text: string } => {
  const serverErrorEvents = report.serverEvents.filter((e) => e.level === "error");
  const clientErrorEvents = report.clientEvents.filter((e) => e.level === "error");
  const subject = `[${appLabel}] Bug report from ${report.playerName || "unknown"}`;
  const text = [
    `Player: ${report.playerName || "unknown"} (${report.playerId})`,
    `Description: ${report.description.slice(0, 1_000)}`,
    `Server events: ${report.serverEvents.length} total (${serverErrorEvents.length} errors)`,
    `Client events: ${report.clientEvents.length} total (${clientErrorEvents.length} errors)`
  ].join("\n");
  return { subject, text };
};

// Fire-and-forget: sends a player bug report straight to a fixed admin inbox
// via Resend, independent of the player-lookup email flow in email-alerts.ts
// (bug reports have no bound recipient player — they always go to one address).
export const sendBugReportEmail = async (report: BugReportInput, config: BugReportEmailConfig): Promise<void> => {
  const apiKey = config.resendApiKey?.trim();
  const from = config.from?.trim();
  const to = config.to?.trim();
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (!apiKey || !from || !to || !fetchImpl) return;

  const { subject, text } = buildBugReportEmailBody(report, config.appLabel ?? DEFAULT_APP_LABEL);
  const html = `<pre>${escapeHtml(text)}</pre>`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), POST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: ac.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`resend returned ${response.status}: ${body.slice(0, 200)}`);
    }
  } catch (error) {
    config.log?.error?.({ err: error instanceof Error ? error.message : String(error) }, "failed to send bug report email");
  } finally {
    clearTimeout(timer);
  }
};
