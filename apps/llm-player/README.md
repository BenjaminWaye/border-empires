# llm-player

A standalone bot that plays Border Empires as its own player, using Claude
Haiku 4.5 for decisions. Runs entirely from your own machine — it connects to
the deployed gateway exactly like the real browser client does (same
WebSocket protocol, same Firebase auth), so it never touches server infra and
carries no deploy risk.

## What it does (v1)

Each session: signs in as its own dedicated player account, connects to the
gateway, and for a bounded number of turns feeds Claude a compact summary of
its empire (gold, manpower, a sample of owned tiles, and the frontier tiles
adjacent to its territory) and lets it choose one action per turn —
`expand`, `attack`, `settle`, or `wait`. At the end of the session it asks
Claude to write a short, honest journal entry (what felt boring/unclear, any
suggestions) and, if configured, posts a summary + journal to Discord.

**Not yet implemented** (deliberately cut from v1 to ship something reliable
fast): building/tech/muster commands, the activity feed (`eventLog`), and a
minimap-style summary for a larger sense of the map beyond the immediate
frontier. See the conversation this was scoped from for the full design.

## Setup

From the repo root:

```bash
pnpm install
```

```bash
cd apps/llm-player
cp .env.example .env
# fill in ANTHROPIC_API_KEY, BOT_EMAIL, BOT_PASSWORD (any email/password —
# it's a dedicated account for the bot, not a real inbox)
```

Register the bot's own player account (one-time; safe to re-run):

```bash
pnpm --filter @border-empires/llm-player create-account
```

Run a session:

```bash
pnpm --filter @border-empires/llm-player dev
```

## Running it twice a day, like a normal player

This is a single bounded run, not a long-lived process — schedule it with
whatever your OS provides. On macOS, a `launchd` user agent is more reliable
across sleep/wake than cron. Example plist (adjust paths), run twice daily:

```xml
<!-- ~/Library/LaunchAgents/com.borderempires.llm-player.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Label</key><string>com.borderempires.llm-player</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd /path/to/border-empires/apps/llm-player &amp;&amp; pnpm dev</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>21</integer><key>Minute</key><integer>0</integer></dict>
  </array>
</dict></plist>
```

Load it with `launchctl load ~/Library/LaunchAgents/com.borderempires.llm-player.plist`.

## Targeting staging vs. production

Defaults to staging (`border-empires-combined-staging`). Point
`GATEWAY_WS_URL` at production only once you've watched a few staging
sessions behave well — see `.env.example`.

## Cost

With prompt caching on the static system prompt/tool definitions, each
turn's decision is roughly a few hundred cached input tokens plus a small
tool-call output on Haiku 4.5 ($1/$5 per MTok) — well under $0.01 per
12-turn session. Twice a day is cents a month.
