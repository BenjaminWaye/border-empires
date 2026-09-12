# Border Empires — Galactic Lore (consolidated, v2)

Status: **narrative reference / worldbible**, not in-game text. Uses natural
language for mechanics as long as it stays accurate, and cites the relevant
section of `docs/galactic-campaign-design.md` (the design doc) wherever a
claim needs to stay traceable to it.

**This revision supersedes the entire previous version of this document.**
Several calls made across this thread diverge deliberately from what's
currently shipped or currently specified in the design doc — the Emperor
selection mechanic (§19.2) and the Convergence win condition (§19.9) both
get replaced below. Per direction from this thread: **the lore doc describes
where the setting is going, not where the shipped code is today.** Those
divergences are called out explicitly at each point below rather than
silently overwritten, so nothing here should be read as claiming the
current build already works this way.

---

## 1. Cosmology

The **Concordance** once spanned known space, its civilization run through a
single central artifact, the **World Engine** — the source of the
aether-based technology still visible today in Terrain Shaping and in the
four Monuments/Wonders that are recognizable Concordance architecture
fragments. A war over control of the Engine ended it: the Engine shattered,
and the aether that once ran everything through it didn't disappear. It
leaked out, ownerless, into open space.

**The Bleed is that leaked aether, still doing what aether always did:
network, spread, propagate.** It has no controller and no intent. It's
lethal to unshielded matter and life not because it's malicious, but because
it's still behaving like infrastructure with nobody driving it — closer to
a wildfire or entropy at the edge of cleared land than to a fog or a
monster.

**The Court** is the one Concordance successor that mastered anchor/beacon
technology well enough to reclaim and hold a stable, governed **Core**. It
sits today at a genuine technological and political peak: no external
rival, no scarcity its economy can't absorb, nothing left to research.

### 1a. Aether, made concrete: Crystal and Shard

Two shipped strategic resources map directly onto aether, at two different
states of it, rather than needing an invented third:

- **Crystal deposits are aether that crystallized.** Loose aether in the
  open (the Bleed) is volatile and hostile; aether trapped underground in
  stable rock, over centuries, settles — crystallizes, the way carbon
  compresses into diamond. A Crystal deposit is dormant, stable, and safe
  to mine exactly because it's aether that has gone quiet. Refining it at a
  Synthesizer (already a shipped structure) is what puts it back into
  active circulation as fuel for aether-tech constructs.
- **This is also the precise meaning of "activating a system's aether
  reserves":** it's mining and refining Crystal. No new resource or
  mechanic is implied — this is a fictional reading of an existing one.
  It matters later (§4) because this act is exactly what draws hostile
  attention.
- **Shard rain is a separate, rarer phenomenon: drifting fragments of the
  shattered World Engine itself**, not aether-in-general. Far more potent
  and far less stable than settled Crystal, occasionally precipitating
  onto a planet's surface when local conditions destabilize enough to drop
  them — which is exactly why shard sites are rare, high-value, and decay
  within 30 minutes if uncollected: raw Engine-aether doesn't stay put.
  Fittingly, Shards feed the **World Engine** Monument (already a shipped
  structure name) — building it is literally reassembling fragments of the
  artifact whose destruction caused all of this.
- A shard site, being the most concentrated aether disturbance available on
  a map, is also the single biggest flare a Warden or Bleed-infestation
  (§3) could key on — racing for one is a real gamble, not just an economic
  scramble.

Note: this section treats Crystal/Shard as aether **in the fiction only**.
Renaming the underlying `CRYSTAL`/`SHARD` constants in code is a separate
engineering decision, not implied by this doc.

---

## 2. Why Sector campaigns happen: a feudal Court's war games

The Court's civilization is not just technocratic, it's **feudal** — a
structure that has arisen even at a technological peak, and is in fact why
that peak has been static for so long: a feudal social order is a genuine
brake on advancement, the same way it was on Earth's own middle ages, which
were its slowest period of technological progress. Stagnation here isn't
"we ran out of things to research" so much as "our own political structure
stopped rewarding the kind of change that would upend it."

**This directly supersedes design doc §19.2's framing** ("the season-winner
Emperor is the bootstrap form of a Senate-elected title"). In this lore,
there is no rotating Emperor-of-the-season at all:

- The Court periodically opens a **Sector** — a designated world at its
  Bleed frontier — as a sanctioned **war game** for its nobility to fight
  over. This keeps an ambitious feudal aristocracy occupied with something
  other than plotting against the Court itself, doubles as popular
  spectacle across the Core, and serves as a genuine proving ground for
  talent. None of this is a secret from the nobles fighting it; the Writ of
  Sectors ("to hold nothing is to owe everything") is simply the moral
  framing they fight under.
- **Winning a Sector campaign grants the victor the rank of Duke and
  personal rights to that Planet** — a real, permanent title and holding,
  not a temporary crown. There is no galaxy-wide Emperor selected from
  season outcomes; every win just makes one more Duke.
- **The Court fears its own Dukes.** A Duke who accumulates enough
  Planets to look like a real concentration of power gets **culled** —
  the Court simply takes a Planet back. A Duke who resists that culling is
  destroyed outright. Ten Planets is nothing at galactic scale; the
  threshold that triggers a culling is about **defiance and visible
  concentration**, not about raw territorial threat to the Court's own
  power. This is the Court's actual anti-snowball lever at the top of the
  political ladder, distinct from the Bleed's anti-snowball pressure at the
  ground level (§4).

---

## 3. The Bleed as active threat: Wardens and infestations

Everything in this section shares one root cause and works the same way at
every scale: **nothing here checks credentials. It's all physics, not
judgment.** No detector verifies who you are; things react to what you are
actually, physically doing.

### The Wardens

After the Engine shattered, the Concordance (the Court's own precursor)
built and released the **Wardens** — automated constructs whose original
purpose was to hunt down and destroy **Bleed-infestations** (below) before
they could grow. It was a reasonable, even heroic mandate.

It failed. The Wardens could not reliably tell a wild infestation apart
from the Concordance's own aether-integrated infrastructure — and aether
tech was woven into everything the Concordance built. A search-and-destroy
order against one kind of aether construct generalized into all of them.
The Wardens turned on their makers. What followed was effectively a second
war, fought to shut down a cleanup corps that could no longer distinguish
friend from target. Most Wardens were destroyed in it. The ones that
remain are found only out at the frontier, far from the Core's defenses —
old, malfunctioning, and still executing a mandate nobody now living gave
them.

### Bleed-infestations

Out on frontier worlds, raw aether doesn't just sit as ambient hazard — in
enough concentration, it can **cohere**. An infestation is an intangible
mass of aether that builds itself a body out of the surrounding terrain,
growing into a genuine structure that actively consumes any aether it can
reach. This is the thing the Wardens were originally built to fight, and
the thing still quietly present on most frontier Sectors before any player
ever arrives.

**This is also the answer to why frontier towns are aether-free, without
needing calms, legacy tech tiers, or any kind of authorization/detection
system** (all of which this thread tried and discarded before landing
here): a local infestation has already scavenged every trace of ambient
aether in its reach. There is nothing left near these towns for anything
to react to. The native population never had beacon-grade survival tech
because there's no free aether left to run it on — they've reverted to
plain combustion engines and equivalent old-world technology to keep their
vehicles and cities running, and that reversion is a direct, visible
consequence of the infestation's presence, not a separate worldbuilding
fact that needs its own justification.

### Why arriving on a Sector is dangerous

An infestation that's been quietly scavenging trace aether for years is
dormant relative to what it becomes once a real target shows up. **The
moment your empire starts mining and refining Crystal — activating a
system's aether reserves (§1a) — you've handed a starving, dormant
infestation the richest concentrated food source it has ever encountered.**
It rouses, and starts actively hunting your operation. Any Wardens still
present nearby, still keyed to react to active aether constructs, home in
on the same activity for the same reason. This is not detection or
judgment — it's the same physical principle as lightning finding the
tallest conductor: you are, factually, generating a disturbance, and both
threats are drawn to disturbance.

This scales the same way at the galactic layer: a Duke's fully developed
Planet — industry, Wonders, a running trickle economy, all of it powered by
actively refined aether — is a far larger, more permanent disturbance than
a small, quiet holding. **The bigger and more successful a Duke's empire
gets, the more Warden and infestation attention it draws, automatically, as
a direct consequence of its own success.** This is the mechanism this whole
thread set out to find: an anti-snowball pressure that can't be gamed,
because there's no credential to fake — only real economic activity to
either have or not have.

**Barbarians (shipped mechanic) are the tile-scale expression of this**,
and need no new gameplay, only a fictional relabel: a barbarian tile is
**still-wild ground** the Bleed/an infestation still physically holds at
the frontier. Dormant until your claim touches it (no detection needed,
just contact), and the existing "walk/multiply" behavior becomes exactly
what it sounds like — winning pushes the wild ground back and stabilizes
it; losing lets it reclaim the tile.

**Open, deliberately unresolved:** whether something intelligent rides or
directs these infestations on purpose — a hive-like species — rather than
them being purely mindless accretions of aether. Left open on purpose, not
canon yet.

---

## 4. The endgame: overthrowing the Court

**This directly supersedes design doc §19.9's Convergence trigger** (last
unclaimed Sector captured, 40-Cycle ceiling) **and retires the previous
version of this doc's "era wipes and resets" explanation** built on top of
it — that machinery assumed an Emperor selected from season wins and a
galaxy that periodically clears itself, neither of which survives §2's
Duke/culling model.

The galactic layer now ends when a Duke — or, more likely, a coalition of
Dukes — successfully **overthrows the Court**. This reframes the whole
layer:

- Dukes still compete against each other for Planets, titles, and standing
  within the feudal order, same as ever.
- But the layer is also **cooperative against a common authority**: the
  Court's culling policy (§2) gives every sufficiently successful Duke the
  same enemy, and unseating the Court is not something one empire manages
  alone against an opponent built to auto-punish exactly that kind of
  individual accumulation.
- **Whoever leads a successful overthrow gets a real choice, not an
  automatic prize**: crown themselves the new Emperor and inherit the
  Court's authority, or dissolve it and hand power back to the galaxy's
  populace. Both are legitimate endings; neither is scripted as "correct."

**Left open, on purpose, for a later pass:** whether a fallen Court wipes
the galaxy's territory clean the way Convergence used to (a fresh start for
the next era) or leaves existing Duke holdings standing under new,
different rules. Both are plausible; nothing here commits to either yet.

---

## 5. The five philosophies (flavor only)

Unchanged from the prior version, and still pure flavor — no faction-select
mechanic, no mechanical weight. Any Duke's empire (any player) can ignore
these or blend them freely; they're texture for loading screens and
in-fiction quotes, loosely mapped one per victory path (design doc §3):

| Philosophy | Leans toward | In-fiction read |
|---|---|---|
| **Unifiers** | Town Control → Industrial | Ground held is ground governed. |
| **Cartels** | Economic Hegemony → Trade | The Writ is a market; income is legitimacy. |
| **Purists** | Resource Monopoly → Extraction | Concentration is strength. |
| **Tideborn** | Maritime Supremacy → Logistics | Routes matter more than any one parcel. |
| **Concord-Reborn** | Diplomatic Dominance → Capital | Claims literal Concordance descent; bloc politics over solo conquest. |

---

## 6. The five-act arc, restated against this frame

**I. Proclamation & Frontier landing.** The Court opens a Sector as a
sanctioned war game; the Writ is the doctrine you fight under. Mining
Crystal to fuel your expansion is also the act that starts drawing
Warden/infestation attention (§3).

**II. First Planet won, Duke rank granted.** Not a temporary crown — a
real, personal title and holding. The first taste of permanence, and the
first moment the Court starts watching how much more you accumulate.

**III. The precarious middle.** Senate politics (design doc §4), a lost
Planet reopened as a Defense Campaign with no incumbent bonus (§7, §11) —
and, new to this framing, the live threat of the Court's own culling if
your holdings start reading as a concentration of power rather than just
another Duke's estate.

**IV. Building toward the overthrow.** Rather than an elective throne
(superseded, §2/§4), this act is about accumulating enough standing and
allies among fellow Dukes to make a real attempt at the Court itself —
competing for status while quietly building the coalition the Court's own
anti-entrenchment policy makes necessary.

**V. The overthrow.** A coalition move against the Court succeeds or fails.
On success, its leader chooses: crown themselves Emperor, or dissolve the
system and release power to the galaxy's people. Either ending closes the
era; what happens to the map afterward is open (§4).

---

## Open items carried forward, not blocking

- Whether Bleed-infestations are directed by an unseen intelligence (a
  hive-like species) — deliberately unresolved.
- Whether a fallen Court wipes the galaxy clean or leaves holdings standing
  — deliberately unresolved (§4).
- The actual Warden/infestation incursion mechanic against a held Planet —
  trigger cadence, scaling with a Duke's development, resolution against
  Garrison/Stability — is still a system to design and cost against design
  doc §13's balance table, not invented here.
- Whether `CRYSTAL`/`SHARD` get renamed in code to match their new
  in-fiction meaning, or stay as-is with the fiction layered on top — open,
  a separate engineering decision from this doc.
- No named individual characters yet (no named Dukes, no Court officials,
  no day-to-day texture of a Sector campaign or a Duke's court). Out of
  scope for this pass.
