#!/usr/bin/env node
// Writes ready-to-edit outreach post drafts (Reddit devlog, r/WebGames-style
// "play in browser", strategy-sub discussion, Discord) from what actually
// shipped and happened this week:
//   - recent changelog entries (packages/client/src/client-changelog/*.ts)
//   - today's in-fiction headlines from the public GET /api/activity
// Every draft gets its own tagged link (outreach-lib.mjs) so the weekly
// outreach report can tell which post worked.
//
// It never posts anything. A person picks the draft, edits it in their own
// voice, checks the subreddit's self-promo rules, and posts it by hand —
// see docs/marketing/outreach-strategy.md for why.
//
// Usage:
//   node scripts/outreach/outreach-drafts.mjs [--days 7] [--out <dir>] [--no-activity]
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { buildOutreachLink, countMergedPrs, parseChangelogEntries } from "./outreach-lib.mjs";
import { buildNicheDraft, plausibleMomentum, powerCsv, warsCsv } from "./outreach-niche.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { values } = parseArgs({
  options: {
    days: { type: "string", default: "7" },
    out: { type: "string", default: join(repoRoot, ".outreach-drafts") },
    "no-activity": { type: "boolean", default: false }
  }
});

const days = Number(values.days) || 7;
const since = Date.now() - days * 24 * 60 * 60_000;
const stamp = new Date().toISOString().slice(0, 10);

const changelogDir = join(repoRoot, "packages/client/src/client-changelog");
const files = (await readdir(changelogDir)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const seen = new Set();
const entries = [];
for (const file of files) {
  for (const entry of parseChangelogEntries(await readFile(join(changelogDir, file), "utf8"))) {
    if (entry.createdAt < since || seen.has(entry.title)) continue;
    seen.add(entry.title);
    entries.push(entry);
  }
}
entries.sort((a, b) => b.createdAt - a.createdAt);

let story = [];
let activity;
if (!values["no-activity"]) {
  try {
    const res = await fetch(process.env.ACTIVITY_API_URL ?? "https://api.borderempires.com/api/activity", { signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      activity = await res.json();
      // Drop expansion headlines while the momentum feed reports impossible
      // net-tile numbers (see plausibleMomentum); everything else is fine.
      const momentumBroken = (activity.territoryMomentum ?? []).some((row) => !plausibleMomentum(row));
      story = (activity.dailyStory ?? []).filter((e) => !(momentumBroken && /expan/i.test(e.headline)));
    }
    else console.error(`activity API returned ${res.status}; drafts will skip the war-story section`);
  } catch (error) {
    console.error(`activity API unreachable (${error instanceof Error ? error.message : error}); skipping war stories`);
  }
}

// Real numbers for the AI-audience draft; those subs reward concrete
// specifics and punish vague hype. Best-effort: a missing git just drops them.
const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return "";
  }
};
const mergedPrs = countMergedPrs(git(["log", `--since=${days} days ago`, "--merges", "--format=%s"]));
const sourceFiles = git(["ls-files", "*.ts", "*.tsx"]).split("\n").filter((f) => f && !/\.test\.tsx?$/.test(f)).length;

const link = (source, campaign, medium = "post") => buildOutreachLink({ source, medium, campaign: `${campaign}-${stamp}` });
const bullets = (list, n) => list.slice(0, n).map((e) => `- **${e.title}** — ${e.why}`).join("\n") || "- _(nothing shipped in this window — write about a design decision instead)_";
const headlines = story.slice(0, 3).map((e) => `> **${e.headline}.** ${e.text}`).join("\n>\n");

const drafts = {
  "reddit-devlog.md": `# r/IndieDev / r/gamedev devlog (Saturday "screenshot"/devlog threads, or own post where allowed)

Title ideas (pick one, make it about the lesson, not the game):
- "I let players' borders do the fighting — no units, just tiles. Here's what a week of playtests taught me"
- "Solo dev, browser MMO strategy: ${entries.length} changes this week, all from player reports"

Body (rewrite in your own voice; lead with the GIF/clip):

[GIF: a coordinated muster push swallowing a border]

I'm building Border Empires, a free browser strategy game where you expand tile by tile and fight border wars against other players — no installs, no units to micro.

What changed this week, and why:
${bullets(entries, 5)}

${headlines ? `Something that happened on the live map today:\n\n${headlines}\n` : ""}
Honest question for other devs: <one real question you want answered>.

Play link (only if the sub allows it, otherwise put it in a comment when asked): ${link("reddit", "r-indiedev-devlog")}
`,
  "reddit-webgames.md": `# r/WebGames / r/playmygame / r/incremental_games-style "play now" post

Title: Border Empires — a free multiplayer territory war game you play in the browser (no sign-up needed)

Link: ${link("reddit", "r-webgames-play")}

First comment (post it yourself right away):
- Click "Play now" — guest play, no account. Save your empire later if you like it.
- Start from one tile, expand, garrison, and push borders into neighbours. Seasons end with one of five victory conditions.
- I'm the solo dev; I read every comment and ship fixes daily. Latest:
${bullets(entries, 3)}
`,
  "reddit-strategy-discussion.md": `# r/4Xgaming / r/strategygames / r/BaseBuildingGames discussion post

Lead with a design question, not an ad. Mention the game only as your example.

Title: "Would you play a 4X where combat is only border ownership — no units at all?"

Body: Explain the core idea (tile exposure = defense, forts multiply the cost to crack a tile, mustering a coordinated push). Ask what would make it boring vs. deep. Disclose: "I'm building one of these."

Link in a reply only when someone asks: ${link("reddit", "r-4xgaming-discussion", "comment")}
`,
  "reddit-ai-builders.md": `# AI-builder subs: r/ClaudeAI (Built-with-Claude megathread), r/ClaudeCode, r/vibecoding, r/ChatGPTCoding (self-promo thread), r/AI_Agents, r/accelerate, r/singularity

The audience here cares how it was built, not the game. Lead with the process
and real numbers; the game is the proof. Be upfront that agents wrote most of
the code: these subs check, and so will the game subs you cross-post to.

Title ideas:
- "Coding agents shipped ${mergedPrs} merged PRs in ${days} days to a live multiplayer strategy game. What works and what breaks"
- "I run a persistent browser MMO mostly built by AI agents. Here's the guardrail file that keeps them from wrecking it"

Body (rewrite in your own voice):
- What it is: a live browser strategy game (two map renderers, realtime gateway + simulation, ${sourceFiles} TypeScript source files).
- How agents work on it: one task → one branch → CI gate (lint, file-length limit, tests) → PR. The rules file (AGENTS.md) and what each rule fixed.
- What still needs a human: <be specific: balance calls, lore, art direction, prod incidents>.
- Failures: <one honest story of an agent regression and the guardrail it produced>.
- This week, from player reports:
${bullets(entries, 3)}

r/singularity / r/accelerate only: frame it as a capability data point ("what one person + agents can run in 2026"), not an ad. No link in the post; reply with it if asked.

Link (comment, where allowed): ${link("reddit", "r-claudeai-showcase", "comment")}
`,
  "discord.md": `# Discord announcement (own server) / indie showcase channels

**This week in Border Empires**
${bullets(entries, 6)}
${headlines ? `\n**From the front lines**\n${headlines}\n` : ""}
Bring a friend into the season: ${link("discord", "weekly-update", "announcement")}
`
};

if (activity) {
  drafts["niche-communities.md"] = buildNicheDraft(activity, link("reddit", "niche-reply", "comment"));
  drafts["wars.csv"] = warsCsv(activity);
  drafts["power.csv"] = powerCsv(activity);
}

await mkdir(values.out, { recursive: true });
for (const [name, body] of Object.entries(drafts)) await writeFile(join(values.out, `${stamp}-${name}`), body);
console.log(`Wrote ${Object.keys(drafts).length} drafts from ${entries.length} changelog entries and ${story.length} headlines to ${values.out}`);
