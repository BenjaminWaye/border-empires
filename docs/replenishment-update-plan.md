# The Replenishment Update — Plan

> **Status:** Plan, agreed in design discussion 2026-09-23. Nothing is built yet.
> Goal: make each visit feel like a turn, without calling it a turn.
> Background: `docs/core-loop.md` §0, `docs/visit-as-a-turn.md`,
> `docs/muster-fronts-proposal.md`.

## 1. Decisions so far

| # | Decision |
|---|---|
| D1 | No "turns", "day N" or turn counter. Players join at different times, so the clock is personal: **"Manpower replenishes in 3h 42min"**. |
| D2 | Manpower arrives in **chunks every 6 hours**, not continuously. |
| D3 | **Missing a replenishment is fine:** chunks stack for **at least 24 hours** (4 chunks). |
| D4 | **Remove the gold cap.** |
| D5 | **Nothing resolves at a shared global tick.** Combat stays continuous and tile by tile. |
| D6 | **Commit rule:** committed MP is always lost; `odds = (commit / base)² × base_odds`; no cap on commitment. |
| D7 | **Shield flags:** a Defend-mode flag matches the attacker's commitment in its area. Chosen after simulating four designs. |
| D8 | **Attack gesture:** drag an arrow (desktop right-drag, mobile long-press + drag), then one confirm sheet. |
| D9 | **Build time follows manpower cost:** **100 MP = 1 hour** for structures. Growth over the season comes from the existing cost scaling, so there's no separate time table. |
| D10 | **Manpower is charged when a build starts**, not when it's queued. A queued build waits for manpower if the pool is empty. |
| D11 | **Alert the player when manpower is full** (the pool has reached its cap). No alert per finished building. |
| D12 | **Relay Beacons:** the **first 5 are instant**. From the 6th, beacons follow the same time-follows-cost rule. |

## 2. Workstreams

### A. Manpower replenishment clock (D1–D3)

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

### B. Gold (D4)

- **Remove the gold storage cap** (`computeEmpireStorageCap` GOLD, currently
  income × 24h). Shards are already uncapped, so there's precedent.
- **Keep an accrual window, extended to 24h:** `OFFLINE_YIELD_ACCUM_MAX_MS` (12h
  → 24h) and the passive-gold inactivity cutoff in `simulation-service.ts` (12h
  → 24h). Otherwise abandoned accounts accrue gold forever.
- **Give four domains a new effect:** Provincial Governors, Treasury State,
  Enduring Realm and Golden Hegemony all carry `townGoldCapMult`, which has
  nothing to act on once the cap is gone.
- Gold keeps flowing continuously. Only manpower is chunked (Q2).

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
  and muster keep their current timers. Settling happens tile by tile and the
  reach cycle has to stay fast.

**Resulting times at today's costs** (before per-copy scaling and speed
effects):

| Structure | MP | Time | Today |
|---|---|---|---|
| Relay Beacon, 1st–5th | 30 | **instant** (early ramp) | 60 s |
| Relay Beacon, 6th+ | 30 (+10%/copy) | 18 min, growing | 60 s |
| Farmstead, Mine, Granary, Waterworks, Umbrite Rig, Census Hall | 80 | 48 min | 5 min |
| Customs House, Weapons Workshop / Factories, Seed Granary | 100 | 1 h (factories +15%/copy) | 5 min |
| Mintworks, Synthesizers, Garrison Hall, Governor's Office, Logistics Guild, Caravanary | 150 | 1 h 30 min | 5 min |
| Sky Dock | 150 (doubling per copy) | 1 h 30 → 3 h → 6 h… | 10 min |
| Foundry, Rail Depot, Radar, Assembly Works, Observatory, Advanced Synthesizers | 300 | 3 h | 5–10 min |
| Aether Tower | 400 | 4 h | 10 min |
| Palisade / Fort / Titanium Bastion / Thunder Bastion | 150 / 300 / 480 / 960 | 1 h 30 / 3 h / 4 h 48 / 9 h 36 | 10 min |
| Siege Battery / Tower / Dread Tower | 60 each | 36 min each | 1 min |
| Monument stages 1–3, final stage | 1,000 ×3, 1,600 | 10 h ×3, 16 h (46 h total) | — |

**Things to fix alongside:**
- **The siege ladder** costs 60 MP at every tier, so all tiers get the same 36
  minutes. Either scale their MP (e.g. 60 / 120 / 240) or give siege its own
  time factor (Q8).
- **The Palisade** costs 30 MP in `STRUCTURE_BUILD_COSTS` but 150 in
  `FORT_TIER_LADDER`. Pick one before deriving time from it.
- **Beacons:** under the rule the 6th beacon takes only 18 minutes. If beacons
  should be a real brake, like Travian's culture points slowing new villages,
  raise the cost from the 6th beacon to about 100 MP (≈1 h), growing 10% per
  beacon. Recommendation: do this. Manpower becomes the expansion brake and time
  follows automatically (Q9).
- **Town tier-ups** cost gold, not manpower, so the rule doesn't cover them. Keep
  them instant, or give them their own times (e.g. 1 / 3 / 6 / 12 h) (Q10).

**Early ramp** (the first session must not wait an hour for a Farmstead): the
first 5 beacons are instant, and the player's first 3 structures of a season
(or everything in their first 2 hours) take at most 5 minutes.

**Charging and queueing (D10):**
- Manpower is charged when a build **starts**. Queued builds wait for manpower,
  and the queue shows "waiting for manpower · next chunk in 1h 20m" so it doesn't
  look stuck.
- **A typical visit's queue should last about as long as the gap between
  chunks (≈6 h).** Then the chunk and "your builds are done" arrive together,
  giving one reason to return, not ten.
- **Rush-buy pricing is unchanged.** It's based on manpower × remaining fraction
  × 0.5 gold, not on time, so longer builds don't make it more expensive. With
  the gold cap gone, it becomes the main gold sink.

**Notifications (D11):**
- **"Manpower full"** when the active pool reaches its cap. This is the main
  "come back" signal; the reserve starts filling after this point.
- **"Your queue is empty"**, optionally.
- **Never** one notification per finished building.

### C. Cooldowns on the replenishment clock

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

### D. Combat commit rule (D6)

- Replace the per-target loss range (`ATTACK_MANPOWER_LOSS_RANGE`) with **fixed
  loss = commitment**.
- Win chance: `odds = (commit / base)² × base_odds` in `frontier-combat.ts`, on top
  of today's modifiers (exposure, siege, weapons factories, tech).
- **New base costs:** settled 30, fort 300 (Q3: the other fort tiers, and whether
  every target starts at the same base chance).
- **No cap.** Manual attacks get a commitment choice with a live preview
  ("Commit 30 · 45 · 60 → 40% · 60% · 73%").
- Enemy FRONTIER stays an automatic capture. Barbarians keep a flat cost.

### E. Shield flags and flag investment (D7)

See `docs/muster-fronts-proposal.md` for the full rules and simulation.
- Defend mode (HOLD) shields an area and matches commitments. An attacking flag
  shields only its own tile.
- An attacking flag uses the "match their defense" commitment automatically
  (Efficient ≈ 55% / Fast).
- **Flag caps:** replace `musterFlagCap` (10% of the cap, at most 150) with
  "limited by the pool" (Q4), and revisit "Expand Capacity" and
  `MUSTER_MAX_TILES`.

### F. Arrow gesture UX (D8)

- Desktop right-drag and mobile long-press + drag draw an arrow along the real
  MARCH route (green / amber / red, cursor label). A confirm sheet has size,
  Efficient/Fast and Go.
- Defend: "Defend here", or one tap from a threat warning.
- The arrow persists as the flag's order, and enemies with vision see it.
- **Both renderers** (2D canvas and true-3D) for the arrow, shield area and front
  highlight.
- Touches `client-map-input.ts`: right-click today only cancels, and plain drag
  must keep panning.

### G. The visit loop UI

From `docs/visit-as-a-turn.md`:
1. **Report:** reorder the Activity dashboard to show your own completions first,
   then progress deltas. Depends on Activity dashboard Phases 1–2.
2. **Agenda:** 3–5 ranked decisions (town ready to upgrade, pool or reserve full,
   idle slots, unfed town, a threat arrow aimed at you with a one-tap "Defend:
   match", abilities with charges ready).
3. **End-visit forecast:** what finishes while you're away, the next manpower
   chunk, town tier ETAs.
4. **Notifications:** a "Manpower replenished" email category first, push
   notifications later. Also threat arrows and good-news events.

### H. AI

The planner (`apps/simulation/src/ai/`) must handle chunked manpower, charges,
the commit rule, shields and arrow flags. Respect `docs/agents/ai-guardrails.md`
(no heavy selectors in snapshot builders).

## 3. Delivery order

Each phase is one or a few PRs. Each needs a changelog entry
(`CLIENT_CHANGELOG_ENTRIES`), regression tests, `pnpm lint` / `test` /
`check:file-lines` / `build`, and both renderers for any map visual.

| Phase | Contents | Depends on |
|---|---|---|
| **1. Economy clock** | A (manpower chunks, reserve, 24h stacking) + B (no gold cap, 24h windows, domain rework) + the countdown UI + the "Manpower full" email (D11) | — |
| **1b. Build times** | B2 (time follows cost, instant first 5 beacons and early ramp, charge on start, queue "waiting for manpower", siege/palisade/beacon cost fixes) | 1 (charging on start depends on chunks) |
| **2. Charges** | C (cooldowns → charges per chunk, Observatory cooldown review) | 1 |
| **3. Commit rule** | D (fixed loss = commitment, odds formula, new base costs, manual commitment preview) | — (can run in parallel with 1–2) |
| **4a. Shield flags (server)** | E (Defend matching, own-tile shield, auto-commit, flag caps) | 3 |
| **4b. Arrow UX (client)** | F (gestures, arrow, sheet, threat warning), both renderers | 4a |
| **5. Visit loop UI** | G (report, agenda, forecast) | 1, 2, Activity dashboard P1–2 |
| **6. AI + tuning** | H, plus telemetry-driven balance | 1–4 |

Phases 1 and 3 give players the most noticeable change with the least risk, so
start there.

## 4. Open questions

- **Q1.** Where the personal 6h anchor starts: season join, account creation, or
  "6h after the last chunk". Can a player shift it, e.g. to match their
  timezone?
- **Q2.** Gold continuous or chunked with manpower. Recommendation: continuous,
  so only manpower sets the rhythm.
- **Q3.** Base costs for the other fort tiers, and whether every target starts at
  the same win chance at 1×.
- **Q4.** Flag caps under the investment model: pool-limited, and does "Expand
  Capacity" go away?
- **Q5.** Starting charge counts per ability (table in §C).
- **Q6.** How much of an enemy arrow is revealed.
- **Q8.** The siege ladder: scale MP per tier, or give siege its own time factor?
- **Q9.** Beacons from the 6th: raise the cost to about 100 MP (≈1 h, +10% per
  beacon)? Recommended.
- **Q10.** Town tier-ups: keep them instant (gold only), or give them their own
  times?
- **Q7.** Mid-season rollout or next season. A season boundary is safer, because
  manpower, cooldowns and combat all change.

## 5. Risks

- **Banked alpha strikes:** 24h of stacked manpower allows a big hit on a
  sleeping player. The mitigations are the reserve model (the active pool stays
  the same size) and shields, which are funded from stacked manpower too.
- **Balance shock:** combat costs, cooldowns and manpower pacing change at the
  same time. Ship behind flags where possible, and prefer a season start.
- **AI regressions:** the planner assumes continuous regen and fixed costs.
  Budget time for Phase 6, and keep AI players functional after every phase.
- **Performance:** chunk accrual and charge refill must be event-driven or
  deadline-queue based, never a per-tick scan of all players (see the
  out-of-reach decay queue for the pattern).
