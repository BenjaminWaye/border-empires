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
  changes needed). To keep the prompt small it lists only tiles that are owned
  by someone or carry a resource/town/waystation; plain unowned land is
  omitted (counted in `viewportOmittedPlainTiles`; the claimable ones are in
  `frontier`). Only tiles inside the current viewport are valid
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
- **`structureSites`** — settled tiles it owns that are eligible for a basic
  structure right now: matching tech researched (if any), no existing
  structure, and a free resource slot. FOOD/TITANIUM/CRYSTAL/UMBRITE
  structure costs are a global per-resource slot supply/demand pool, not a
  stockpile — checked via the wire's `resourceSlots`, the same numbers the
  server itself gates builds on. Starter set: `FARMSTEAD` (FARM tiles, no
  slot of its own), `MINE` (TITANIUM/GEMS tiles, needs a free FOOD slot), and
  `WOODEN_FORT` (a settled *border* tile -- next to land you don't own, since only those can be attacked -- no tech needed, needs a free FOOD slot) —
  deliberately narrow; see "Roadmap" below for why.
- **`techChoices`** — reachable, currently-affordable tech, i.e. valid
  `choose_tech` targets. Computed client-side from a bundled copy of the tech
  tree (mirrors `reachableTechChoices` in
  `apps/simulation/src/tech-domain-bridge/`), since the server only pushes
  this list reactively after a research round-trip.
- **`domainChoices`** — open domains it can adopt right now: the server's
  own open-choice list and per-domain requirements (shipped in
  `INIT`/`TECH_UPDATE`/`DOMAIN_UPDATE`, so there is no bundled copy of the
  domain tree to drift), re-checked against live gold, owned tech, and the
  strategic-resource stockpile. A domain is a **permanent, mutually exclusive
  pick per tier**, so the prompt tells the model to take one only when its
  description clearly fits how the bot plays, and that waiting is fine. Tier 1
  costs gold only; tier 2+ also costs `SHARD`, which this bot never collects,
  so in practice only tier 1 is ever offered. Domains that make you pick a
  trickle resource up front (Clockwork Stipend) are never offered — the bot
  doesn't send that sub-choice. Because a domain pick can't be undone, a `choose_domain`/`choose_tech`
  id that isn't in the list the bot would offer *right now* (stale, invented, or
  no longer affordable) is refused before anything is sent.
- **Waystation awareness** — a frontier/viewport tile can carry
  `isWaystation: true` (rare, ~1 per 400 tiles): expanding onto one grants a
  random permanent reward, so the bot treats it as a higher priority than an
  ordinary resource or town tile.

Each turn it calls exactly one tool — `expand`, `attack`, `settle`,
`build_relay_beacon`, `build_structure`, `choose_tech`, `choose_domain`,
`pan_camera`, or `wait`. `build_relay_beacon` is the actual reach-growth mechanism of the core
gameplay loop: `expand` only claims land already within reach of an anchor (a
town/dock/outpost or an active beacon), so once a reach disk is fully claimed
the bot has to build a new beacon on its territory's edge to open up more
frontier before it can expand again. `build_structure`/`choose_tech` cover
the economy and defense side of the loop (resource tiles → structures gated
by tech; `WOODEN_FORT` needs no tech and raises the manpower cost an
attacker pays to take that tile — the bot's only defensive tool today).
Unlike expand/attack/settle, none of these four can be matched to an ack by
id (their wire messages carry no `commandId`). Instead an **intent ledger**
(`intent-ledger.ts`) records each one when sent and resolves it on later
turns: *confirmed* when the effect shows up in state (a tech id via
`TECH_UPDATE`, a domain id via `DOMAIN_UPDATE`, a structure on the tile), *rejected* when the gateway's
rejection `ERROR` arrives (its `commandId` is server-generated, so it's
attributed to the most recently sent pending intent -- a heuristic, hence "probably
REJECTED" in what the model sees), or *unconfirmed* after a few turns. Each turn
reconciles before the prompt is built and again before dispatch (the model call
takes seconds), a blocked action is never sent, and a final reconcile after a
short wait reports anything still unresolved when the session ends. The
model sees these as `recentOutcomes`; anything pending or recently rejected is
withheld from `beaconSites`/`structureSites`/`techChoices`/`domainChoices`
(a pending domain withholds *every* domain, since only one per tier is allowed) so it can't resend
the same doomed command every turn.

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

## Roadmap toward full player-command parity

The bot deliberately does not implement the full player command surface.
Public research on LLM game-playing agents (e.g. CivBench, a similar
4X-genre benchmark) found that handing a cheap model a large flat per-turn
action space causes systematic underutilization of rarely-relevant tools
rather than better play, not just more tool-selection errors — so capability
is added narrow-first, only once there's a concrete reason it's load-bearing
for how this bot actually plays (bounded, twice-daily, one action per turn).
See the game's Lucid "Core Loop" chart and the conversation this was scoped
from for the full background.

**Done:**
- Expand / attack / settle, reach growth via Relay Beacons, auto-settle,
  waystation-aware expansion (Phase 0 of the original plan).
- Tech research (`choose_tech`) computed client-side from a bundled tech
  tree, gold-only cost, monument-unlock techs excluded outright (Phase 1).
- Basic economic structures (`build_structure`): `FARMSTEAD`/`MINE`, gated by
  tech and the real per-resource slot supply/demand pool, not the retired
  stockpile-cost fields (Phase 2).
- Feedback loop for no-ack commands (Phase 4): intent ledger + captured
  rejection errors + `recentOutcomes`, covered by a wire-level test against a
  local fake gateway (`game-socket.test.ts`). Motivated by four review
  findings in a row where the server silently rejected a build/tech and the
  bot assumed success.
- Basic defense (`build_structure`): `WOODEN_FORT` on a settled border tile, no
  tech needed -- closes the gap where the system prompt told the bot to
  "defend" a threatened tile with no actual defensive tool to do it with
  (Phase 3, narrowed to the one starter-tier structure rather than the full
  Fort/Siege Outpost tier ladders).

- Domains (`choose_domain`, Phase 5): driven by the server's own catalog and
  open-choice list rather than a bundled copy, offered only when open,
  researched-for and affordable, with prompt guidance that it's a one-way
  door and a pending pick blocks all domains. Confirmed via `DOMAIN_UPDATE`
  and tracked by the same intent ledger.

**Explicitly descoped from the original plan, not just deferred:**
- **Domains beyond tier 1, and Clockwork Stipend.** Tier 2+ need `SHARD`
  (collecting it is a separate command and strategy this bot doesn't have),
  and Clockwork Stipend needs a trickle-resource sub-choice the bot doesn't
  send. Both are filtered out of `domainChoices` rather than offered and
  rejected.
- The full ~35-type economic structure catalog, monuments, diplomacy,
  muster/army commands, and the aether-ability/sky-dock/scouting systems
  remain out of scope for the CivBench-underutilization reason above.
  Monument-unlock tech is excluded from `techChoices` entirely rather than
  attempting a "is it already claimed" check, since that check depends on
  global monument-ownership state the client can't see past its own fog of
  war.
- The full Fort/Siege Outpost tier ladders (upgrades beyond the starter
  `WOODEN_FORT`, and Siege Outposts entirely) remain out of scope -- both use
  separate commands (`BUILD_FORT`/`BUILD_SIEGE_OUTPOST`, not
  `BUILD_ECONOMIC_STRUCTURE`) and their own tier-progression logic, a
  meaningfully bigger lift than the flat one-tier `WOODEN_FORT` this bot now
  has.

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

Estimated, not yet measured against the live API (token counts below come from
character counts of the real prompt/tool/state JSON at ~3-4 chars/token). On
Haiku 4.5 ($1/$5 per MTok):

- **Static prefix** (system prompt + tool definitions): ~4.4K tokens, cached
  after the first turn (cache reads cost 0.1x). Haiku 4.5 only caches prefixes
  of at least 4096 tokens and this is close to that line, so **don't trim the
  system prompt or tool descriptions without checking the cache still engages**
  -- the session log prints `NO cache hits` if it doesn't.
- **Per-turn state**, never cached, is the main cost. It used to be ~18-31K
  characters, 65% of it the 20x20 viewport; plain unowned tiles (reachable
  ones are already in `frontier`) and interior-tile `WOODEN_FORT` offers are
  now omitted, bringing it to ~4-14K characters (~1.5-4.5K tokens) depending
  on empire size.
- **Per turn:** roughly $0.003-$0.008; **per 12-turn session:** roughly
  $0.04-$0.09; **twice a day:** roughly $0.08-$0.18/day (~$2.50-$5.50/month).
  The high end assumes a large empire or a prefix that isn't caching.

Every session ends with a `usage:` line (calls, uncached/cache-read/cache-write/
output tokens, estimated cost) in the console log and the Discord digest, so the
first real run gives you the actual number. The levers if it needs to go lower:
fewer `TURNS_PER_SESSION`, fewer sessions a day, or trimming `recentEvents`/
`techChoices` further.
