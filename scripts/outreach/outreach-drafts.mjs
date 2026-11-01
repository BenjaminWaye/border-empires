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
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { buildOutreachLink, parseChangelogEntries } from "./outreach-lib.mjs";

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
if (!values["no-activity"]) {
  try {
    const res = await fetch(process.env.ACTIVITY_API_URL ?? "https://api.borderempires.com/api/activity", { signal: AbortSignal.timeout(15_000) });
    if (res.ok) story = (await res.json()).dailyStory ?? [];
    else console.error(`activity API returned ${res.status}; drafts will skip the war-story section`);
  } catch (error) {
    console.error(`activity API unreachable (${error instanceof Error ? error.message : error}); skipping war stories`);
  }
}

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
  "discord.md": `# Discord announcement (own server) / indie showcase channels

**This week in Border Empires**
${bullets(entries, 6)}
${headlines ? `\n**From the front lines**\n${headlines}\n` : ""}
Bring a friend into the season: ${link("discord", "weekly-update", "announcement")}
`
};

await mkdir(values.out, { recursive: true });
for (const [name, body] of Object.entries(drafts)) await writeFile(join(values.out, `${stamp}-${name}`), body);
console.log(`Wrote ${Object.keys(drafts).length} drafts from ${entries.length} changelog entries and ${story.length} headlines to ${values.out}`);
