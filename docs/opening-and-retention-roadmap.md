# Opening & Retention Roadmap

> **Status:** Proposed plan. Consolidates every action point from the
> opening investigation into one prioritized, phased sequence.
>
> **Source docs:** `docs/opening-experience-exploration-brief.md` (the
> diagnosis), `docs/while-you-were-away-report-plan.md` (Phase 2's detailed
> spec), `docs/expansion-motivation-exploration-brief.md` (the mid-game
> companion, which Phase 4 overlaps), and
> `docs/terrain-relevance-design.md` (why the map is currently strategically
> inert, and the four layers that would change it).

---

## The thesis in one paragraph

Border Empires is not missing systems. It has a reach-border contest model,
a barbarian threat that escalates, waystation discovery boons, scheduled
shard rain, five victory paths, an exclusive domain tree, alliance and truce
diplomacy, a calibrated daily-narrative generator, and player-facing attack
notifications. **Almost none of it fires in a new player's first days**,
because the world holds ~10 empires across 204,800 tiles with spawn
placement that actively maximizes their separation. The work below is
therefore mostly *turning on what exists* and *placing it where a new player
will meet it* — not building new mechanics.

## Honest limitation, read before committing to this

Everything in the source docs was derived by reading code. **No telemetry,
retention data, session recordings, or playtests informed any of it.** The
analysis has already been wrong three times in this investigation (tech
pricing, vision radius, and the spawn-distance lever — see the opening
brief's §8), each time because a plausible reading of one file was not
checked against the code that actually runs.

That is why Phase 0 is measurement and why it is first. If Phase 0's numbers
contradict this plan, the numbers win.

---

## Phase 0 — Measure (do this first, it is small)

Cheap instrumentation that de-risks every later decision. There is already a
structured gateway telemetry surface (`recordGatewayEvent`, ~82 call sites),
so this is adding event names, not building a system.

| # | Item | Size | Done when |
|---|---|---|---|
| 0.1 | **Time-to-first-contact.** Emit an event when a player first sees a rival or barbarian tile, and when mustering unlocks. | S | We know the real distribution, not a geometry estimate. |
| 0.2 | **Session-1 funnel.** Instrument the onboarding checklist's four goals plus first-tech, first-beacon, and session end. | S | We know where new players actually stop. |
| 0.3 | **Land fraction and content density** on a continents 640×320 map, from `apps/worldgen-lab`. | S | Every density argument in the brief's §2C is grounded in a real number. |
| 0.4 | **Is `SIMULATION_AI_PLAYER_COUNT = 5` a CPU ceiling or a choice?** Run the load harness (`docs/agents/topics/load-harness.md`) at 10 / 20 / 40 AI. | M | Phase 3's lever selection is decided by data, not by reading a config comment. |

**Why first:** Phases 1 and 2 are genuinely independent of these answers and
can run in parallel. Phase 3 is not — its entire lever choice depends on 0.3
and 0.4, and picking wrong there is the most expensive mistake available.

---

## Phase 1 — Make session 1 an experience

Four independent, small changes. **None depends on density**, so this ships
regardless of what Phase 0 finds. Together they give the opening the four
things it currently lacks: a look at the map, a choice about it, a surprise,
and a frame.

| # | Item | Size | Done when |
|---|---|---|---|
| 1.1 | **Spawn reveal.** One-time ~radius-12 reveal at spawn showing terrain, towns and docks — **not** individual resource tiles, which stay behind their existing per-category tech gates (`hasRevealedResourceForPlayer`). | S | A new player arrives with a map worth having an opinion about. Fixes the absurdity that spawn placement *guarantees* a town and food within 10 tiles, then hides both and makes "find a town" the first objective. |
| 1.1b | **Cluster-level resource hint** (see §1.1b below). Reveal nearby *cluster names and rough positions* — "Titanium Hills, northeast" — without revealing individual resource tiles, so the tech-reveal gate survives intact. | S | **Required for 1.2 to be a real decision**; see below. |
| 1.1c | **Tag techs and domains with their terrain precondition** — "Rigging Works — reveals Umbrite. *None detected near your territory.*" See `docs/terrain-relevance-design.md` L1.2. | S | Stops players spending 40 gold (≈4 town-days) on a reveal for a resource their region does not have. Highest value-per-line change identified. |
| 1.2 | **Tier-1 domain choice at minute 0**, free. Reuse the `pendingGalacticWonderBonus` JoinSeason plumbing. **Ship with 1.1 and 1.1b, not before.** | M | Every empire starts as *somebody*, and season N+1 opens differently from season N. |
| 1.2b | **Defer Clockwork Stipend's resource sub-choice** to first use instead of purchase time. Currently "locked forever" at purchase (`tech-domain-bridge.ts`). | S | The one pick that cannot be made well even with 1.1b. |
| 1.3 | **Guarantee one waystation in the starting reach-5 band.** One worldgen placement rule. | S | Every player gets the game's best surprise beat in session 1 instead of ~12% of them. |
| 1.4 | **Arrival decree.** Fire a spawn-time version of the Imperial Court letter, reusing the parchment treatment in `client-space-view-welcome-letter.ts` (which currently fires only *after* a victory). | S | Copy and placement only. The writing is already good and already written. |

**Phase 1 success:** a first session has a beginning (1.4), a look (1.1), a
decision (1.2) and a surprise (1.3). Measure against 0.2's funnel.


### §1.1b — Why the ground has to be visible before the domain pick

The tier-1 domains are **already map-contingent by design** — this is not a
change being proposed, it is existing intent that cannot currently be
exercised. Slot supply comes *only* from owned resource tiles
(`BASE_SLOTS_BY_TILE_RESOURCE`: TITANIUM tile → 1 TITANIUM slot, GEMS → 1
CRYSTAL, UMBRITE → 1 UMBRITE, FARM → 1 FOOD, FISH → 2), and structures
demand those slots or go dormant (`STRUCTURE_SLOT_DEMAND`: a Fort needs 1
TITANIUM). So what is in the ground decides what you can build at all.

Against that, four of the five tier-1 domains are map-contingent:

| Domain | Effect | Map dependency |
|---|---|---|
| **Clockwork Stipend** | `chosenResourceSlotGrant: 1`, with a **permanent** TITANIUM/UMBRITE/CRYSTAL sub-choice | Its own catalog text says "regardless of the map" — it *is* the map-compensation pick, and it demands naming the resource you are short of before you can see what you have. |
| **Dwarf Kingdom** | `fortTitaniumSlotWaiverCount: 3` + 1.5× fort build speed | **Inverse** dependency: on titanium-poor ground the waiver is the only way to field early forts; on titanium-rich ground it is nearly dead and you are buying build speed alone. |
| **Mercantile Charter** | 1.5× gold and 1.25× growth on your first three **non-SETTLEMENT** towns (`firstThreeTownKeysForPlayer` excludes the free starting settlement) | Scales with how many real world-gen towns sit near spawn. Town-dense patch: compounds from day 1. Town-sparse patch: idles. |
| **Dewildernisation** | `attackVsBarbariansMult: 1.5`, applied only when `defenderOwnerId.startsWith("barbarian")` | Worth exactly as much as there are barbarians near you — a coin flip at 30 seeded tiles placed ≥12 from spawn. |
| **Frontier Doctrine** | settle speed + a development slot | The map-independent one. The safe default, and correctly so. |

**The tension this creates in 1.1.** Resource tiles are hidden behind tech
reveal gates (`masonry` → Titanium, `leatherworking` → Umbrite,
`crystal-lattices` → Crystal), not only fog. A reveal that deliberately
excludes resources therefore does *not* inform the pick that most needs
informing.

**Resolution (1.1b):** reveal clusters, not tiles. Cluster types are already
self-describing — `FERTILE_PLAINS`→FARM, `TITANIUM_HILLS`→TITANIUM,
`CRYSTAL_BASIN`→GEMS, `HORSE_STEPPES`→UMBRITE, `COASTAL_SHOALS`→FISH
(`server-worldgen-terrain.ts:143-149`). Naming nearby clusters and their
rough bearing tells the player "this region is titanium-poor" without
handing them the per-tile reveal the tech gates exist to sell. It is also
lore-consistent: a new duke would know roughly what country they had been
given.

**Plus 1.2b:** even with 1.1b, Clockwork Stipend's permanently-locked
resource sub-choice is the one pick a player cannot make well on arrival.
Resolving it at first use — the first time a structure would go dormant for
want of a slot — turns a blind guess into an informed one without removing
the commitment.

---

## Phase 2 — Make them come back

Also **density-independent** — barbarian attacks flow through the same
combat-log record site as player attacks, so the return report has content
today. Full spec in `docs/while-you-were-away-report-plan.md`.

| # | Item | Size | Done when |
|---|---|---|---|
| 2.1 | **`last_seen_at`** on `player_profiles`. Clean `ALTER TABLE ADD COLUMN` pattern, already used six times. | S | An away window exists at all. |
| 2.2 | **Personal return report.** Read-time aggregation over the existing `territory-flip-log` and `combat-manpower-log`: attacked-by-X, tiles lost, tiles gained (which covers offline waypoint/auto-settle results free). Window capped at 24h and labelled honestly. | M | Players open the game to *news* rather than a refilled bar. |
| 2.3 | **World digest to players.** Render `buildDailyStory`'s ranked events under the personal section. Delivery change only — the generator and its significance calibration already exist and currently go to Slack. | S | The narrative engine finally has the right audience. |
| 2.4 | **Victory-path progress readout.** Thresholds already live in `server-game-constants.ts` with no surface anywhere. Extend the `client-domain-progress-card.ts` pattern. | M | A day-1 player can name what they are trying to do. **Also closes the expansion brief's §5D**, so one surface serves both ends of the game. |

**Architectural constraint:** derive at read time; do **not** grow
`player.eventLog` (a 50-entry ring already serialized into every player
snapshot) into this. See the report plan's §4 and
`docs/agents/state-and-persistence-discipline.md`.

**Phase 2 success:** session 2 opens on what changed, not on a list of your
own clicks, and the player can state a goal.

---

## Phase 3 — Supply the input (density)

**The gate on everything else.** Gated in turn on Phase 0.3 and 0.4. Every
system in Phase 2 and most of the game's best mechanics are mirrors — only
as interesting as the world they reflect.

| # | Item | Size | Done when |
|---|---|---|---|
| 3.1 | **Promote rally links.** `/r/<code>` already spawns an invitee within 24 tiles at `minSpawnDistance: 3`, bypassing the dispersion objective entirely. Make the invite flow prominent. | S | **Cheapest density lever that exists** — no CPU cost, no "who neighbours whom" design question. Can ship in Phase 1 if convenient. Only helps players who arrive with a friend. |
| 3.2 | **Shrink the world**, if 0.3 supports it. `WORLD_WIDTH`/`HEIGHT` are plain constants, and 640×320 was chosen to preserve tile count across an aspect-ratio fix, not from a density target. Halving area quadruples encounter probability with no placement-logic change. | M | Note several content counts are floors (`max(70, …)` towns, fixed 238 clusters), so content density rises automatically — verify in worldgen-lab. |
| 3.3 | **Pod-seeding**, if 3.2 is insufficient. Generalize `RALLY_SPAWN_SEARCH_ORDER` so each new spawn lands in a band around an existing one instead of maximizing distance from all of them. | L | Forces a real design decision — who neighbours whom (join time? rating? random?) — which is why it is not first. |
| 3.4 | **Raise the AI roster**, only if 0.4 says there is headroom. Does nothing alone while `farthestPointFill` maximizes dispersion, so pair with 3.2 or 3.3. | M | — |
| 3.5 | **Barbarian proximity and telegraphy.** Make them approaching weather rather than opt-in encounters: closer, and visible with a legible arrival time. Jeopardy with advance warning is not offline punishment — the player gets to act. | M | Session 2 has a threat even for a player with no human neighbour. |
| 3.6 | **An early, personal, in-reach first event.** Re-aim shard rain (or a cut-down cousin) so a new player's first one fires early, inside their reach, paying something legible at that stage (manpower, gold, a tech) rather than Shards, which fund a late-game system they have no concept of. | M | Session 1 or 2 has a deadline. |

**Phase 3 success:** first contact inside session 1–3 (measured by 0.1);
mustering unlocks; the ENEMY_EMPIRE tip fires; `grantAnchorToBorder`'s
contested-border branch actually executes.

---

## Phase 4 — Make the ongoing loop deep

Beyond the opening. Mostly the expansion brief's territory; listed here so
the sequence is complete.

| # | Item | Size | Notes |
|---|---|---|---|
| 4.1 | **Fix empire integrity's input.** `EMPIRE_INTEGRITY_ENABLED = "true"` in prod and staging today, but `empireIntegrity` is a direct alias for `defensibilityScore` — a global compactness ratio the expansion brief reports parks every realistic empire near ~50%, making a live whole-economy multiplier inert. **Verify that ~50% claim against `defense-consolidation-exploration.md` before acting.** | L | Highest-value mid-game item: an uncapped multiplier that ties expanding *well* to a real payoff. |
| 4.2 | **Scale `DEVELOPMENT_PROCESS_LIMIT` with settlement count**, so settling earns build throughput instead of competing with it for the same three slots. | M | Expansion brief §7.2. |
| 4.3 | **A second manpower sink in the opening.** 720 manpower with one legal use is a big number without tension. Largely solved by Phase 3 (attacking competes with expanding); the cheap interim is to stop the guaranteed first town being a free 30-manpower walk-on. | S | Do *after* Phase 3 — adding friction before there is a reason to want the land suppresses expansion further. |
| 4.4 | **Signal tech price escalation in the UI.** The live price is honest (`init-payload.ts:963`) but shows only the current number, giving no hint this is a one-of-three-this-week decision at 10 → 40 → 70 → 100. | S | Small, and it makes an already-good system legible. |
| 4.5 | **Builds and discoveries in the return report.** Needs new instrumentation on hot paths (no build-completion event exists; reveals are untracked). | L | Report plan Phase 3. Deliberately last: "you built 3 farmsteads" is a receipt, not news. |
| 4.7 | **Terrain-driven tech cost** — owned resource tiles discount their matching branch (the tree already carries `branch`: economy 12 / war 10 / manpower 8 / aether 11). One call site. See `docs/terrain-relevance-design.md` L2. | M | The structural fix for "the map doesn't affect my decisions": terrain currently has *no* effect on advancement rate. |
| 4.8 | **Terrain in combat.** `FrontierCombatPreviewTile.terrain` exists and is never read — no high ground, no cover, no river. See terrain doc L3. | L | Highest ceiling of anything listed, but wants Phase 3 density to pay off and needs real balance work against the existing exposure model. |
| 4.6 | **Relax the explicit anti-growth tapers** (`connectedTownBonus` hard-capping at 3 towns; settlement-index regen weights). | M | Expansion brief §7.3. Possibly redundant once 4.1 ships with its own bounded range — check before touching. |

---

## Dependency summary

```
Phase 0 (measure) ──┬──> Phase 3 (density) ──> Phase 4.3
                    │         │
Phase 1 (session 1) │         └──> raises the ceiling on Phase 2
                    │
Phase 2 (return) ───┘   2.4 also closes expansion-brief §5D
```

- **Phases 1 and 2 can run in parallel with Phase 0** and with each other.
- **Phase 3 must wait for 0.3 and 0.4** — except 3.1 (rally links), which
  has no dependency and can ship any time.
- **Phase 4.1 is independent** of all of this and could be pulled earlier if
  mid-game retention turns out to matter more than new-player retention —
  a question Phase 0.2 should answer.

## What is deliberately not in this plan

- **Offline decay or depleting resource nodes.** Fights the twice-a-day
  cadence the economy is explicitly tuned for. See the opening brief's §6.
- **More friction on EXPAND.** The problem is that it is the only verb, not
  that it is too cheap.
- **New UI surfacing as a substitute for content.** The expansion brief
  already recorded that its first round of surfacing ideas was correctly
  called cosmetic. Add the thing, then surface it. (2.3 and 2.4 are
  exceptions only because the underlying content is already built and
  currently has no audience at all.)
- **Chasing Civilization's "one more turn."** Its load-bearing mechanism —
  a turn-based game that will not advance without your input — is
  structurally unavailable in a persistent real-time world. See the opening
  brief's §5.1.

## Open questions that could reorder this

1. Does Phase 0.2 show new players dropping in session 1, or later? If
   later, Phase 4.1 outranks Phase 1.
2. What actually blocks the daily story from reaching players (2.3)? If it
   is "a 5-AI world produces no story worth sending", 2.3 is gated on Phase
   3 after all.
3. Is 0.4's answer "no CPU headroom"? Then 3.2 (shrink) is the only viable
   density lever and 3.4 is dead.
4. Are the tier-1 domains balanced *as opening picks* (1.2)? They were
   priced as day-2 purchases; Clockwork Stipend in particular is plausibly
   much stronger at minute 0.
