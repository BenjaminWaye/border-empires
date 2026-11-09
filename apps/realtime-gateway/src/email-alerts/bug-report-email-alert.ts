import type { BugReportInput } from "../slack-alerts/slack-alerts.js";
import { escapeHtml } from "./escape-html.js";

export type PlayerReportKind = "bug" | "suggestion";

export type BugReportEmailConfig = {
  resendApiKey?: string;
  from?: string;
  to?: string;
  appLabel?: string;
  fetchImpl?: typeof fetch;
  log?: { error?: (payload: unknown, message?: string) => void };
};

type ResendAttachment = { filename: string; content: string };

export type PlayerReportEmail = {
  subject: string;
  text: string;
  attachment: ResendAttachment;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const POST_TIMEOUT_MS = 5_000;
const DEFAULT_APP_LABEL = "border-empires-combined-staging";
const NOTABLE_EVENTS_IN_BODY = 5;

const SUBJECT_LABEL_BY_KIND: Record<PlayerReportKind, string> = {
  bug: "Bug report",
  suggestion: "Suggestion"
};

type LeveledEvent = { at: number; level: string; event: string; scope?: string; payload: Record<string, unknown> };

const contextString = (context: Record<string, unknown>, key: string): string => {
  const value = context[key];
  return typeof value === "string" && value.length > 0 ? value : "unknown";
};

const formatNotableEvents = (label: string, events: LeveledEvent[]): string[] => {
  const notable = events.filter((e) => e.level !== "info").slice(-NOTABLE_EVENTS_IN_BODY);
  if (notable.length === 0) return [];
  return [
    `Last ${notable.length} ${label} warnings/errors:`,
    ...notable.map((e) => {
      const name = e.scope ? `${e.scope}/${e.event}` : e.event;
      const commandId = typeof e.payload.commandId === "string" ? ` cmd:${e.payload.commandId}` : "";
      return `  ${new Date(e.at).toISOString()} [${e.level}] ${name}${commandId}`;
    })
  ];
};

const countLine = (label: string, events: LeveledEvent[]): string => {
  const errors = events.filter((e) => e.level === "error").length;
  const warnings = events.filter((e) => e.level === "warn").length;
  return `${label} events: ${events.length} total (${errors} errors, ${warnings} warnings)`;
};

// The body is a skim-able summary; the full report (every event payload, the
// client context and metadata) rides along as a JSON attachment, which is
// what an agent debugging the report should actually read.
export const buildPlayerReportEmail = (kind: PlayerReportKind, report: BugReportInput, appLabel: string): PlayerReportEmail => {
  const subject = `[${appLabel}] ${SUBJECT_LABEL_BY_KIND[kind]} from ${report.playerName || "unknown"}`;
  const text = [
    `Report ID: ${report.reportId}`,
    `Player: ${report.playerName || "unknown"} (${report.playerId})`,
    `Description: ${report.description.slice(0, 1_000)}`,
    "",
    `Server build: ${contextString(report.clientContext, "bridgeDebugServerBuildSha")}`,
    `Season: ${contextString(report.clientContext, "bridgeDebugSeasonId")}`,
    `Connection: ${contextString(report.clientContext, "connection")}`,
    `Renderer: ${contextString(report.metadata, "renderer")}`,
    `Page: ${contextString(report.metadata, "pageUrl")}`,
    `User agent: ${contextString(report.metadata, "userAgent")}`,
    "",
    countLine("Server", report.serverEvents),
    countLine("Client", report.clientEvents),
    ...formatNotableEvents("server", report.serverEvents),
    ...formatNotableEvents("client", report.clientEvents),
    "",
    `Full report (all events, client context, metadata) attached as ${kind}-report-${report.reportId}.json.`
  ].join("\n");
  const attachment: ResendAttachment = {
    filename: `${kind}-report-${report.reportId}.json`,
    content: Buffer.from(JSON.stringify({ kind, ...report }, null, 2), "utf8").toString("base64")
  };
  return { subject, text, attachment };
};

// Fire-and-forget: sends a player bug report or improvement suggestion
// straight to a fixed admin inbox via Resend, independent of the
// player-lookup email flow in email-alerts.ts (neither has a bound recipient
// player — they always go to one address).
export const sendPlayerReportEmail = async (kind: PlayerReportKind, report: BugReportInput, config: BugReportEmailConfig): Promise<void> => {
  const apiKey = config.resendApiKey?.trim();
  const from = config.from?.trim();
  const to = config.to?.trim();
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (!apiKey || !from || !to || !fetchImpl) return;

  const { subject, text, attachment } = buildPlayerReportEmail(kind, report, config.appLabel ?? DEFAULT_APP_LABEL);
  const html = `<pre>${escapeHtml(text)}</pre>`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), POST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html, attachments: [attachment] }),
      signal: ac.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`resend returned ${response.status}: ${body.slice(0, 200)}`);
    }
  } catch (error) {
    config.log?.error?.(
      { err: error instanceof Error ? error.message : String(error), reportId: report.reportId },
      `failed to send ${kind} report email`
    );
  } finally {
    clearTimeout(timer);
  }
};
