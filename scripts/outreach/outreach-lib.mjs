// Shared helpers for the outreach scripts (see docs/marketing/outreach-strategy.md).
// Pure functions only, so outreach-lib.test.mjs can cover them without a network.

export const PLAY_URL = "https://play.borderempires.com/";

// Lowercase, dash-separated, ASCII-only. utm values end up as table rows on
// /admin/players/insights, so keep them short and readable.
export const slugify = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

// One link per post: utm_source = platform, utm_medium = post type,
// utm_campaign = where + what (e.g. "r-webgames-season-launch"). The gateway
// attributes each visitor by source + campaign (acquisition-sources.ts).
export const buildOutreachLink = ({ source, medium = "post", campaign, base = PLAY_URL }) => {
  const s = slugify(source);
  const c = slugify(campaign);
  if (!s) throw new Error("source is required (e.g. reddit, discord, youtube)");
  if (!c) throw new Error("campaign is required (e.g. r-webgames-season-launch)");
  const url = new URL(base);
  url.searchParams.set("utm_source", s);
  url.searchParams.set("utm_medium", slugify(medium) || "post");
  url.searchParams.set("utm_campaign", c);
  return url.toString();
};

const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "–");

// Plain-text table of insights.acquisition.sources, best sign-ups first.
export const formatSourceReport = (insights, { limit = 15 } = {}) => {
  const sources = insights?.acquisition?.sources ?? [];
  const lines = [`Outreach results — last ${insights?.windowDays ?? "?"} days`];
  if (sources.length === 0) {
    lines.push("No tracked visits in this window.");
    return lines.join("\n");
  }
  const rows = sources.slice(0, limit).map((r) => [r.campaign ? `${r.source} / ${r.campaign}` : r.source, String(r.visitors), String(r.signUps), pct(r.signUps, r.visitors)]);
  const header = ["source / campaign", "visitors", "sign-ups", "conv."];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const fmt = (cells) => cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join("  ");
  lines.push(fmt(header), ...rows.map(fmt));
  const a = insights.acquisition;
  lines.push("", `Total: ${a.visitors} visitors, ${a.signUps} sign-ups (${pct(a.signUps, a.visitors)}).`);
  return lines.join("\n");
};

// Changelog entries live in many TypeScript files; rather than pull a TS
// loader into a zero-dependency script, read the plain object literals.
// Matches `createdAt: <ms>, ... title: "...", why: "..."` within one entry.
const ENTRY_RE = /createdAt:\s*(\d+),[^{}]*?title:\s*"((?:[^"\\]|\\.)*)",\s*why:\s*"((?:[^"\\]|\\.)*)"/g;
const unescape = (s) => s.replace(/\\(["\\])/g, "$1");

export const parseChangelogEntries = (source) =>
  [...String(source).matchAll(ENTRY_RE)].map((m) => ({ createdAt: Number(m[1]), title: unescape(m[2]), why: unescape(m[3]) }));

// Counts merged GitHub PRs in `git log --merges --format=%s` output.
export const countMergedPrs = (logText) => String(logText).split("\n").filter((line) => /^Merge pull request #\d+/.test(line)).length;
