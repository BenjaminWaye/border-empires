import type { BugReportInput } from "../slack-alerts/slack-alerts.js";

// Files player bug reports / suggestions as GitHub issues, alongside the admin
// email (bug-report-email-alert.ts). The issue tracker may be public, so the
// issue carries only technical triage context: no player name, player id or
// page URL, and the full report JSON (client context, every event payload)
// stays in the admin email and the gateway's `player_bug_report` log line,
// both correlated by the report id shown in the issue.

export type PlayerReportIssueKind = "bug" | "suggestion";

export type PlayerReportGithubIssueConfig = {
  token: string;
  // "owner/name"
  repo: string;
};

type IssueDeps = PlayerReportGithubIssueConfig & {
  appLabel?: string;
  fetchImpl?: typeof fetch;
  log?: {
    error?: (payload: unknown, message?: string) => void;
    warn?: (payload: unknown, message?: string) => void;
  };
  now?: () => number;
};

export type PlayerReportIssue = { title: string; body: string; labels: string[] };

const GITHUB_API = "https://api.github.com";
const POST_TIMEOUT_MS = 8_000;
const TITLE_DESCRIPTION_CHARS = 80;
const NOTABLE_EVENTS_IN_BODY = 10;
const DEFAULT_APP_LABEL = "border-empires";
// GitHub owners are alphanumeric/hyphen; repo names can't be "." or "..".
// The report endpoint is unauthenticated and its per-IP limit can be dodged
// by rotating IPs, so cap issue creation process-wide: past this, reports
// still reach email/logs but stop opening issues until the window rolls.
export const MAX_ISSUES_PER_WINDOW = 20;
const ISSUE_WINDOW_MS = 60 * 60_000;
let issueTimestamps: number[] = [];
const takeIssueSlot = (now: number): boolean => {
  issueTimestamps = issueTimestamps.filter((t) => now - t < ISSUE_WINDOW_MS);
  if (issueTimestamps.length >= MAX_ISSUES_PER_WINDOW) return false;
  issueTimestamps.push(now);
  return true;
};
export const resetPlayerReportIssueBudgetForTests = (): void => { issueTimestamps = []; };
const REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*\/(?!\.{1,2}$)[A-Za-z0-9_.-]+$/;

const LABELS_BY_KIND: Record<PlayerReportIssueKind, string[]> = {
  bug: ["player-report", "bug"],
  suggestion: ["player-report", "enhancement"]
};
const TITLE_PREFIX_BY_KIND: Record<PlayerReportIssueKind, string> = { bug: "Bug", suggestion: "Suggestion" };

type LeveledEvent = { at: number; level: string; event: string; scope?: string; payload: Record<string, unknown> };

const contextString = (context: Record<string, unknown>, key: string): string => {
  const value = context[key];
  return typeof value === "string" && value.length > 0 ? value.slice(0, 200) : "unknown";
};

// Untrusted player text goes inside a code fence (no @mention / #ref / markup
// rendering). The fence is one tilde longer than any tilde run in the text, so
// the text can't close it early.
const fenced = (text: string): string => {
  const longestRun = Math.max(0, ...(text.match(/~+/g) ?? []).map((run) => run.length));
  const fence = "~".repeat(Math.max(3, longestRun + 1));
  return `${fence}text\n${text}\n${fence}`;
};

// Titles render @mentions as plain text, but strip control characters and
// collapse whitespace so a multi-line description makes a one-line title.
const titleSnippet = (description: string): string => {
  // \p{Cc} control chars and \p{Cf} format chars (bidi overrides, zero-width).
  const oneLine = description.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/g, " ").trim();
  return oneLine.length > TITLE_DESCRIPTION_CHARS ? `${oneLine.slice(0, TITLE_DESCRIPTION_CHARS - 1)}…` : oneLine;
};

// Server events can include other players' activity (an unauthenticated
// reporter gets gateway-wide warnings), so the public issue lists names only
// for the reporter's own client events and gives server events as counts.
const eventLines = (label: string, events: LeveledEvent[], listNotable: boolean): string[] => {
  const errors = events.filter((e) => e.level === "error").length;
  const warnings = events.filter((e) => e.level === "warn").length;
  const notable = listNotable ? events.filter((e) => e.level !== "info").slice(-NOTABLE_EVENTS_IN_BODY) : [];
  return [
    `${label} events: ${events.length} total (${errors} errors, ${warnings} warnings)`,
    ...notable.map((e) => {
      const name = e.scope ? `${e.scope}/${e.event}` : e.event;
      return `  ${new Date(e.at).toISOString()} [${e.level}] ${name}`.slice(0, 300);
    })
  ];
};

export const buildPlayerReportIssue = (kind: PlayerReportIssueKind, report: BugReportInput, appLabel: string): PlayerReportIssue => {
  const description = report.description.slice(0, 1_000);
  const title = `[${TITLE_PREFIX_BY_KIND[kind]}] ${titleSnippet(description) || "(no description)"}`;
  const context = [
    `Report ID: ${report.reportId}`,
    `Environment: ${appLabel}`,
    `Server build: ${contextString(report.clientContext, "bridgeDebugServerBuildSha")}`,
    `Season: ${contextString(report.clientContext, "bridgeDebugSeasonId")}`,
    `Connection: ${contextString(report.clientContext, "connection")}`,
    `Renderer: ${contextString(report.metadata, "renderer")}`,
    `User agent: ${contextString(report.metadata, "userAgent")}`,
    "",
    ...eventLines("Server", report.serverEvents, false),
    ...eventLines("Client", report.clientEvents, true)
  ].join("\n");
  const body = [
    `Submitted in-game by a player via **${kind === "bug" ? "Report Bug" : "Suggest Improvement"}**.`,
    "",
    "### Description",
    fenced(description),
    "",
    "### Context",
    fenced(context),
    "",
    `Full report (event payloads, client context, diagnostics bundle): admin report email, when email alerts are configured, and the gateway's \`player_bug_report\` log line, both keyed by report id \`${report.reportId}\`.`
  ].join("\n");
  return { title, body, labels: LABELS_BY_KIND[kind] };
};

type PostResult = { ok: true } | { ok: false; status?: number; error: string };

const postIssue = async (fetchImpl: typeof fetch, config: IssueDeps, issue: Record<string, unknown>): Promise<PostResult> => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), POST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${GITHUB_API}/repos/${config.repo}/issues`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        "user-agent": "border-empires-gateway",
        "x-github-api-version": "2022-11-28"
      },
      body: JSON.stringify(issue),
      signal: ac.signal
    });
    if (response.ok) {
      // Release the connection; the created issue's JSON isn't needed.
      await response.body?.cancel().catch(() => undefined);
      return { ok: true };
    }
    const text = await response.text().catch(() => "");
    return { ok: false, status: response.status, error: `github returned ${response.status}: ${text.slice(0, 200)}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
};

// Fire-and-forget like the email sender: never throws (callers use `void`).
export const createPlayerReportGithubIssue = async (
  kind: PlayerReportIssueKind,
  report: BugReportInput,
  config: IssueDeps
): Promise<void> => {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (!config.token || !REPO_PATTERN.test(config.repo) || !fetchImpl) return;
  if (!takeIssueSlot((config.now ?? Date.now)())) {
    config.log?.warn?.({ reportId: report.reportId }, `${kind} report GitHub issue skipped: hourly issue cap reached`);
    return;
  }
  try {
    const issue = buildPlayerReportIssue(kind, report, config.appLabel ?? DEFAULT_APP_LABEL);
    const withLabels = await postIssue(fetchImpl, config, issue);
    if (withLabels.ok) return;
    // Only a validation failure (422) is retried without labels; a 403 is a
    // permission or rate-limit problem that an immediate retry would worsen.
    if (withLabels.status !== 422) throw new Error(withLabels.error);
    config.log?.error?.({ err: withLabels.error, reportId: report.reportId }, `${kind} report issue with labels rejected; retrying without`);
    const plain = await postIssue(fetchImpl, config, { title: issue.title, body: issue.body });
    if (!plain.ok) throw new Error(plain.error);
  } catch (error) {
    config.log?.error?.(
      { err: error instanceof Error ? error.message : String(error), reportId: report.reportId },
      `failed to create ${kind} report GitHub issue`
    );
  }
};
