# llm-player

A standalone bot that plays Border Empires as its own player, using Claude
Haiku 4.5 for decisions. Runs entirely from your own machine — it connects to
the deployed gateway exactly like the real browser client does (same
WebSocket protocol, same Firebase auth), so it never touches server infra and
carries no deploy risk.

## What it does

Each session: signs in as its own dedicated player account, connects to the
gateway, joins the current season if it hasn't already (a brand-new account
has zero tiles until it does — the real client shows a "Join Season?" overlay
for this; the bot does it automatically), and for a bounded number of turns
feeds Claude a human-scale view of its empire, then lets it choose one action
per turn.

Rather than seeing its whole empire (or the full known-tile array) at once,
the bot gets what a human player effectively sees:
- **A viewport** — a ~20x20 tile window centered on a camera position,
  computed client-side from tiles the gateway already sends (no protocol
  changes needed). Only tiles inside the current viewport are valid
  `expand`/`attack`/`settle` targets.
- **A minimap** — a coarse grid over every area it's ever explored (dominant
  owner per cell, nearest-to-camera cells prioritized if capped), used to
  decide where to look next.
- **`pan_camera`** — moves the viewport to a new location (picked using the
  minimap or a recent event) instead of acting. Since the bot never scouts,
  panning outside every known tile is a dead end (fog of war) and is silently
  ignored rather than stranding the rest of the session.
- **`recentEvents`** — the same durable "what happened while I was away"
  activity feed a human player sees (attacks, etc.), most recent first. If an
  event has a location, the bot can `pan_camera` there to assess and respond
  instead of only ever expanding blindly outward.
- **`beaconSites`** — settled tiles it owns on the edge of its territory with
  no structure on them yet, i.e. valid `build_relay_beacon` targets.
- **Waystation awareness** — a frontier/viewport tile can carry
  `isWaystation: true` (rare, ~1 per 400 tiles): expanding onto one grants a
  random permanent reward, so the bot treats it as a higher priority than an
  ordinary resource or town tile.

Each turn it calls exactly one tool — `expand`, `attack`, `settle`,
`build_relay_beacon`, `pan_camera`, or `wait`. `build_relay_beacon` is the
actual reach-growth mechanism of the core gameplay loop: `expand` only claims
land already within reach of an anchor (a town/dock/outpost or an active
beacon), so once a reach disk is fully claimed the bot has to build a new
beacon on its territory's edge to open up more frontier before it can expand
again. Unlike the other commands, there's no accept/reject response for a
build — the bot finds out it worked when new frontier appears in a later
turn, the same way a human player would after the build timer finishes with
no confirmation dialog.

**Auto-settle**, separately from the LLM's one action per turn: at the start
of every turn the bot mirrors what the real browser client does on every
server update — it fires ordinary `SETTLE` commands (budget-gated by
manpower) for whatever the server's `autoSettlementQueue` currently offers
(towns, docks, resources, and town-ring tiles that come into reach). A human
player never manually settles these, so the bot doesn't spend its own turn on
them either; you'll see `auto-settle (x,y): accepted` lines in the session
log for this, distinct from the turn-numbered decision lines. The `settle`
tool itself is then mainly for a plain FRONTIER tile the bot wants settled
for a specific reason (defense, connectivity, clearing a beacon site).

At the end of the session it asks Claude to write a short, honest journal
entry (what felt boring/unclear, any suggestions) and, if configured, posts a
summary + journal to Discord.

**Not yet implemented**: economic structures other than the Relay Beacon
(gated behind researching tech and stockpiling strategic resources — neither
tracked client-side yet), tech/domain research, military buildings
(fort/siege outpost), monuments, diplomacy, muster/army commands, and the
aether-ability/sky-dock/scouting systems. See the game's Lucid "Core Loop"
chart and the conversation this was scoped from for the full picture.

## Setup

From the repo root:

```bash
pnpm install
```

```bash
cd apps/llm-player
cp .env.example .env
# fill in ANTHROPIC_API_KEY, BOT_EMAIL, BOT_PASSWORD. Use a real inbox you
# control for BOT_EMAIL (e.g. a Gmail +alias) if you want the game's
# existing "you're under attack" email alerts to actually reach you while
# the bot isn't running -- see .env.example for why.
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

## Getting notified while the bot is offline

The game already has a "you're under attack" email system
(`apps/realtime-gateway/src/email-alerts`), on by default per player and
independent of whether that player is currently connected. Since the bot is
just another player account, using a real email you control for `BOT_EMAIL`
means you get those emails whenever the bot's empire is attacked, even while
the bot process isn't running — no code needed here.

This is gated server-side by `GATEWAY_EMAIL_ALERTS_RESEND_API_KEY` on the
target environment; if that Fly secret isn't set on staging/prod, alerts
silently no-op regardless of the bot's email. Worth a quick
`fly secrets list -a border-empires-combined-staging` to confirm.

Note this only gets a *human* notified — the bot itself can't react while
its process isn't running. During its own sessions, though, it does now see
the same attack info via `recentEvents` (above) and can react.

## Cost

With prompt caching on the static system prompt/tool definitions, each
turn's decision is roughly a few hundred cached input tokens plus a small
tool-call output on Haiku 4.5 ($1/$5 per MTok) — well under $0.01 per
12-turn session. Twice a day is cents a month.
