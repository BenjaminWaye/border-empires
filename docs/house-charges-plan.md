# House Charges: secret objectives held to game end

Status: active proposal (Phases 1 and 2 built: dealing, the Charges panel and keep choice, map highlights, loss warnings, the season-end reveal, charge cards, the galaxy reward, AI pursuit and cross-water Charters; see the [gameplay reference](game-mechanics.md#house-charges). Phase 3 open: Renown in the final score, public titles and a Writ variant need owner decisions)
Owner: game design (repository owner) decides scope and reward weights before implementation
Last verified: 2026-11-13
Replaces: none (on delivery, the rules move into [`game-mechanics.md`](game-mechanics.md) and the fiction into the [world bible](lore/galactic-lore.md))

## Problem

A player suggested secret objectives in the spirit of Ticket to Ride tickets
and Catan's Longest Road / Largest Army. Today a season has exactly one kind
of goal: the five shared victory paths (`TOWN_CONTROL`, `ECONOMIC_HEGEMONY`,
`RESOURCE_MONOPOLY`, `MARITIME_SUPREMACY`, `DIPLOMATIC_DOMINANCE`), each
needing a 24h hold. Most players finish a season far from any of them, with
only a leaderboard rank to show for it, and there are no hidden goals at all
([game mechanics §9](game-mechanics.md): "No hidden standings").

Relevant existing pieces:

- **Longest Road** is already captured as a season record from the final map
  (settled same-empire land between two towns of at least Town tier).
- An **old mission system** survives only as types
  (`packages/shared/src/mission-types.ts`) and an empty `#panel-missions` in
  the client. The rewrite stack never populates it. Reuse the pattern, not
  the code path.
- **Islands are already named** (`generatedIslandName`, `NAME_ISLAND`,
  held/contested/revert rules) and the lore already frames this as the
  Court's survey charts ([world bible, "Charting the land"](lore/galactic-lore.md#charting-the-land)).
- **Relics** have a deliberate discovery rule: a location beacon appears once
  a House has a garrison within 12 tiles, without type, owner or reserve
  ([`relics.md`](relics.md)).

## Fit with the design pillars

Checked against [`core-loop.md` §1](core-loop.md) and the owner intent in §1.1:

- **Territory is the unit:** every charge is about who owns which tiles at
  the end. No new pieces or currencies are added inside a season.
- **Several ways to win:** charges add goals beside the five paths without
  adding a sixth one.
- **Check in a couple of times a day:** charges add no decay or upkeep, and
  only the final state counts. Private loss warnings let a player who visits
  every few refills see what needs retaking.
- **Scale (about 400 towns for about 100 players):** this matches the
  continent-map simulation below, where nearly every player got two charges.
- **Optimising is the fun, and players should control town growth:** Seat
  charges reward deliberate growth of a chosen town, and Charter roads reward
  shaping territory.

## Proposed change

Each House receives a few **sealed House Charges** at landing: private,
named objectives on the map. A charge only counts if it is **complete and
still held at the moment the season's winner is crowned**. Charges are
revealed to everyone at season end. Victory paths are unchanged; charges
never decide who wins the season.

### Charge types

| Charge | Objective (all held at game end) | Availability | Existing rule it reuses |
|---|---|---|---|
| **Charter of Passage** | Connect *{Town A}* and *{Town B}* with an unbroken road of your settled land | Common | Longest Road connectivity (endpoints at least Town tier) |
| **Founding of a Seat** | Own *{Town}* and grow it to City | Common | Town `populationTier` |
| **Survey Claim** | Hold *{Landmass}* fully enough that your House's name stands in the charts | Common on island maps | Island naming, held/contested/revert rules |
| **Garrison the {Desert}** | Garrison at least 75% (proposed) of a named desert region as settled land | Common | Tile `landBiome` (`SAND`, `COASTAL_SAND`) |
| **Garrison the {Tundra}** | As above, for a named tundra region | Rare | Tile `landBiome` (`TUNDRA`) |
| **Reawakening** | Garrison and operate *{relic installation}* | Rare | Relic garrison activation |

Desert and tundra regions are **new world data**: connected biome regions in
a size band (simulated with 30–400 tiles; regions above the band are split or
skipped), named at worldgen from the town/island naming cultures and shown on
the map like island names.

### Dealing charges

- At landing, generate targets from the map around the player's AFC. The
  player is **offered three and keeps two**. A rare charge is always offered
  when one is available.
- **Distance bands** keep targets reachable but not adjacent. The simulation
  used Charter towns 8–50 tiles from the AFC on the home landmass and
  12–35 tiles apart; Seat towns 6–45 tiles away; landmasses and regions
  within 35 tiles; relics within 45 tiles.
- **Every target has a holder cap:** at most 5 Houses per town and 3 per
  landmass, biome region or relic. Overlap is intended (secret rivalry), but
  without caps up to 40 Houses were dealt the same island.
- **Island maps need cross-water Charters:** on island maps, allow Charter
  pairs linked by a dock route, not only towns on the same landmass.
  Without this, a third or more of players got fewer than two charges.
- **Late joiners** are dealt at their landing, with targets scaled to the
  time likely left.
- **Charges that become impossible** (for example a destroyed target) are
  either void or replaced. Open question below.

### Holding to game end and scoring

- Score charges **when the winner is crowned**, from the final map, exactly as
  Longest Road is captured. The victory hold timer is already public, so every
  player gets about 24 hours' warning that scoring is coming.
- **No partial credit and no penalty** for an unfulfilled charge.
- The player always sees each of their own charges as **Held** or **Not held**
  right now.

### Player guidance

Every charge must be findable and readable on the map.

- A **Charges panel** lists the player's charges with held state and one
  progress line each.
- **Selecting a charge** centres the camera on it (`focusCamera` /
  `focusCameraOnTile`) and turns on its highlight; an **off-screen edge
  locator** points to it while it stays selected
  (`drawPersistentAlertLocators` pattern).
- Highlights per type:

| Charge | Map highlight | Progress line example |
|---|---|---|
| Charter | Both towns marked, dotted line between them, own route tiles lit, gaps in a warning colour | "Road 14/22 tiles: break near (312, 88)" |
| Seat | Town ringed with current and target tier | "Vell: Town → City (pop 410/800)" |
| Survey | Landmass outlined, held tiles filled, the rest hatched | "Harrowmere: 61% held" |
| Desert / Tundra | Region boundary, garrisoned tiles filled, the rest hatched | "Ashen Reach: 48/75% garrisoned" |
| Reawakening | Relic marker and garrison status | "Installation: not garrisoned" |

- **Progressive reveal.** A charge starts as a **search circle** plus a
  region name. Exact tiles are highlighted only once the player has seen them.
  For relics the installation type stays hidden, and the exact marker appears
  only under the normal 12-tile beacon rule. This keeps exploration meaningful
  and does not bypass the relic discovery rules.
- **Private loss warnings** ("Your Charter road to Vell was cut at (312, 88)")
  with a jump-to action. The attacker is never told that they broke a charge.
- All overlays cover **both the 2D canvas and true-3D**
  (`isTrue3DRendererActive()`), as required by `AGENTS.md`.

### Rewards

Charges pay out only after the season, so rewards are things that outlast it.

1. **Season-end reveal**: all charges are published with the result: who was
   after what, and who held it.
2. **Charge cards**: each fulfilled charge becomes a unique collectible card,
   such as "Charter of Passage — Vell to Harrowmere, Sector 012". Its art comes
   from the real final map (road, desert shape, island outline), or for relics
   from the installation family. Rarity follows the charge type. Cards appear on
   the player's profile beside the career stats. Sets grant **titles only**
   (for example "Cartographer" for five Survey cards), never gameplay power.
   Cards are designed as **collectible trading cards** (see [Card design](#card-design)).
3. **Galaxy reward**: +1 **Domain Weight** per fulfilled charge for empires
   that hold a Planet or Outpost (see the [galactic layer](game-mechanics.md#galactic-layer)).
   Domain Weight is only computed for territory holders, so other players
   instead receive a **larger Stipend** (Stipends now pay Influence only,
   at most 10). +1 is a third of an Outpost, so about ten
   seasons of charges match one Planet. If that accumulates too fast, count
   only recent seasons.
4. **Renown** (later phase): a final-score bonus that can move leaderboard
   rank and, through it, the season rating. Size it **relative to the
   season's score distribution**, for example 10% of the median final score
   for a common charge and 20% for a rare one, capped so two charges move a
   player several places, not from 40th to 2nd. Measure the real gap between
   neighbouring ranks in past seasons before choosing the numbers.

Explicitly not proposed: mid-season bonuses (they contradict holding to the
end), gameplay advantages in the next season (snowballing, and House
equipment does not carry between worlds in the lore), or penalties for
failure.

**Dependency:** Stipends are now paid into the galaxy balance once per
account and season (fixed separately), which the galaxy reward builds on.

### Card design

Charge cards use the layout of a **collectible trading card game**: a framed
card with a name bar, a large art box, a type line, a text box with rules and
flavour text, and a stats corner. The frames, icons and symbols are Border
Empires' own; the layout is a genre convention, not a copy of any existing
game's card design.

**Card anatomy, top to bottom:**

| Part | Content | Example |
|---|---|---|
| **Name bar** | The charge's target, plus its **Renown value** shown as pips on the right (where other games put a cost) | "Road of Vell and Harrowmere" ●●● |
| **Art box** | Art drawn from the real final map: the road traced between its two towns, the charted island outline, the desert's shape, or the relic family's ziggurat | The 22-tile road across the Vell lowlands |
| **Type line** | "House Charge — {type}", with the **Sector set symbol** on the right, coloured by rarity | "House Charge — Charter of Passage" |
| **Text box** | One line saying what was achieved, then italic **flavour text** from lore templates | "Connected Vell and Harrowmere and held the road to the end of the contest." *"The merchant families of House Alden paid for every milestone."* |
| **Stats corner** | Two numbers: **size / hours held**. Size is the road length, the town's tier reached, or the tiles garrisoned; hours held is how long the charge was continuously complete before the crowning | 22 / 61 |
| **Footer** | Collector number within the Sector, House name, season-end date | "014/212 · House Alden · 2026-12-03" |

**Frame colour by charge type:**

| Charge | Frame |
|---|---|
| Charter of Passage | Bronze, with milestone motif |
| Founding of a Seat | Gold, with town-gate motif |
| Survey Claim | Sea blue, with compass-rose motif |
| Garrison the Desert | Sand, with dune motif |
| Garrison the Tundra | Ice white, with frost motif |
| Reawakening | Aether violet, with ziggurat motif |

**Rarity** is shown by the colour of the set symbol:

- **Common**: Charter, Seat, Survey and Desert charges.
- **Rare**: Tundra charges, and common charges of the highest difficulty band.
- **Mythic**: Reawakening (relic) charges.
- **Legendary**: public titles held at game end (Longest Road, Royal
  Cartographer), if that companion ships. These use a distinct crowned frame.
- **Foil treatment**: any card earned by the House that also won the season.

**Sets:** each Sector Contest is a **set** with its own generated set symbol
and collector numbering, so a collection is organised by Sector like
expansions. Every card is unique: no other House can ever hold the same card.

**Card back:** one shared back, the Court's seal over a starfield, so every
collection reads as one game.

**Collection view:** a binder-style grid grouped by Sector or by charge type,
with filters for rarity and foil, flip-to-back on tap, and an enlarged view
for reading the text box. Collection titles (titles only, never gameplay
power) reward breadth, for example **Cartographer** for five Survey cards or
**Keeper of the Concordance** for Reawakening cards from all nine relic
families.

**Data needed:** the size and hours-held numbers mean scoring records, for each
charge, when it last became complete, not only whether it is complete at the
crowning. Cards are drawn in the client from the archived final map and card
data, so the same layout works on the profile, the season-end reveal and
phone screens.

### Optional companion: public titles

Catan-style public titles, held live by one House and stealable at any time,
complement the secret charges:

- **Longest Road** as a live title, reusing the existing record calculation.
- **Royal Cartographer**: most landmasses charted under the House's name.

Whether titles carry a small in-season perk is an open question.

### Computer-run empires

AI empires receive charges too. Otherwise they are blind to them and become
free targets. Pursuing a charge needs a planner goal that scores expansion,
settlement and garrison toward the target, within
[`agents/ai-guardrails.md`](agents/ai-guardrails.md) and
[`agents/topics/ai-planner.md`](agents/topics/ai-planner.md). AI charges are
revealed at season end like everyone else's.

### Fiction (proposed, not canon)

Proposed framing for the lore review. Nothing here becomes canon until
accepted and written into the world bible:

- Before a landing, each House gives its campaign leader **sealed charges**:
  the House's own private ambitions for the world, separate from the Court's
  terms of victory. Trading families want a road between two markets. The
  elders want a seat for a cadet line. Scholars want an installation woken.
- The Court's charts are old and revised slowly, so a House gets a
  surveyor's rough bearing, not a precise location. This explains the search
  circle.
- The Court's survey charts name notable wastes and ice fields as well as
  islands, which gives named desert and tundra regions.
- Fulfilling a charge before the watching Core earns **Renown**, which the
  world bible already defines as part of a Duke's standing
  ([succession, "Grievances and Renown"](lore/galactic-lore.md#grievances-and-renown)).
  A fulfilled charge's seal is broken and the charter is entered in the House
  archive, which is the card collection.
- Do **not** use **Writs of Advancement** for this. Their relationship to the
  revolt is an open canon question (world bible §14). A later "real Writ"
  (an optional mid-season Court offer with a political cost) can wait for that
  decision.

## Evidence: simulation

A static simulation (run 2026-11-12) used the real season worldgen
(`generateSeasonWorld`, 640×320) with 100 empires on 3 island and
3 continent seeds, dealing three charges and keeping two. It measures where
targets fall at landing, not how anyone plays.

| Measure | Continent maps | Island maps |
|---|---|---|
| Unclaimed towns at landing | 366–395 | ~140 |
| Relics on the map | 7 | 3–7 |
| Players dealt a relic charge (cap 3 per relic) | 12–15 | 4–16 |
| Players with two charges (caps 5 per town, 3 otherwise) | 98–100% | 52–73% |
| Players secretly sharing a target | 65–78% | 38–71% |
| Charges whose target is closer to a rival's AFC | ~60% | 60–75% |
| Average target distance vs nearest free town | ~29 vs 7–8 tiles | 21–29 vs 5–9 tiles |
| New rival pairs (capitals over 30 tiles apart) linked by charges | +106 to +137 on 229–275 neighbour pairs | +51 to +266 |

Biome regions of 30–400 tiles per world: deserts 71–74 on continent maps and
28–33 on island maps; tundra 11–12 on continent maps and 2 on island maps.
Dealing to only 50 of 100 island-map empires still left 18–44% with a single
charge. That is why cross-water Charters are needed.

## Expected effect on play

These are design expectations, not measurements.

- **Directed expansion:** targets sit about three to four times farther away
  than the nearest free town. Players push toward named places, creating
  exposed corridors worth defending, especially Charter roads.
- **Deduction and bluffing:** most players share a target without knowing
  it. Unusual investments become readable signals, and decoy moves become
  worthwhile.
- **Conflict beyond neighbours:** on continent maps, charges link 40–60%
  more rival pairs.
- **Diplomacy with real currency:** allies trade towns that complete each
  other's charges, truces buy time to finish a road, and revealing (or lying
  about) a charge becomes a move.
- **A new endgame:** the public 24h victory hold becomes a scramble to
  secure charges. Players holding complete charges may want the season to end
  quickly, and players short of theirs will join the existing
  "stop the leader" pressure. Watch for unwanted kingmaking.
- **Goals for non-contenders:** players far from any victory path have
  concrete targets that pay off in cards, galaxy rewards and, later, Renown.

## Risks

- Reward weight too high competes with the victory paths; too low and
  charges are ignored.
- Deliberate blocking of guessed charges (intended in part); impossible
  charges need a defined outcome.
- Large alliances sharing every charge weaken the secrecy.
- Highlights make a plan easier to execute and, through behaviour, easier to
  read. This is accepted, because it is what drives the deduction layer.
- Charges introduce hidden information into a game that currently shows all
  standings. This is a deliberate change of principle.

## Open questions

1. Impossible charges: void, or replaced with a new one?
2. Garrison threshold for desert and tundra regions (75% proposed).
3. Card art pipeline: the proposal draws cards in the client from archived
   map data. Confirm the season archive keeps enough of the final map
   (routes, outlines, biome regions) to do that, or store a small per-card
   shape at crowning.
4. Whether public titles carry an in-season perk.
5. Renown weights, after measuring past seasons' score spread.
6. Whether charges should be shown to allies automatically or only by choice.

## Phasing

1. **Phase 1**: worldgen naming of desert and tundra regions; charge
   generation and dealing (Charter, Seat, Survey, Desert); Charges panel,
   highlights with progressive reveal in 2D and 3D; scoring at crowning; the
   season-end reveal; cards on the profile.
2. **Phase 2**: rare charges (Tundra, Reawakening); AI pursuit; the galaxy
   Domain Weight / Stipend reward.
3. **Phase 3**: Renown in the final score, public titles, and possibly a Writ
   variant once the canon question is settled.

## Acceptance criteria

- Every human and AI empire is offered three charges at landing (when
  targets exist), keeps two, and no target exceeds its holder cap.
- Continent maps give at least 95% of players two charges; island maps reach
  the same once cross-water Charters ship.
- Charges are evaluated exactly once at crowning from the final map and
  recorded with the season archive.
- Each charge type has a working highlight and progressive reveal in both
  renderers, and no relic's type or exact location is shown before the
  normal discovery rule allows it.
- Fulfilled charges appear as cards on the player's profile and in the
  season-end reveal.

## Verification

- Unit tests for target generation (distance bands, caps, island fallback)
  and for held-at-crowning evaluation of each charge type.
- A seeded-worldgen test, like the simulation above, asserting the
  acceptance coverage on continent and island seeds.
- Renderer regression tests for 2D and true-3D overlays.
- On delivery, update [`game-mechanics.md`](game-mechanics.md), the
  [world bible](lore/galactic-lore.md) (charges, charts of biome regions,
  Renown source), the [galactic layer](game-mechanics.md#galactic-layer)
  reward rules, and add a client changelog entry.
