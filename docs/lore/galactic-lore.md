# Border Empires — Galactic Lore (consolidated)

Status: **narrative reference / worldbible**, not in-game text. Nothing here
is written to ship verbatim on a loading screen or in UI copy — it uses
natural language for mechanics as long as it stays accurate, and cites the
exact section of `docs/galactic-campaign-design.md` (the design doc) that
each claim has to stay consistent with. If this doc and the design doc ever
disagree, the design doc wins; flag the conflict rather than silently
picking a side.

This supersedes all prior lore fragments from this thread. Four calls this
thread made (the user had no preference among the options offered, so the
recommended default was taken in each case) are recorded inline as they come
up, not buried in an appendix:

1. **Origin order**: the Bleed predates the current throne/Proclamation era;
   there is no older pre-Bleed monarchic tradition (see §L1).
2. **Beacon scope**: "beacon" is narrative flavor for existing mechanics
   (Scout missions, Relay Beacon, Listening Post, Deep Sensor Array), not a
   new buildable system. No design-doc or code changes are proposed by this
   document.
3. **Faction status**: the five philosophies (§L4) are pure flavor —
   lore texture for the five victory paths, not a faction-select mechanic.
4. **Doc purpose**: reference/worldbible, per the status line above.

A fifth thing changed mid-thread and isn't a default — it's a direct
correction from the user, recorded here as current canon: **the throne is
not the summit of the whole setting.** The "Emperor" the shipped mechanic
crowns is a title one civilization *bestows on outsiders*, not the seat of
its own ruler. That distinction is load-bearing for §L3 and resolves a
structural problem the earlier draft had (see the callout there).

---

## L1. Cosmology: the Concordance, the Bleed, and the Court

**The Concordance** once spanned known space, its technology powered by a
single central artifact — the **World Engine** — that made faster-than-thought
coordination, terrain reshaping, and the aether-based tech underlying
Monuments and Wonders (design doc §5) all routine. A war over who controlled
the Engine ended it: the Engine shattered, and the aether that once ran
Concordance civilization through it was released, ungoverned, into open
space.

**The Bleed** is that leaked aether, and it is actively hostile — unshielded
matter and people cannot survive prolonged exposure to it. This is the reason
known space isn't wall-to-wall colonized despite the technology existing: the
limit was never distance, it's survivability. Most of the Concordance's
successor populations did not survive the shattering; the handful of enclaves
that did were the ones that had — or fast-improvised — a way to hold a bubble
of survivable space against the Bleed.

**The Court** is the one Concordance successor that didn't just survive that
transition but mastered it completely. It perfected small, cheap,
mass-producible **anchor devices** that locally cancel the Bleed — the direct
ancestor of the shipped **Relay Beacon** structure (a vision/bridging tile
structure today; in-fiction, the Court's original invention). Wherever the
Court seeded these in numbers, survivable space knit back together into a
stable, governed **Core**. Centuries on, the Court sits at a genuine
technological and political peak inside that Core: no external rival, no
Bleed exposure, no scarcity that its economy can't absorb. It is not fighting
for survival anymore. It hasn't been for a long time.

That peak is the hinge the rest of this document turns on (§L2).

---

## L2. Why Sector campaigns happen: the Court's arena

A civilization with no real threats left and an anchor technology it can
manufacture essentially without limit has an unusual problem: ambition,
talent, and appetite for conquest don't have anywhere left to go inside the
Core. The Court's answer, formalized over generations into the **Writ of
Sectors** doctrine, is to manufacture somewhere for them to go — deliberately,
as policy, not as desperation.

Each season, the Court reaches past its own settled Core to the Bleed
frontier and does the one thing only it can do cheaply: it seeds anchor
beacons around a single world out in contested, semi-reclaimed space until
that world is stabilized enough to be inhabited and fought over for a bounded
stretch of time. That stabilized world **is** the season's Sector campaign
(design doc §1) — a self-contained, high-agency tile war the Court opens to
outside empires (the players) as a sponsored spectacle, under the Writ's
banner: *to hold nothing is to owe everything*. Combatants experience the
Writ as a moral obligation to expand or be judged weak. The Court's own
archives are blunter about it: it's a pressure valve, a proving ground for
administrators worth elevating, and — not incidentally — genuinely popular
entertainment across the Core, broadcast the way a slow, high-stakes contest
would be. Both things are true at once, and neither party is lying to the
other; they're just describing the same arrangement from different floors of
it.

This directly explains several things the earlier draft of this lore left
loose:

- **Why the map is bounded and tile-by-tile.** A season's Sector is exactly
  as large as the Court chose to stabilize before opening it, no larger.
  Expansion within the season *is* pushing your own claim to the edge of that
  stabilized boundary — you are not colonizing raw Bleed-space yourself, you
  are contesting ground the Court already rendered safe.
- **Why a beacon (Relay Beacon, design doc's aether-bridged tiles) is
  vision/connectivity infrastructure in the shipped game, not a survival
  mechanic the player manages.** Survival-grade anchoring is the Court's
  monopoly and its price of entry to host the game at all; what a player
  builds mid-season is a much smaller-scale descendant of the same
  technology, useful for reach and sightlines, not for staying alive — the
  season's whole map is already inside the Court-maintained bubble. This is
  the resolution to open question 4 from the brief: beacon is flavor for
  existing mechanics, not a new system, and this is *why* that's the right
  call rather than an arbitrary one.
- **Why losing a held Sector reopens it as a Defense Campaign with explicitly
  no incumbent bonus** (design doc §7, §11). The Court's anchoring holds the
  world stable regardless of who's winning inside it — contestation
  (Influence deficit, a raid, a Contest vote draining Stability to zero,
  §7) doesn't unmake the arena, it just means the current tenant lost their
  grip on it. The Court doesn't care who was there before; it reopens the
  contest to anyone, because the *point* was always the contest, not any one
  winner's permanence.
- **Why "Convergence" is triggered by the last unclaimed Sector, not a
  calendar date** (design doc §19.9). The show needs uncontested ground to
  stay a show. Once every currently-open Sector is claimed, there's nothing
  left to fight over in the current circuit — that's the natural act break,
  not an arbitrary clock. (The 40-Cycle ceiling still matters as the
  backstop against a bloc deliberately leaving one Sector permanently
  unclaimed to stall Convergence forever, per design doc §19.6/§19.9 — the
  Court's patience for the stalling tactic runs out, even if the players'
  doesn't.) §L2a below covers what happens to the galaxy once that fires.

---

## L2a. Why Convergence wipes the whole galaxy, not just the losing side

It's worth being explicit about a question the arc in §L6 glosses past:
territory keeps compounding all season and all era — Planets feed Dominion
Score (§19.7), Dominion Score feeds Senate weight and the throne — so why
does *all* of it reset at Convergence instead of the leading empire simply
carrying its accumulated territory into the next era and extending its lead?

Because no held Planet was ever sovereign property in the first place — it
was a **Court-granted lease on Court-stabilized ground**, identical in kind
to a single Sector's lease. That's not a new rule invented for Convergence;
it's the same logic the shipped Defense Campaign already enforces at the
scale of one Sector: lose your grip on it and it reopens to anyone, **with
explicitly no incumbent bonus** (design doc §7, §11), because the Court
never recognized the loser's hold as anything more than current tenancy to
begin with. Convergence is that identical mechanism firing at the scale of
the entire galaxy instead of one Sector, for the same reason:

- A fully divided, static galaxy with one empire holding everything stops
  looking like the Court's sponsored arena and starts looking like a rival
  government operating inside the Court's own frontier — precisely the
  outcome every other anti-entrenchment lever in this design (Crown Upkeep's
  escalating cost with zero income bonus, §19.5; the no-incumbent-bonus
  Defense Campaign reopen, §7/§11) already exists to prevent at a smaller
  scale. The Court does not let a champion's personal holdings calcify into
  permanent sovereignty that could someday rival its own; wiping the board
  is that same principle applied at the top instead of piecemeal.
- So what Convergence actually preserves is not territory — it's the
  **era record** (design doc §19.8): who held the throne at the moment the
  map ran out. That's the one thing genuinely permanent about winning; the
  Planets themselves were always the *means* to earn enough Dominion Score
  to be that empire, never the prize being kept. This is also the answer to
  "why bother capturing more if it all resets anyway": within a live era,
  territory is what buys the political weight to be the one *on the throne*
  when Convergence fires — the reset doesn't erase that the record exists,
  it just closes the book on that particular circuit.
- Once the board is cleared, the Court reseeds a new circuit elsewhere along
  its frontier — a new Core-adjacent reach of Bleed becomes viable to
  stabilize — and every empire, including the previous era's champion,
  starts the new era on the same unclaimed footing. Nobody is locked out of
  contesting the next era for having missed the last one; that symmetry is
  deliberate, not an oversight, for the same reason the Defense Campaign
  reopen already refuses an incumbent bonus at the smaller scale.

---

## L3. The throne: a title the Court lends out, not the seat it sits on

This is the one place the earlier lore draft was structurally broken, and
the user's correction fixes it directly: **an "Emperor" whose identity
changes every single season cannot be the sovereign of a civilization at a
stable technological and political peak.** That would make the Court's own
government reset every few weeks, which contradicts "peak of development"
on its face.

The fix: the Court's actual government is untouched by any of this. What the
Court hands out, season over season, is a **subordinate title** — call it
formally something like *Champion of the Writ*, universally shortened in
play to **Emperor** because that's the word the combatants themselves use for
whoever's currently on top of their own game. It is a proconsul-style
distinction the Court confers on the strongest performer in its arena, not a
transfer of the Court's own crown.

That reframing lines up cleanly with the shipped and designed mechanics
without changing any of them:

- **Bootstrap phase (shipped):** the most recent season's winner gets the
  title and its powers (the Imperial Ward endorsement window) automatically
  — design doc §19.2's "phase one of the win condition, not a name clash."
  In-fiction, this is simply the Court defaulting to the obvious metric
  (who just won) before there's enough of a governed frontier for anything
  more deliberate.
- **Elective phase (designed, §19.3–§19.4):** once ≥10 Sectors are claimed and
  ≥5 distinct empires hold Planets, the Court lets its client-empires elect
  the title themselves via pledged Dominion Score weight (§19.7) instead of
  auto-crowning the last winner. In-fiction: the Court is delegating more of
  the arena's internal politics to the players themselves as the frontier
  matures — a deliberate widening of the game, not a change in who's really
  in charge.
- **Crown Upkeep (§19.5), escalating the longer the title is held:** this is
  the Court's own anti-entrenchment leash on a title *it* still ultimately
  grants. It has no interest in one client-empire's champion becoming
  powerful enough to matter outside the arena — the escalating Influence
  cost is explicitly *not* matched by any income bonus (§19.5, "The
  Emperor's income bonus is zero, by rule and not by tuning"), because the
  title was never meant to be a real crown, just a very good prize.
- **The throne's authority only functioning inside anchored space:** whatever
  the Emperor title formally lets its holder do (Sanctions, Imperial Ward,
  the rest of the Senate's narrow toolkit, §4) only means anything where the
  Court's own beacons already hold ground — there's no one to receive a
  Proclamation issued into the Bleed, and no Court interest in extending the
  title's reach past its arena.

---

## L4. The five philosophies (flavor only — see the "faction status" call above)

Combatant empires that repeatedly compete in the Court's arena tend to
settle into recognizable temperaments, one loosely per victory path (design
doc §3's specialization table). These are **not** a faction-select system,
a roster, or anything with mechanical weight — they're texture available for
flavor text, loading screens, and in-fiction quotes, and any given empire
(i.e., any given player) can ignore them or blend them freely.

| Philosophy | Leans toward | In-fiction read on the Writ |
|---|---|---|
| **Unifiers** | Town Control → Industrial | Ground held is ground governed; legitimacy is a headcount. |
| **Cartels** | Economic Hegemony → Trade | The Writ is a market. Whoever's income the rest of the arena depends on already won, titles are just paperwork. |
| **Purists** | Resource Monopoly → Extraction | Concentration is strength; splitting a resource across many small holders is just distributed weakness. |
| **Tideborn** | Maritime Supremacy → Logistics | The docks and the routes between them matter more than any one parcel of ground. |
| **Concord-Reborn** | Diplomatic Dominance → Capital | Named for a (probably inflated) claim of literal Concordance descent. Bloc politics over solo conquest — closest in temperament to the Court itself, which they take as vindication. |

---

## L5. Beacon failure — a proposal, not settled canon (open question 2)

The brief asked for a default call on what happens when a beacon fails,
flagged as a proposal rather than blocking. Given §L2's framing (season-scale
survival anchoring is the Court's job, not something a player-built
Relay Beacon provides), this is now a smaller question than it looked before
resolving Q1: it's about narrative color for the *existing* Stability-to-zero
consequence (design doc §7), not a new mechanical failure state.

**Proposal:** treat a Sector's Stability hitting zero (via Influence deficit,
a successful raid, or a passed Contest vote — the three paths in §7) as the
in-fiction moment the Court's own anchoring around that world is judged to
have gone unmaintained by its current tenant, and the Court reels the
stabilized boundary back to a safer default until a new tenant is seated by
the reopened Defense Campaign. That's flavor text for a mechanic that
already exists exactly as specified (deficit drains the single
lowest-Stability Sector at −8/Cycle, healthy net-positive Influence recovers
+15/Cycle, per §13) — no new rule, no new number, and nothing here proposes
changing the drain/recovery figures. Sharper, more visceral in-fiction
consequences (a scramble, an evacuation) are available as narrative
dressing on that same numeric event without inventing a second mechanic
alongside it.

This is a proposal for narrative color only. It does not touch design doc
§13's numbers and doesn't need to be checked against §13's balance table the
way a new numeric value would (open question 3 from the brief doesn't apply
here, precisely because nothing new is being costed).

---

## L6. The five-act arc, restated against this frame

Unchanged in shape from the earlier draft, restated so each beat cites the
mechanic it's dramatizing:

**I. Proclamation & Frontier landing.** The Court opens a new Sector; the
Writ's doctrine is the in-fiction reason your empire answers the call. Maps
to a fresh season start (§1).

**II. First Planet won.** The first taste of permanence — trickle income,
Senate eligibility, a specialization (Industrial/Trade/Extraction/
Logistics/Capital, §3) that becomes part of your empire's identity going
forward.

**III. The precarious middle.** Senate politics (§4), the first real
Influence-deficit scare or lost Planet reopened as a Defense Campaign with
explicitly no incumbent bonus (§7, §11) — the Court's willingness to hand
your former ground to whoever's next reads, narratively, as the arena's
central cruelty and its central fairness at once.

**IV. The throne turns elective.** ≥10 Sectors claimed, ≥5 distinct
Planet-holders, standing pledges instead of a per-Cycle ballot (§19.3–§19.4),
Crown Upkeep making the title a burden its holder chose to carry (§19.5) —
narratively, the moment your empire stops just playing the Court's game and
starts contesting its rules from the inside, exactly as far as the Court
ever lets that go (§L3).

**V. Convergence.** The last unclaimed Sector falls; whoever holds the
title at that instant wins the era (§19.1, §19.9); the Court records the era
(§19.8) and reseeds a new circuit elsewhere along its frontier. The
"stalling incentive" problem (design doc §19.6, keeping one Sector open
forever) and the 40-Cycle ceiling that closes that loophole are, narratively,
the Court's patience for the show finally running out.

---

## Open items still unresolved (carried forward, not blocking)

- No named individual characters yet — no Emperor lineage, no Court
  officials, no day-to-day texture of life inside a Court-anchored world vs.
  a season's Sector. Out of scope for this pass; flagged for whoever picks
  this thread up next.
- §L5's beacon-failure color is a proposal the user hasn't signed off on
  yet — treat it as draft canon, not settled, until confirmed.
