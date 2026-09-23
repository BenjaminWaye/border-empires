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
| **1. Economy clock** | A (manpower chunks, reserve, 24h stacking) + B (no gold cap, 24h windows, domain rework) + the countdown UI + the "Manpower replenished" email | — |
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
