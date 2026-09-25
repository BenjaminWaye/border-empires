# The Replenishment Update — Plan

> **Status:** Plan agreed 2026-09-23, scope trimmed 2026-09-24, gap review
> against the code 2026-09-24. **Phase 1 and Phase 1b are implemented**
> (2026-09-25, `claude/replenishment-update-plan-lhhar5`) with two
> deliberate, documented deviations from this doc: D23's beacon count is
> keyed off owned count, not a season-lifetime-built counter (see B2's Relay
> Beacons entry), and D10 (charge-on-start) plus the early-ramp exception are
> not implemented at all (see their own entries in B2 below) — the dev queue
> still charges manpower at enqueue. Phases 2–5 are plan only, not started.
> Goal: make each visit feel like a turn, without calling it a turn.
> Background: `docs/core-loop.md` §0, `docs/visit-as-a-turn.md`,
> `docs/muster-fronts-proposal.md`.

## 1. Decisions so far

| # | Decision |
|---|---|
| D1 | No "turns", "day N" or turn counter. Players join at different times, so the clock is personal: **"Manpower full in 3h 42min"**. |
| ~~D2~~ | ~~Manpower in 6h chunks~~. **Dropped 2026-09-24:** manpower keeps regenerating continuously. |
| ~~D3~~ | ~~Chunks stack for 24h~~. **Dropped with D2.** |
| D4 | **Remove the gold cap.** |
| D5 | **Nothing resolves at a shared global tick.** Combat stays continuous and tile by tile. |
| D6 | **Commit rule:** committed MP is always lost; `odds = (commit / base)² × base_odds`; no cap on commitment. |
| D7 | **Shield flags:** a Defend-mode flag matches the attacker's commitment in its area. Chosen after simulating four designs. |
| D8 | **Attack gesture:** drag an arrow (desktop right-drag, mobile long-press + drag), then one confirm sheet. |
| D9 | **Build time follows manpower cost:** **100 MP = 1 hour** for structures. Growth over the season comes from the existing cost scaling, so there's no separate time table. |
| D10 | **Manpower is charged when a build starts**, not when it's queued. A queued build waits for manpower if the pool is empty. |
| D11 | **Alert the player when manpower is full** (the pool has reached its cap). No alert per finished building. |
| D12 | **Relay Beacons:** the **first 5 are instant**. They came down with the landing party, so they only need to be put in place. From the 6th, beacons cost **100 MP (+10% per beacon)** and follow the time-follows-cost rule (≈1 h and growing). |
| D13 | **Siege tiers scale their MP** (60 / 120 / 240), so their times scale too. |
| D14 | **Town tier-ups stay instant.** They cost gold, and the time rule only covers manpower. |
| D15 | **Cooldowns stay as they are.** The cooldowns-to-charges idea is dropped. |
| D16 | **No decision yet on mid-season vs next-season rollout.** Parked. |
| D17 | **Every cost lives in one place.** The Palisade keeps the 30 MP players pay today (18 min under D9); the unused 150 in `FORT_TIER_LADDER` goes. |
| D18 | **Combat base costs are the ones we already have:** the attack-muster ladder (settled 60, Palisade 150, Fort 300, Titanium Bastion 480, Thunder Bastion 960). |
| D19 | **Enemy arrows are never revealed.** Defenders see the battles on their tiles, not the order behind them. No new warning: the existing attack alerts already cover it. |
| D20 | **Muster flags have no cap.** A flag holds whatever the player puts in it. `musterFlagCap` and "Expand Capacity" go away. |
| D21 | **Settling and structures keep sharing the development slots** (`DEVELOPMENT_PROCESS_LIMIT` = 3, plus `developmentProcessCapacityAdd`). While three long builds run, no tile is settled, auto-settle included. That's a deliberate build-or-grow trade-off. |
| D22 | **Manpower priority:** the next queued build sets aside its cost first. Server auto-settle only spends manpower above that. A muster flag fills up to the size the player set on the slider, which is the player's own choice. |
| D23 | **The 5 instant beacons count beacons built this season**, not beacons owned. Lose one and the replacement costs 100 MP (tough luck). The FOOD-slot waiver (`RELAY_BEACON_FREE_FOOD_SLOT_COUNT` = 5) is a separate rule and stays as it is: it covers the 5 oldest beacons you still own. **Implemented as owned count instead** (2026-09-25) — see B2's Relay Beacons entry for why. |
| D24 | **Builds already queued at rollout count as paid** (today the queue takes manpower at enqueue). They start as normal, with no refunds and no deploy-time check. |

**Out of scope** (dropped 2026-09-24): manpower chunks and the reserve
(former workstream A), and cooldowns becoming charges (former workstream C).
They are kept at the end of this doc for reference.

## 2. Workstreams

### A. Manpower countdown and "Manpower full" alert (D1, D11)

Manpower keeps regenerating continuously, as today (`applyManpowerRegen`).
- **UI:** the manpower bar shows "Manpower full in 3h 42min", computed from
  the cap, current value and regen per minute. No "turn" or "day" wording.
  - Regen 0 during the Titanium Levy freeze (`TITANIUM_LEVY_REGEN_FREEZE_KEY`,
    `runtime-economy.ts`): show "Regen paused · resumes in 1h 12min".
  - A muster flag that is still filling takes manpower out of the pool, so the
    pool may never reach full while it fills. Show "Flag filling · full in …"
    counting the flag's remaining fill.
- **Alert:** "Manpower full" when the pool reaches its cap (see B2,
  Notifications). Schedule it as a per-player deadline, never a per-tick scan
  of all players. Recompute the deadline whenever any of its inputs change:
  manpower spent (builds, settles, attacks, flag fill), cap changes (town
  growth, town lost or captured, Garrison Hall built or lost, rail-depot
  networks) and regen changes (towns, Titanium Levy freeze start and end).

### B. Gold (D4)

- **Remove the gold storage cap** (`computeEmpireStorageCap` GOLD, currently
  income × 24h). Shards are already uncapped, so there's precedent. The cap is
  read in three simulation paths (`runtime-economy.ts`,
  `runtime-player-state-update.ts`, `runtime-passive-income.ts`) and shown on
  the client's gold bar ("x / cap"). All four change together; the bar shows
  the amount and the income only. Strategic resource caps stay.
- **Keep an accrual window, extended to 24h:** `OFFLINE_YIELD_ACCUM_MAX_MS` (12h
  → 24h) and the passive-gold inactivity cutoff in `simulation-service.ts` (12h
  → 24h). Otherwise abandoned accounts accrue gold forever.
- **Give four domains a new effect:** Provincial Governors, Treasury State,
  Enduring Realm and Golden Hegemony all carry `townGoldCapMult`, which has
  nothing to act on once the cap is gone.
- Gold keeps flowing continuously, like manpower.

### B2. Build times: time follows cost (D9–D12)

**Why build times grow** (the reasoning, so it isn't re-argued later):
- **They keep pace with a growing economy.** Flat times let a big empire finish
  things faster than the player can come back and decide, which turns the game
  into clicks. Growing times keep the number of meaningful events per visit
  roughly constant all season.
- **They shift the rhythm from active play to checking in.** Fast at first
  teaches and hooks; slow later fits visits around a normal life (Clash of Clans,
  Travian).
- **They help latecomers catch up.** Early steps are quick and a veteran's next
  step is slow, so a player who joins on day 5 closes much of the gap.
- **They make the choice matter.** A slot busy for hours makes "what do I build?"
  a real decision.
- **They give the opponent time to react.** Strong things (top forts, monument
  stages) are visible while they're being built (Travian's World Wonder).
- **Not for selling speed-ups.** Rush-buy spends earned gold, so it's a gold sink,
  not a shop.

**The rule** (OGame-style: time is derived from cost, with no separate table):

> build time = manpower cost × 36 s ÷ build-speed multiplier  (100 MP = 1 hour)

- Growth comes from cost scaling that already exists (e.g. +10–15% per copy of
  a type, and Sky Dock doubling), so times grow the same way automatically.
- Existing speed effects become the "construction speed" lever:
  `economicStructureBuildSpeedMult` (Cogwork Foundries), fort build speed
  (Titanium Bastions), `settlementSpeedMult`.
- **Scope:** applies to **structures only**. Expand (7.5s), settle (60s), attacks
  and muster keep their current timers. Reach grows through Relay Beacons, which
  follow the rule (D12, D23).
- **Slots are shared (D21):** settles and structures draw from the same
  development slots, so starting three long builds pauses settling. The build
  sheet should say so when the last free slot is taken ("Settling pauses until a
  slot frees up"). `developmentProcessCapacityAdd` effects become much more
  valuable; review them in Phase 5 tuning.
- **Timers show hours:** build progress labels and rings on the map must format
  hours ("2 h 24 min"), in **both renderers** (2D canvas and true-3D).

**Resulting times at today's costs** (before per-copy scaling and speed
effects):

| Structure | MP | Time | Today |
|---|---|---|---|
| Relay Beacon, 1st–5th | **50 flat** (landing party, pre-fab) | 30 min | 60 s |
| Relay Beacon, 6th+ | **100 flat** | 1 h | 60 s |
| Farmstead, Mine, Granary, Waterworks, Umbrite Rig, Census Hall | 80 | 48 min | 5 min |
| Customs House, Weapons Workshop / Factories, Seed Granary | 100 | 1 h | 5 min |
| Mintworks, Synthesizers, Garrison Hall, Governor's Office, Logistics Guild, Caravanary | 150 | 1 h 30 min | 5 min |
| Sky Dock | 150 (doubling per copy) | 1 h 30 → 3 h → 6 h… | 10 min |
| Foundry, Rail Depot, Radar, Assembly Works, Observatory, Advanced Synthesizers | 300 | 3 h | 5–10 min |
| Aether Tower | 400 | 4 h | 10 min |
| Palisade / Fort / Titanium Bastion / Thunder Bastion | 30 / 300 / 480 / 960 | 18 min / 3 h / 4 h 48 / 9 h 36 | 10 min |
| Siege Battery / Tower / Dread Tower | **60 / 120 / 240** | 36 min / 1 h 12 / 2 h 24 | 1 min |
| Monument stages 1–3, final stage | 1,000 ×3, 1,600 | 10 h ×3, 16 h (46 h total) | — |

**Cost changes that come with it:**
- **Relay Beacons (D12, D23):** the first 5 owned cost a discounted flat 50
  MP (30 min build); they came down with the landing party, pre-fab, not
  free. From the 6th, a flat 100 MP.
  **Growth per beacon removed 2026-09-25** (design discussion): compounding
  per-copy cost was judged the wrong lever for "a large manpower pool should
  matter for building" — that's already covered by manpower-cost/build-time
  scaling elsewhere (this table's tier ladders, D9) without needing every
  new structure to also compound. The same call was made for Titanium/
  Umbrite Weapons Factory, which previously escalated 15% per existing copy
  and is now flat 100 MP per copy too (see this table's Customs House row).
  **First-tier cost changed from free/instant to 50 MP/30 min, 2026-09-25**
  (design discussion): a manpower pool should feel like it buys something
  even for the "starter" tier, not just the paid tier.
  **Implemented 2026-09-25 as owned count, not built-this-season** (a
  deviation from D23 as agreed): the count is beacons the player currently
  owns, so a destroyed beacon *does* hand back its free slot and the cheaper
  cost — not the "tough luck" rule agreed in discussion. The season-lifetime
  version needs a new persisted, per-player, per-season counter
  (`docs/agents/state-and-persistence-discipline.md`), and that field's real
  cost turned out to be much higher than the change itself: a single new
  DomainPlayer field touches roughly a dozen files across snapshot export,
  hydration, event recovery, and legacy-snapshot bootstrap
  (`manpowerCapSnapshot`'s own footprint is the reference point). Left as a
  follow-up rather than risking that surface under this phase's test budget.
  Manpower becomes the expansion brake, like Travian's culture points slowing
  new villages, and time follows automatically. Onboarding copy should tell
  the landing-party story when the 6th beacon costs more.
- **Siege ladder (D13):** 60 / 120 / 240 MP instead of 60 at every tier.
- **One place for every cost (D17).** Today the fort and siege ladders
  (`FORT_TIER_LADDER`, `SIEGE_TIER_LADDER`) repeat the manpower costs already in
  `STRUCTURE_COST_DEFINITIONS` (Fort 300, Siege 60), and they disagree for the
  Palisade: 30 in the definitions, 150 in the ladder.
  - **What players actually pay is 30.** `STRUCTURE_REGISTRY` spreads
    `ECONOMIC_SPECS` after `FORT_SPECS`, so the Palisade resolves to the economic
    spec. Building, cancel refunds, rush-buy and the client's cost text all read
    30 from there. The ladder's 150 is never charged.
  - **Fix:** the ladders keep only what's unique to them (defense and attack
    multipliers, tech gating) and read manpower from
    `STRUCTURE_COST_DEFINITIONS`. Drop the unused `FORT_SPECS.WOODEN_FORT`.
    Build time is then derived from that single number too. Add a test that
    every structure's cost comes from the one table.
  - **Result:** the Palisade is the cheap early fort (30 MP, 18 min). Attacking
    it still needs 150 muster, which is combat, not build cost (see D).
- **Town tier-ups (D14)** cost gold and stay instant.

**Early ramp — NOT IMPLEMENTED** (2026-09-25; Phase 1b shipped D9/D12/D13/D17/D23
build-time/cost but not this exception; it needs its own persisted per-player
per-season counter, same shape as the deferred D23 lifetime-beacon counter
below). (the first session must not wait an hour for a Farmstead): the
first 5 beacons are instant (landing party). Separately, other structures take
at most 5 minutes while **either** holds: the player has started fewer than 3
structures this season, **or** they joined the season less than 2 hours ago.
Whichever lasts longer wins. Beacons don't count toward the 3. Store the count
per player per season, the same way as the beacon counter.

**Charging and queueing (D10) — NOT IMPLEMENTED** (2026-09-25; Phase 1b left
the dev queue's reservation model untouched — this is a queue-semantics
change, not a cost/build-time change, so it's separate follow-up work, not a
Phase 1b gap):
- Manpower is charged when a build **starts**. A queued build that can't be
  afforded waits, and the queue shows "waiting for manpower · starts in 40 min"
  (time until regen covers its cost) so it doesn't look stuck.
- **Today the server queue takes manpower at enqueue**
  (`runtime-dev-queue-command-handlers.ts`, `applyManpowerReservation`), so an
  entry only ever waits for a slot. Charge on start changes the entry: it holds
  no manpower until it starts.
- **Start trigger:** the server queue (`tryDrainDevQueue`) only drains on
  enqueue, when a claim or process finishes, and on connect. Nothing drains it
  when regen covers the next entry's cost. Add one per-player deadline, "the
  head entry becomes affordable at T". Compute it from current manpower, regen
  and the head entry's cost, and recompute it on the same triggers as the
  "Manpower full" deadline (A). It runs whether the player is online or not.
  Use a deadline queue, not a per-tick scan (see Risks).
- **Priority (D22):** the head entry's cost is set aside. Auto-settle
  (`runAutoSettleForPlayer`) only spends manpower above it, so it can't starve a
  waiting build and the "starts in" estimate stays true. Muster fill is the
  player's own choice (slider size), so it isn't held back, but the estimate
  must include the flag's remaining fill.
- **Rollout (D24):** entries already queued at deploy carry their paid
  manpower. Mark them paid, and they start as normal when a slot frees up.
- **A queue should run for roughly as long as manpower takes to refill.**
  Then "Manpower full" and "your builds are done" arrive at about the same time,
  giving one reason to return, not ten.
- **Rush-buy pricing is unchanged.** It's based on manpower × remaining fraction
  × 0.5 gold, not on time, so longer builds don't make it more expensive. With
  the gold cap gone, it becomes the main gold sink.

**Notifications (D11):**
- **"Manpower full"** when the pool reaches its cap. This is the main
  "come back" signal: after it, regen is wasted.
  - Email: add a `manpowerFull` value to `EmailNotificationCategory`
    (`player-profile-store.ts`), a toggle on the Email Notifications settings
    page, and handling in `email-alerts.ts`.
  - Send **at most once per absence**: only while the player is offline, and
    not again until they have visited. Auto-settle and flag fill can spend
    and refill the pool while they're away, which would otherwise send a new
    email for every refill.
- **"Your queue is empty"**, optionally.
- **Never** one notification per finished building.

### D. Combat commit rule (D6)

**Core mechanic implemented (2026-09-25); commitment-choice wire protocol
implemented (2026-09-25); commitment-choice UI not yet implemented — see
note below.**

- Replace the per-target loss range (`ATTACK_MANPOWER_LOSS_RANGE`) with **fixed
  loss = commitment**. ✅ `runtime-combat-support.ts`'s `buildLockedCombatResolution`
  now sets a SETTLED-target attack's manpower loss to `lock.manpowerCost`
  directly, win or lose, instead of drawing from `rollSettledAttackManpowerLoss`'s
  range (removed).
- Win chance: `odds = (commit / base)² × base_odds` in `frontier-combat.ts`, on top
  of today's modifiers (exposure, siege, weapons factories, tech). ✅
  `commitOddsMultiplier(commit, base)` in `frontier-combat.ts`, applied to
  `rollFrontierCombat`'s `winChance` (new optional `commitMultiplier` param,
  clamped to `[0, 1]`) from `resolveAttackCombat` in `runtime-combat-support.ts`.
- **Base costs are the existing attack-muster ladder (D18):** settled 60,
  Palisade 150, Fort 300, Titanium Bastion 480, Thunder Bastion 960
  (`requiredMusterForFort`). 1× commitment gives today's win chance; the fort's
  defense multiplier stays as it is. The "settled 30" in earlier examples was
  only illustrative. ✅ unchanged, reused as-is.
- **No cap.** Manual attacks get a commitment choice with a live preview
  ("Commit 30 · 45 · 60 → 40% · 60% · 73%"). ⏳ **Wire protocol done, UI not
  yet implemented.**
  - ✅ The ATTACK message now carries an optional `commitManpower` field
    (`ClientMessageSchema` in `packages/shared/src/messages/messages.ts`),
    threaded through the gateway (`frontier-submit.ts`, `gateway-app.ts`),
    `parseFrontierPayload` (`runtime-command-parsers.ts`), and
    `handleFrontierCommandImpl` (`runtime-frontier-command.ts`, which also
    widens `resolveMusterSource`'s search to the requested commitment, not
    just the floor) into `validateFrontierCommand`. There, a below-floor
    request is clamped up to the floor, and a request the origin's mustered
    manpower can't fund is rejected `INSUFFICIENT_MUSTER` the same way an
    unaffordable floor-only attack always has.
  - ✅ `commitPreviewWinChanceForTarget` in `client-attack-preview-logic.ts`
    computes the win chance at any chosen commit level purely client-side
    (`commitOddsMultiplier` + `requiredMusterForFort` from `@border-empires/shared`
    applied to the cached `ATTACK_PREVIEW` response's base `winChance`) — no
    extra round trip per slider tick.
  - ❌ **Not yet implemented: the actual slider UI.** No caller sends a
    `commitManpower` above the floor yet — the "Launch Attack" tile-menu
    action (`client-tile-action-logic.ts`) fires immediately on click with no
    confirmation step to choose a commitment from, so
    `commitPreviewWinChanceForTarget` above has no UI consumer yet either.
    Building that UI (a commit-amount control on the launch-attack action,
    reading `commitPreviewWinChanceForTarget` for the live preview, passing
    the chosen value through `sendAttack`'s new optional `commitManpower`
    parameter in `client-action-flow.ts`) — plus removing `musterFlagCap` so
    a higher commitment is actually reachable (D20, Phase 3a) — is the next
    slice of this workstream.
- The flag sheet's slider and effort level (normal / extra / double) show the
  expected win chance against an enemy settled tile. Phase 3b can also paint
  the win chance on each target tile in view while the slider moves (see F).
  Depends on the commitment-choice UI above.
- Enemy FRONTIER stays an automatic capture. Barbarians keep a flat cost. ✅
  `resolveAttackCombat` excludes both FRONTIER targets and barbarian-origin
  attacks (`lock.playerId === "barbarian-1"`, whose `manpowerCost` is always 0)
  from the commit multiplier, so neither is affected by this change.

### E. Shield flags and flag investment (D7)

See `docs/muster-fronts-proposal.md` for the full rules and simulation.
- Defend mode (HOLD) shields an area and matches commitments. An attacking flag
  shields only its own tile.
- An attacking flag uses the "match their defense" commitment automatically
  (Efficient ≈ 55% / Fast).
- **No flag cap (D20):** remove `musterFlagCap` (today 10% of the manpower
  cap, at most 150, plus "Expand Capacity" upgrades). A flag keeps filling
  until it reaches the size the player chose on the sheet, or the pool runs dry.
  "Expand Capacity" goes away: the `UPGRADE_MUSTER_CAP` command, the flag's
  `capLevel` field, the tile-menu button and the AI metrics row that sums flag
  capacity. **There is nothing to refund:** the upgrade is free today (see the
  comment above `musterFlagCap` in `packages/shared/src/config.ts`).
  `MUSTER_MAX_TILES` (2 flags, plus tech/domain/wonder bonuses) stays.

### F. Arrow gesture UX (D8)

- Desktop right-drag and mobile long-press + drag draw an arrow along the real
  MARCH route (green / amber / red, cursor label). A confirm sheet has size,
  Efficient/Fast and Go.
- Defend: tap your own tile → "Defend here". No new warning; the existing
  attack alerts already tell the player.
- The arrow persists as the flag's order, **visible only to its owner (and
  allies, if we want that)**. Enemies see only the battles on their tiles
  (D19).
- **Win-chance map paint:** while the sheet is open, each target tile in view
  shows its win chance for the current slider and effort. It's one short
  calculation per tile (`(commit / base)² × base_odds` plus modifiers), done on
  the client for tiles in view only and recomputed on slider change. It uses
  only what the client can see (fort tier, siege, exposure). Hidden enemy
  modifiers stay out, so the number is labelled "expected".
- **Both renderers** (2D canvas and true-3D) for the arrow, shield area, front
  highlight and win-chance paint.
- Touches `client-map-input.ts`: right-click today only cancels, and plain drag
  must keep panning.

### G. The visit loop UI

From `docs/visit-as-a-turn.md`:
1. **Report:** reorder the Activity dashboard to show your own completions first,
   then progress deltas. Depends on Activity dashboard Phases 1–2.
2. **Agenda:** 3–5 ranked decisions (town ready to upgrade, manpower full or
   nearly full, idle slots, unfed town, abilities off cooldown).
3. **End-visit forecast:** what finishes while you're away, when manpower is
   full, town tier ETAs.
4. **Notifications:** push notifications and further email categories beyond
   "Manpower full" (Phase 1). Also attacks and good-news events.

### H. AI

The planner (`apps/simulation/src/ai/`) must handle build times with charge on
start, the new beacon and siege costs, the commit rule, shields and arrow flags.
It must also handle shared slots (D21): it reserves development slots today
(`reservedDevelopmentSlots` in `automation-command-planner.ts`), so it needs to
keep a slot for settling instead of filling all three with long builds. Respect `docs/agents/ai-guardrails.md`
(no heavy selectors in snapshot builders).

## 3. Delivery order

Each phase is one or a few PRs. Each needs a changelog entry
(`CLIENT_CHANGELOG_ENTRIES`), regression tests, `pnpm lint` / `test` /
`check:file-lines` / `build`, and both renderers for any map visual.

| Phase | Contents | Depends on |
|---|---|---|
| **1. Gold and alert** ✅ done (2026-09-25) | B (no gold cap, 24h accrual windows, domain rework) + A (the "Manpower full in …" countdown and the "Manpower full" email) | — |
| **1b. Build times** ✅ done (2026-09-25), with 2 deviations | B2 (time follows cost, instant first 5 beacons and early ramp, charge on start with the deadline start trigger and D22 priority, "waiting for manpower", beacon 100 MP from the 6th, siege 60/120/240, one cost table, hour timers in both renderers, D24 rollout) — shipped: time-follows-cost, first-5-beacons-free (as owned count not lifetime, see D23 above), one cost table. **Not shipped:** early ramp exception, charge-on-start/D10 queue rework — both deferred, see their sections above | — (pairs well with 1) |
| **2. Commit rule** ⏳ mechanic + wire protocol done (2026-09-25), UI pending | D (fixed loss = commitment, odds formula, new base costs, manual commitment preview) — shipped: fixed loss = commitment, odds formula, the `commitManpower` wire field end-to-end, and the client-side preview math. **Not shipped:** the actual slider/confirm UI (every manual attack still commits exactly the floor since nothing sends a higher value yet), see D above | — (can run in parallel with 1) |
| **3a. Shield flags (server)** | E (Defend matching, own-tile shield, auto-commit, remove the flag cap and Expand Capacity) | 2 |
| **3b. Arrow UX (client)** | F (gestures, arrow, sheet, win-chance paint), both renderers | 3a |
| **4. Visit loop UI** | G (report, agenda, forecast) | 1, Activity dashboard P1–2 |
| **5. AI + tuning** | H, plus telemetry-driven balance | 1–3 |

Phases 1, 1b and 2 give players the most noticeable change with the least risk, so
start there.

## 4. Open questions

Resolved 2026-09-24: Q8 (scale siege MP), Q9 (beacons 100 MP from the 6th),
Q10 (tier-ups instant). Moot after the scope cut: Q1 (chunk anchor), Q2 (gold
chunked), Q5 (charge counts). Parked: Q7 (mid-season or next season).

Resolved 2026-09-24 (second round): Q3 (existing ladder, D18), Q6 (never
revealed, no new warning, D19), Q11 (Palisade 30, one cost table, D17),
Q4 (no flag cap, D20).

Gap review 2026-09-24 (checked against the code): shared slots (D21), manpower
priority (D22), beacon count (D23), rollout of queued builds (D24), the queue
start trigger, "Manpower full" recalculation and email throttling, the free
Expand Capacity, gold-cap readers, and hour timers in both renderers are all
written in above.

No open questions remain.

## 5. Risks

- **Balance shock:** combat costs and build pacing change at the same time. Ship behind flags where possible, and prefer a season start.
- **AI regressions:** the planner assumes short builds and fixed combat costs.
  Budget time for Phase 5, and keep AI players functional after every phase.
- **Performance:** the "Manpower full" alert and queued-build starts must be
  event-driven or deadline-queue based, never a per-tick scan of all players (see the
  out-of-reach decay queue for the pattern). Both deadlines are one entry per
  player, replaced on recompute, so the queue stays bounded by player count.
- **Slot lock-up (D21):** players who fill all slots with long builds stop
  settling. Watch in telemetry how often settling is blocked by slots, and tune
  `developmentProcessCapacityAdd` in Phase 5 if it hurts.

## Appendix: dropped ideas (2026-09-24)

Kept for reference; not part of the plan.

### Manpower chunks — Manpower replenishment clock (D1–D3)

**Today:** manpower regenerates continuously. Each town adds cap and regen at a
720-minute ratio (`TOWN_MANPOWER_BY_TIER`). The starting capital is 720 cap at
0.4/min. Cap-only bonuses exist (Garrison Hall +150, rail-depot networks).
Regen is applied in `applyManpowerRegen` and the manpower modules under
`apps/simulation/src/`.

**Change:**
- Every 6 hours per player (personal anchor, see open question Q1), credit one
  **chunk = 6h × current regen per minute**.
- **Storage:** unspent chunks stack up to 24h of regen. Recommended model: the
  existing cap becomes the **active pool**, and a chunk that doesn't fit spills
  into a **reserve** (max 24h of regen minus the cap), which tops the pool up as
  it's spent. This keeps attack size the same while nothing is lost when a player
  is away. (Alternative: raise the pool to 24h of regen, which doubles the maximum
  alpha strike.)
- Muster flags keep filling from the pool, which is now fed in chunks.
- **UI:** the manpower bar shows the pool, the reserve and "Manpower replenishes
  in 3h 42min".
- **Persistence:** store the next chunk time and the reserve per player,
  bounded, and gauged (`docs/agents/state-and-persistence-discipline.md`).

### Cooldowns as charges — Cooldowns on the replenishment clock

**Principle:** a player who visits 2–3 times a day should get the same use out
of their abilities as one who stays online all day. Minute-scale cooldowns
reward staying online, which contradicts the design (`docs/core-loop.md` §1,
pillar 3).

**Proposal:** turn long and medium cooldowns into **charges that refill with
each manpower chunk**, and stack like the chunks (up to 4 chunks' worth). Keep a
short *spacing* cooldown between uses so charges can't all fire in the same
second. The starting values below are for tuning:

| Ability / timer | Today | Proposal |
|---|---|---|
| Reveal Empire Stats | 5 min | 4 charges per chunk, 1 min spacing |
| Survey Sweep | 12 min | 3 per chunk |
| Aether Purge (`aether_lance`) | 10 min | 3 per chunk |
| Aether Wall | 8 min (lasts 20 min) | 3 per chunk |
| Aether Bridge | 30 min (lasts 8 min) | 2 per chunk |
| Create / Remove Mountain | 20 min | 2 per chunk |
| Sky Dock Bombard | 20 min | 3 per chunk, per Sky Dock |
| World Engine Strike | 10 min + 1,000 gold | 2 per chunk (gold cost stays) |
| Aegis Lock | 60 min (lasts 15 min) | 1 per chunk |
| Siphon | 10 min / 60 min | Being redesigned as Observatory "siphon mode" (separate session, `agent/siphon-slot-transfer`); no charges needed |
| Imperial Exchange Levy | 24h | Keep: 1 per 4 chunks |
| Astral Dock Launch | 24h (lasts 24h) | Keep |
| Converter mode flip | 60 min | Keep (economic, not tactical) |
| Titanium Levy regen freeze | 2h | Review: express as "skips the next chunk" |
| Truces | 12h / 24h | Keep (2 and 4 chunks) |
| Dock crossing 30s, collect 20s, barbarian 15s, combat lock 30s | seconds | Keep (moment-to-moment pacing) |

Also review the **shared Observatory cooldown** (`stampObservatoryCooldown`,
used by abilities cast from an Observatory) and domains that scale cooldowns
(`observatoryCooldownMult`). They should scale charges instead.
