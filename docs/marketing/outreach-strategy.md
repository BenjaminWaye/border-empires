# Outreach strategy (zero ad budget)

Status: active plan, 2026-11-01

Goal: grow each season's player count through Reddit and community posts with
no ad spend, and measure which posts actually bring players instead of
guessing.

## Source

Started from the r/IndieDev post "1100 players in 7 weeks, 0 ad budget,
Reddit worked…" (`reddit.com/r/IndieDev/comments/1xgxeq7`). Reddit blocks the
cloud environment that wrote this, so only the title was read, not the post
body. The tactics below are the standard Reddit-led indie playbook the title
describes, adapted to what Border Empires already has. Paste the post body
into this file's "Source" section later so the plan can be checked against
it.

## Why this fits Border Empires

- **Browser game with guest play.** "Play now" needs no account
  ([guest play](../guest-play-plan.md)). A Reddit click goes straight into a
  match, including in the Reddit app's in-app browser, where Google sign-in
  doesn't work. That one-click path is what makes Reddit traffic convert.
- **A multiplayer game needs people at the same time.** A post brings players
  for 24–48 hours. Time posts for the **start of a season** and the first days
  after a big update, so new players meet other humans rather than an empty map
  of AIs.
- **The game already produces content.** The daily story (`GET /api/activity`)
  writes in-fiction headlines ("Toughest Target", "Fastest Expansion"), and
  the changelog has a player-facing *why* for every change. These are the raw
  material for devlog posts.

## Channels: post where other games aren't

Game subreddits (r/IndieDev, r/playmygame, r/WebGames, r/indiegames) get
hundreds of game posts a week, and most sink without being seen. The
r/singularity-style posts that work skip the queue: they go where nobody
posts games, as native content for that sub. The game is only the source.

**Tier 1: niche communities (most effort, best odds).** No play link in
the body. Reply with it when asked.

| Community | Native post | Raw material |
|---|---|---|
| r/singularity, r/accelerate, r/artificial | Capability data point: e.g. on 2026-11-01, 19 of the top 20 empires were AI. The in-game AI is a deterministic planner, not an LLM; say so | `niche-communities.md` (live numbers) |
| r/ClaudeAI (Built-with-Claude megathread), r/ClaudeCode, r/vibecoding, r/AI_Agents | How agents ship a live game: merged PRs/week, the AGENTS.md guardrails, honest failures | `reddit-ai-builders.md` (git stats) |
| r/dataisbeautiful | [OC] chart of a day of border wars or AI-vs-human power | `wars.csv`, `power.csv` |
| r/GameTheory, r/diplomacy | Truce/betrayal design question with real outcomes | live truce/war counts |
| r/proceduralgeneration, r/threejs, r/webgl | One technique write-up (toroidal islands, rivers, 3D renderer + 2D fallback), game as live demo | worldgen/renderer docs |
| r/worldbuilding, r/imaginarymaps | World-bible excerpt or season-end border map | [world bible](../lore/galactic-lore.md) |
| r/sweden / local subs + local press | "Local solo dev runs a live strategy game" human story | — |

Note that r/ClaudeAI already gets so many "I built a game" posts that it has a
megathread for them. Treat it as Tier 2 unless the post is about the process.

**Tier 2: game subs (low effort, crowded).** Post once per season launch:
r/WebGames, r/playmygame, r/browsergames, r/incremental_games (Feedback
Friday), r/4Xgaming / r/strategygames (discussion posts with a disclosure),
r/IndieDev / r/gamedev devlog threads.

**Avoid:** r/opensource (reported to bar AI-built projects), and any sub
whose rules ban AI-generated content. Several game subs are hostile to
AI-built games: disclose openly rather than get caught.

Rules were not verified against live sidebars (Reddit blocks the
environment this was written from). Read each sidebar before the first post.

## Rules that keep the account alive

1. **Read every subreddit's self-promo rules first.** Many allow links only
   in a weekly thread. Follow the 9:1 habit: comment usefully on other
   people's posts far more often than you post your own.
2. **Lead with a GIF and a lesson, not "check out my game".** Titles about
   what you learned get upvoted; ads get removed.
3. **Be in the thread for the first 2 hours.** Reply to every comment. Turn
   bug reports into same-day changelog entries and say so in the thread
   ("fixed, live now"). That loop is the strongest pitch you have.
4. **Never post the same text to many subs at once.** Rewrite it for each
   community, and space posts days apart.
5. **One tagged link per post** (below). If you can't measure a post, you
   can't repeat what worked.

## What's automated

Nothing posts automatically. Auto-posting breaks most subreddits' rules, and
the account would be banned. The automation covers everything around the
post:

| Step | Command |
|---|---|
| Make a tracked link for one post | `node scripts/outreach/outreach-link.mjs --source reddit --campaign "r-webgames-season-13"` |
| Draft this week's posts (game subs, AI-builder subs, niche communities) + chart CSVs from shipped changes, git stats and live data | `node scripts/outreach/outreach-drafts.mjs --days 7` → `.outreach-drafts/` (gitignored) |
| See which posts brought visitors and sign-ups | `/admin/players/insights` → *By source*, or `ADMIN_API_TOKEN=… node scripts/outreach/outreach-report.mjs --days 7` |
| Weekly results in Slack | `.github/workflows/outreach-report.yml` (Mondays, plus manual runs; needs the `ADMIN_API_TOKEN` repo secret) |

How attribution works: each visitor is attributed by the `utm_source` +
`utm_campaign` on their first visit, or by the referrer host when the link
carried no tag. Later funnel steps are joined back to that visitor
(`apps/realtime-gateway/src/player-insights/acquisition-sources.ts`). The
Reddit app often sends no referrer, so an untagged Reddit link usually shows
up as `direct`. Always use a tagged link.

Known gaps:

- The activity feed's territory momentum has shown impossible numbers
  (47,356 net tiles from 475 gained). The drafts script drops those rows and the
  "expansion" headlines built from them until the feed is fixed.
- Links to the `borderempires.com` landing page lose their tag when the
  visitor clicks Play. Link to `play.borderempires.com` directly.
- Guest players who never save their empire are counted as visitors, not
  sign-ups.

## Weekly loop

1. Monday: read the Slack outreach report. Note which sub + post type won.
2. Run the drafts script, pick 1–2 drafts, and rewrite them in your own voice.
3. Post one per day at most, at a time when the target sub is active, and
   stay in the thread.
4. Feed comments back into the game, and give the fixes changelog entries. Next
   week's drafts pick them up automatically.
