# Converter Mode Flip — one building per resource, two directions, cooldown-gated

**Branch:** `claude/strategic-resources-roadmap-a1qu71`
**Stack:** rewrite only (`apps/simulation`, `packages/game-domain`, `packages/shared`, `packages/client`, `apps/realtime-gateway`). Never touch `packages/server`.
**Status:** plan only — no implementation in this branch yet. All design
questions resolved; `EXCHANGE` rates finalised in Phase 4.

## Goal

Collapse the per-resource converter buildings into **one building family per
resource with a directional mode the player can flip in place**:

| Mode | Direction | Behaviour | Cap |
|---|---|---|---|
| `SYNTHESIZE` | gold → slot | Today's synthesizer: pays gold upkeep, contributes +1 slot of its resource to **supply**, excluded from demand | uncapped, flat upkeep (§Cap removal) |
| `EXCHANGE` | slot → gold | Consumes 1 slot of its resource as **demand**, produces gold | uncapped |

Each converter handles exactly **1 slot** (user decision — closes former open
question 2).

Flipping is gated by a cooldown so mode is a commitment, not a per-tick
micro-optimisation.

This replaces the earlier "add a Crystal Exchange / Fur Exchange / Iron
Exchange family" idea. Building count goes **9 → 3** (6 with the Advanced
tier ladder kept) instead of 6 → 9.

## Why this shape

1. **It makes the gold-loop exploit unrepresentable rather than patched.** A
   building that is *either* a slot source *or* a slot sink can never be both,
   so the "synthesize a slot, sell the same slot" loop cannot be constructed
   on one building. See §"Balance invariant" for the residual cross-building
   case, which the payout-under-upkeep invariant holds down and which is
   testable (§Balance invariant).
2. **Half of it already ships.** `SYNTHESIZE` is the current synthesizer
   verbatim: gold upkeep 30–40/day (`server-game-constants.ts:93-98`) for +1
   slot (`structure-slots.ts:115-127`). Only the reverse direction is new.
3. **The toggle plumbing already ships.** `SET_CONVERTER_STRUCTURE_ENABLED`
   runs client → gateway → sim → tile state → client menu today
   (`client-action-flow.ts:1435`, `gateway-app.ts:3015`,
   `runtime-economic-structure-command-handlers.ts:122`,
   `client-tile-menu-view.ts:570`). A mode flip is the same command shape.
4. **The slot model already stores the number the flip needs.** See below —
   this is the key structural finding.

### The sign-flip finding

`resourceSlotSupplyForPlayer` reads a synthesizer's supply contribution from
**the same table** that `buildDemandContributors` reads demand from:

- supply path — `resource-slot-view.ts:140-143`: `if (SYNTHESIZER_TYPE_SET.has(structureType)) for (const req of structureSlotRequirements(...)) totals[req.resource] += req.count`
- demand path — `resource-slot-view.ts:235-237`: `if (!SYNTHESIZER_TYPE_SET.has(...)) addContributor(..., structureSlotRequirements(type) ...)`

Same `STRUCTURE_SLOT_REQUIREMENTS` entry, opposite sign, selected purely by
membership in `SYNTHESIZER_TYPE_SET`. **Mode is exactly that sign.** No new
slot data, no second table — replace a type-set membership test with a
type+mode test and the accounting follows.

## Locked design decisions

1. **Mode lives on `EconomicStructure`, not on the type.** New optional field
   `converterMode?: "SYNTHESIZE" | "EXCHANGE"`, absent ⇒ `SYNTHESIZE`. Keeps
   every existing structure and persisted snapshot valid with no migration
   (§Phase 7).
2. **Do not reuse `disabledUntil` for the cooldown.** That field gates whether
   the structure is *active* ("recovering from overload",
   `runtime-economic-structure-command-handlers.ts:100`). Mode-locking is
   orthogonal — a structure stays fully active while its mode is locked. New
   field `modeLockedUntil?: number`.
3. **Cooldown = 60 minutes** (`CONVERTER_MODE_FLIP_COOLDOWN_MS`). Rationale:
   6× `ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS` (10 min,
   `server-game-constants.ts:52`), so a flip can never be used to dodge a
   single upkeep tick; and well under the ~12h check-in cadence the manpower
   curve is tuned around (`config.ts:105-112`), so it never strands a player
   across a session. Flipping is a session-level decision, not a combat-tick one.
4. **Cooldown starts on the flip, and on build.** A freshly built converter is
   mode-locked for the same 60 min, so "build in cheap mode, flip immediately"
   isn't a cheaper path to the expensive mode.
5. **The 1-per-empire synthesizer cap is removed**, with **no escalating curve
   for now** (user decision) — upkeep stays flat per converter. See §Cap
   removal. This deletes the flip-time cap trap entirely.
6. **Advanced tiers stay.** Mode is orthogonal to tier; `SYNTHESIZER_FAMILY`
   upgrade paths are unchanged. An upgrade preserves the current mode.
7. **Naming — mode label:** do not surface the word "Exchange" in the mode
   label — it collides with the existing `EXCHANGE_HOUSE` building. Use
   **"Refine"** (gold → slot) and **"Sell off"** (slot → gold) in
   player-facing copy, or the directional arrows, but not "Exchange".
8. **Naming — building name and description:** the building's own name/copy
   (e.g. "Ironworks", "Converts gold into 18 iron per day") is currently
   one-directional and must also change, since the building now does both —
   see §Phase 6. This is a distinct piece of scope from decision 7 above; the
   two were conflated in an earlier pass of this plan.

## Cap removal

`synthesizerFamilyAlreadyOwnedElsewhere` (1 synth per family per empire,
`runtime-structure-command-handlers.ts:170-180`) is **removed**.

**Why remove it:** the mode flip's value scales with converter count. At a cap
of 1, the mode choice happens exactly three times per game (once per resource)
and is then set-and-forget — a thin payoff for a new command, a cooldown,
mode-aware accounting and new UI. At N > 1 it becomes a portfolio decision that
responds to game state, which is the whole point. The cap also fails silently
if flip-time enforcement is ever missed, and "only one allowed per empire" is
not a rule a player can reason about.

**Why not remove it to nothing:** the cap is load-bearing against gold buying
unlimited slots, and slots gate every structure in the game — the "rich + safe
+ tall beats controls-the-map" failure converters are explicitly tuned against.
There is no diminishing return behind the wall: `structure-slots.ts:115-127` is
explicit that the cap is "enforced at build-count level... **not** by shrinking
their own slot contribution", so each synth is a flat +1 slot forever. Linear
scaling on a gold-bought resource is the dangerous shape.

**Replacement, v1: nothing — flat upkeep, uncapped** (user decision). Each
`SYNTHESIZE`-mode converter costs the same gold upkeep as today, and a player
may run as many as they can afford. `economicStructureGoldUpkeepPerInterval`
keeps its current `(type)` signature; nothing in the upkeep path changes.

**What this accepts:** gold buys slots at a fixed linear rate (~30 gold/day per
slot, forever), with no diminishing return. A rich, landlocked, tall empire can
convert gold into building capacity without map control — the exact pressure
the removed cap existed to resist. This is a deliberate ship-first call: the
flat upkeep constant is a single, well-understood balance dial, and raising it
needs no new mechanism.

**What still holds:** the loop invariant below is unaffected by cap removal —
each synth+exchange pair stays net-negative at any N as long as payout <
upkeep. Removing the cap does not open the loop; it opens *linear slot
purchase*, which is a different and slower failure mode.

**If it needs tightening later**, the escalating-upkeep curve is the intended
next step and is cheap to add: give
`economicStructureGoldUpkeepPerInterval` (`runtime-structure-rules.ts:49`) the
player's `SYNTHESIZE`-mode count for that resource, charge the **aggregate**
(sum of the curve to N) rather than a per-building rank — so nothing has to
answer "which one is the 3rd?" across flips, removals and captures — and count
across the whole family, not per-type. Precedents for the shape:
`TOWN_TIER_UPGRADE_GOLD_COST` (20/40/80/160) and `structureBuildGoldCost`'s
`scaling.kind === "doubling"`. Note the lever must be upkeep, not build cost:
per `structure-costs.ts:18-25` all build gold costs were zeroed in the manpower
rewrite and the `scaling` shapes survive only as documented intent.

Deleted by this decision: `synthesizerFamilyAlreadyOwnedElsewhere`, the
flip-time cap check, and any mode-awareness in `ownedStructureCountForPlayer`.

## Balance invariant (must be enforced by test)

Same-building looping is structurally impossible, but a **cross-building** loop
survives: building A in `SYNTHESIZE` mode manufactures +1 slot for its gold
upkeep; building B in `EXCHANGE` mode consumes that slot and pays out gold.

With the cap removed and no curve, this invariant is **the only thing holding
the loop down** — it is load-bearing, not a nice-to-have. It does hold at any
N: each pair is a flat synth upkeep against a strictly smaller exchange payout,
so every pair is net-negative gold no matter how many are built. Enforce, per
resource:

```
EXCHANGE_GOLD_PER_SLOT_PER_DAY[r]  <  <resource r's synth gold upkeep per day>
```

Current upkeeps: IRONWORKS 30, FUR_SYNTHESIZER 30, CRYSTAL_SYNTHESIZER 40
(`server-game-constants.ts:93-98`). Advanced tiers are higher (45/45/60), so
gating against the *basic* tier is the strict bound.

With the Phase 4 rates this holds with wide margin — 8/30, 8/30, 10/40, i.e.
the exchange returns ~25-27% of what the synth costs, so gold -> slot -> gold
loses roughly three quarters of its input. Deliberately lopsided: this is an
anti-pattern, and it should be obviously bad rather than marginally bad.

**Headroom caveat (income multipliers).** Exchange payout routes through
`player.mods?.income`; synth *upkeep* does not. No tech or domain currently
sets `mods.income` (verified: max stacked multiplier is exactly 1 across
`tech-tree.json` and `domain-tree.json`), so the two are directly comparable
today. But a future income tech would scale one side and not the other. State
the invariant against the ceiling, not the base:

```
EXCHANGE_GOLD_PER_SLOT_PER_DAY[r] x MAX_INCOME_MULT  <  synth upkeep/day[r]
```

At the locked rates that tolerates an income multiplier up to ~3.7x (iron/
supply) or 4.0x (crystal) before the loop turns profitable. Assert the bound in
the test with the multiplier applied, so adding an income tech that eats the
headroom fails loudly here instead of silently opening the loop in production.
A unit test asserting this
inequality for every resource is a merge blocker — it is the one number that
turns the whole feature into an exploit if it drifts.

## Phase 1 — Shared types + slot model

- `packages/shared/src/types.ts`: add `converterMode?: ConverterMode` to both
  `EconomicStructure` (line ~97) **and** the `economicStructure` tile-state
  shape (line ~297). Add `modeLockedUntil?: number` to both. Export
  `export type ConverterMode = "SYNTHESIZE" | "EXCHANGE";`
- `packages/shared/src/structure-slots/structure-slots.ts`: add
  `converterModeOf(structure): ConverterMode` (absent ⇒ `SYNTHESIZE`) and
  `isSlotSourceConverter(type, mode)` / `isSlotSinkConverter(type, mode)`
  helpers. **All eight** `SYNTHESIZER_TYPE_SET` / `SYNTHESIZER_STRUCTURE_TYPES`
  call sites route through these rather than testing set membership directly:
  - `apps/simulation/src/resource-slot-view/resource-slot-view.ts:32,140,235`
  - `apps/simulation/src/runtime-structure-command-handlers.ts:252`
  - `packages/client/src/client-tile-upkeep-view.ts:40`
  - `packages/client/src/client-tile-action-logic/client-tile-action-logic.ts:77`
  - `packages/client/src/client-map-display.ts:352`
  - `packages/client/src/client-app-runtime-display-support/client-app-runtime-display-support.ts:64`
- `packages/game-domain/src/server-game-constants/server-game-constants.ts`:
  add `CONVERTER_MODE_FLIP_COOLDOWN_MS = 60 * 60_000` and
  `EXCHANGE_GOLD_PER_SLOT_PER_DAY` (per resource, subject to the invariant above).

## Phase 2 — Sim: the flip command

New command `SET_CONVERTER_STRUCTURE_MODE` — do **not** overload
`SET_CONVERTER_STRUCTURE_ENABLED`; enabled/disabled and mode are independent
axes and merging them makes both harder to reason about.

- `packages/shared/src/messages/messages.ts` (~line 105): new zod member
  `{ type, x, y, mode, ...FrontierCommandMetadataSchema }`.
- `apps/simulation/src/runtime-command-parsers.ts`: `parseConverterModePayload`
  (model on `parseConverterTogglePayload:59`).
- `apps/realtime-gateway/src/supported-client-messages/supported-client-messages.ts`
  + `gateway-app.ts` (~3015): forward it.
- `apps/simulation/src/runtime-command-dispatch.ts` (~81, ~135): dispatch it.
- New handler `handleSetConverterStructureModeCommand` in
  `runtime-economic-structure-command-handlers.ts` (file is 135 lines — room
  under the 500 cap, but if it crowds, extract the converter handlers to their
  own module rather than growing this one). Rejection order:
  1. no owned structure on tile / not a converter type → `STRUCTURE_MODE_INVALID`
  2. `status === "under_construction" | "removing"` → not ready
  3. `modeLockedUntil > now()` → **"mode locked for another N min"** (mirror the
     `disabledUntil` rejection at line 100)
  4. mode unchanged → no-op success, do not restart the cooldown

No cap check is needed — see §Cap removal. Flipping *to* `SYNTHESIZE` starts
that converter owing gold upkeep it did not owe in `EXCHANGE` mode, so charge
the first interval at flip time and reject the flip if the player cannot cover
it — same treatment the enable-toggle already gives
(`runtime-economic-structure-command-handlers.ts:105-111`), rather than letting
the next upkeep tick silently shut it down.

On success: set `converterMode`, set `modeLockedUntil = now() + COOLDOWN`,
`replaceTileState`, emit `TILE_DELTA_BATCH` + `emitPlayerStateUpdate` +
`COMMAND_RESOLVED` (same tail as the enabled-toggle handler).

Also set `modeLockedUntil` on build completion in
`runtime-structure-command-handlers.ts` (decision 4).

## Phase 3 — Sim: mode-aware slot accounting (**the risky one**)

`apps/simulation/src/resource-slot-view/resource-slot-view.ts` is 438 lines
against a 500 hard cap, and it computes every player's whole slot economy.
Extract before growing.

- `resourceSlotSupplyForPlayer` (~140): count a converter's requirement as
  supply **only when** mode is `SYNTHESIZE`.
- `buildDemandContributors` (~235): the current
  `!SYNTHESIZER_TYPE_SET.has(type)` exclusion becomes "exclude only
  `SYNTHESIZE`-mode converters" — an `EXCHANGE`-mode converter is an ordinary
  demand contributor and **participates in dormancy** like any other consumer.
  That is correct and wanted: lose the tile that fed it and the exchange goes
  dormant instead of printing gold from a slot you no longer hold.
- Update the two long doc comments at ~97-113 and ~185-195, which both assert
  "a synthesizer is a supply source, not a demand consumer" as an unconditional
  rule. Leaving them stale here is how the next reader reintroduces the bug.

## Phase 4 — Sim: gold income for `EXCHANGE` mode (FINAL)

Payout is per **slot consumed** (1 slot per converter), not per unused slot — a
spent slot is a real opportunity cost and is self-limiting.

### Rates (locked)

```
EXCHANGE_GOLD_PER_SLOT_PER_DAY = { IRON: 8, SUPPLY: 8, CRYSTAL: 10 }
ADVANCED tier: 1.5x  ->            { IRON: 12, SUPPLY: 12, CRYSTAL: 15 }
```

**Flat, not scaled by town tier or network** — decided. Three reasons:

1. Town gold is already eight multiplicative terms deep
   (`player-update-economy.ts:240-249`: support ratio x population x connected +
   caravanary x market x bank x first-three x income). Tier-scaling the exchange
   would compound a curve that already compounds, and town tier is *the* term
   that multiplies hardest (METROPOLIS 3.2x).
2. The balance invariant below is now load-bearing (no cap, no curve). Flat
   keeps it a single comparison per resource instead of a comparison against a
   moving ceiling.
3. Town specialisation — the original goal — comes from *where* converters sit
   and *which way* they point, not from a tier multiplier.

### Where the numbers come from

Live gold scale, computed from `player-update-economy.ts:240-249` at
`GOLD_RESCALE_DIVISOR = 288`:

| Reference point | gold/day |
|---|---|
| Bare fed TOWN, no structures | ~10 |
| CITY + Market + Bank | ~39 |
| METROPOLIS + Market + Bank + Clearing House + Caravanary + network | ~174 |
| Bank flat bonus (`BANK_FLAT_GOLD_BONUS_PER_MIN`) | ~5 (~7.5 w/ Clearing House) |
| Synthesizer upkeep (basic) | 30 iron/supply, 40 crystal |

8-10/day per slot sits just above the Bank's flat bonus — the closest existing
"flat gold adder" — so it reads as a real but not dominant source. Twenty spare
slots converted (twenty buildings, twenty tiles, twenty trips through the
development queue) lands around one good METROPOLIS of income. That is the
intended ceiling: a large surplus, fully invested, is worth about one more great
city — not more than the map.

CRYSTAL is rated slightly higher because it is the scarcer resource by worldgen
(30 GEMS clusters vs 52 each for IRON/FUR/FARM/FISH,
`server-worldgen-clusters.ts:26-32`), matching why its synth upkeep is already
40 rather than 30.

**Advanced tier pays 1.5x**, mirroring the existing upkeep rule that "an
upgraded building never costs less to run than the thing it upgrades"
(`server-game-constants.ts:83-90`). Without this an upgraded converter in
`EXCHANGE` mode would be strictly pointless, since upgrading only raises upkeep
in the other direction.

### Wiring

- `apps/simulation/src/player-update-economy/player-update-economy.ts`: add the
  gold source alongside the existing `MARKET`/`BANK` handling (~221-249),
  bucketed under its own label so it shows in the economy breakdown.
- **Route through `incomeMultiplier` (`player.mods?.income`) and
  `PASSIVE_INCOME_MULT`**, like every other passive gold source. See the
  invariant's headroom note — this is safe today and has a documented ceiling.
- Payout is **not** gated on the town being fed or supported. It is a
  structure-level output, not a town-level one; slot loss is already handled by
  dormancy, since an `EXCHANGE` converter is an ordinary demand contributor.
- Suppress payout when the structure is dormant, manually disabled, or inside
  capture shock — reuse `dormantEconomicStructureKeys`, already threaded there.
- `EXCHANGE`-mode converters pay **no** gold upkeep (they are a gold *source*);
  `economicStructureGoldUpkeepPerInterval` must return 0 for them, otherwise
  the enable-toggle at `runtime-economic-structure-command-handlers.ts:105-111`
  will charge them an upkeep they don't owe and can reject re-enabling.
- **No new tech gate.** The mode ships with the building, whose existing tech
  gates (`workshops` / `alchemy` / `crystal-lattices`,
  `structure-registry-economic.ts:34-39`) already gate access. If selling slots
  proves too available too early, gating the `EXCHANGE` direction behind a
  mid-tier tech is the lever — cheaper than re-tuning the rate.

## Phase 5 — Client

- `packages/client/src/client-action-flow.ts` is **1811 lines and already over
  the 500 cap — it may not grow** (AGENTS.md). Extract the converter actions
  into a new `client-converter-actions.ts` and wire from there; the branch must
  leave `client-action-flow.ts` net smaller.
- Tile menu (`client-tile-menu-view.ts:560-580`): show current mode, the
  flip control, and remaining lock time. The `isSynthLikeStructureType`
  branch is the natural home; its copy currently assumes one direction.
- `client-gateway-capabilities.ts:29`: register the new message so older
  gateways degrade cleanly rather than silently dropping flips.
- `client-tile-upkeep-view.ts:40` currently early-returns for synth-like types
  (they have no slot upkeep). `EXCHANGE` mode **does** occupy a slot and must
  show it, or the player cannot see what they are paying.
- Mode must reach the client on the wire: `economicStructureJson` is
  ref-memoized in `TileDeltaStringifyCache` by the structure object
  (`docs/plans/2026-07-06-radius-yield-delivery.md` decision 2) — since the flip
  replaces the structure object, the memo invalidates correctly. Verify with a
  test rather than assuming.

## Phase 6 — Naming and description (the building, not just the mode label)

Decision 7 (naming) only settled the **mode label** ("Refine" / "Sell off").
It did not touch the **building's own name and description**, and those are
now wrong: "Iron Synthesizer" / "Ironworks" describes only the `SYNTHESIZE`
half of a building that can also run in `EXCHANGE`. Three separate copy
surfaces need updating, none of which are generated from the type constant —
they're all hand-written strings that assumed one direction:

1. **Display title** — `economicStructureName()`
   (`client-map-display.ts:90-95`). Currently: "Fur Synthesizer" / "Advanced
   Fur Synthesizer" / "Ironworks" / "Advanced Ironworks" / "Aether Condenser"
   / "Advanced Aether Condenser". **Note the precedent already in this table**:
   `CRYSTAL_SYNTHESIZER` already displays as "Aether Condenser", not "Crystal
   Synthesizer" — the display name has never been required to match the type
   constant. That precedent is what makes this a copy change, not a data
   migration: **do not rename the underlying type constants**
   (`IRONWORKS`/`FUR_SYNTHESIZER`/`CRYSTAL_SYNTHESIZER` + `ADVANCED_*`). They
   are persisted in every snapshot, the SQLite store, replay logs, and the
   tech-tree unlock flags (`unlockIronworks` et al.,
   `tech-tree.json`/`client-tech-payoffs.ts:24`) — renaming them is a real
   migration for zero player-facing benefit, since the display layer already
   diverges freely from the identifier.
   Proposed direction-neutral names (final wording is a copy pass, not locked
   here): **"Iron Works"** / **"Advanced Iron Works"**, **"Fur Works"** /
   **"Advanced Fur Works"**, keep **"Aether Condenser"** /
   **"Advanced Aether Condenser"** (already direction-neutral — no change
   needed there, which is worth noting explicitly so the copy pass doesn't
   touch it unnecessarily).
2. **One-line description** — `client-map-display.ts:130-135`. Currently
   hardcoded to one direction and now simply false half the time: *"Converts
   gold into 18 iron per day."* Replace with a mode-neutral summary plus both
   figures, e.g. *"Occupies 1 IRON slot. Refine: gold → iron (30 gold/day).
   Sell off: iron → gold (8 gold/day)."* Six strings (3 resources × 2 tiers);
   Advanced tiers substitute their own upkeep/payout numbers (45/45/60 upkeep,
   12/12/15 payout per Phase 4).
3. **Structure-info detail block** — the `title`/`detail` pairs around
   `client-map-display.ts:547-580` (one block per type, six blocks total: this
   is the fuller copy shown in the build-menu info panel, distinct from #2's
   one-liner). Same problem, more verbose: *"Ironworks convert gold upkeep
   into 18 iron per day on a support tile."* Needs the same both-directions
   treatment, plus a mention of the cooldown so a player reads about the flip
   before committing to build.
4. **Sim-side `structureLabel()`** (`runtime-structure-command-handlers.ts:91-93`)
   is mechanically derived (`type.toLowerCase().replaceAll("_", " ")`) — it
   powers only command-rejection copy ("insufficient iron for ironworks", "no
   free iron slot for ironworks"), not a name a player learns to recognize.
   Lower priority than 1–3, but if the type constants stay as planned (see
   #1), this keeps working with **no code change** — flag it here so a future
   pass doesn't "fix" it by renaming the type.

**Not in scope for this phase:** the tech-tree flavour text that unlocks
these buildings (`alchemy`/`workshops`/`crystal-lattices` in
`tech-tree.json`) is already direction-neutral flavour ("The kettle hisses,
the glass clouds, and ore starts behaving like a respectable science.") and
names no specific direction — verified, no change needed. Storybook 3D
fixtures (`StructureOverlay.stories.ts`) reference only type keys for
rendering, no copy — no change needed.

Do this phase **after Phase 4** (the payout numbers must be locked before
writing copy that quotes them) and **alongside Phase 5** (the tile-menu mode
UI from Phase 5 and this renamed info-panel copy should land together, so a
player never sees the old one-directional name paired with the new toggle).

## Phase 7 — Back-compat

No migration. `converterMode` absent ⇒ `SYNTHESIZE` at every read site
(`converterModeOf`), so every existing structure, snapshot, and replay keeps
today's behaviour. `modeLockedUntil` absent ⇒ not locked; existing structures
are immediately flippable, which is the friendly default.

Confirm the legacy snapshot bootstrap path
(`apps/simulation/src/legacy-snapshot-bootstrap/`) and
`runtime-hydration.ts` round-trip the new fields.

## Phase 8 — Tests (fail before, pass after; beside their module)

Blocking:
- **Balance invariant**: for every resource, exchange payout/day x the maximum
  achievable income multiplier < that resource's synth gold upkeep/day. Cover
  both tiers (basic 8/8/10, advanced 12/12/15).
- **Exchange payout**: an active `EXCHANGE` converter credits its resource's
  rate; an Advanced one credits 1.5x; a dormant / manually-disabled /
  capture-shocked one credits nothing; payout is unaffected by whether its town
  is fed.
- **No exchange upkeep**: `economicStructureGoldUpkeepPerInterval` returns 0 in
  `EXCHANGE` mode, and re-enabling one at zero gold is not rejected.
- **No cap**: a player can build and run more than one `SYNTHESIZE`-mode
  converter of the same resource, and flip several to `SYNTHESIZE`, with no
  rejection (regression against the removed rule).
- **Flat upkeep**: N `SYNTHESIZE`-mode converters cost N × the per-converter
  upkeep — no escalation, no discount.
- **Cooldown**: flip → immediate re-flip rejected; after
  `CONVERTER_MODE_FLIP_COOLDOWN_MS` it succeeds. Freshly built converter is
  locked. A no-op flip to the current mode does not restart the cooldown.
- **Sign flip**: same tile, same building — `SYNTHESIZE` adds to supply and
  contributes no demand; `EXCHANGE` adds demand and no supply.
- **Dormancy**: an `EXCHANGE` converter whose slot supply disappears goes
  dormant and stops paying gold.
- **Upkeep**: `EXCHANGE` mode is charged no gold upkeep, and re-enabling one
  with zero gold is not rejected for upkeep.
- **Back-compat**: a structure with no `converterMode` behaves exactly as a
  synthesizer does today (supply, demand exclusion, cap, upkeep).
- **Wire**: a flip produces a tile delta carrying the new mode (stringify-cache
  invalidation).
- **Naming (Phase 6)**: `economicStructureName()` returns the new
  direction-neutral titles for all six converter types; the type constants
  themselves are unchanged (guards against a future "helpful" rename of the
  persisted identifiers).

## Phase 9 — Changelog (last file touched)

Append to `CLIENT_CHANGELOG_ENTRIES` in
`packages/client/src/client-changelog/client-changelog-data.ts` with
`createdAt: Date.now()` — append at the end, do not insert at the top
(entries are timestamp-sorted; appending avoids cross-agent merge conflicts).
User-visible: converters can now be pointed either direction, and the flip has
a cooldown.

## Verification gate

No CI runs on PRs in this repo. Before merge, locally: `pnpm lint`,
`pnpm test`, `pnpm check:file-lines`. The line-limit check matters more than
usual here — this branch touches two files near or over the cap
(`resource-slot-view.ts` 438, `client-action-flow.ts` 1811) and both need
extraction, not growth.

## Open questions for the user

1. **Does flat + uncapped hold in play?** Watch whether tall, gold-rich empires
   buy their way past map control. If so, the escalating-upkeep curve is the
   pre-scoped next step (§Cap removal) — no redesign, just a signature change
   and a constant.

*(Resolved: 1 slot per converter. Resolved: the synthesizer cap is removed,
with flat upkeep and no curve for v1. Resolved: exchange payout is flat per
slot at 8/8/10 per day for IRON/SUPPLY/CRYSTAL, 1.5x on Advanced tiers — see
Phase 4.)*
