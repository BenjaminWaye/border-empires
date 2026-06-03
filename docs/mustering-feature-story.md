# Mustering & The Advance — Beta Feature Story

> **Status:** Design pitch for beta feedback. Nothing here is final — the whole
> point of this doc is to get your reactions before we build it. Numbers are
> placeholders.

---

## The one-liner

**You no longer spend manpower instantly to attack. Instead you *muster* it at
the border — troops physically gather at a tile over time — and that buildup is
the only way to launch an attack.** Put a muster flag down, watch the columns
form, and send them forward. Outposts become the railheads that make it fast.

---

## Why we're doing this

Right now, attacking is a click: if you have 60 manpower anywhere in your empire,
you can capture a tile on the far side of the map this instant. Manpower
teleports. It works, but it's flat — there's no sense of an army, no buildup, no
"oh no, I can see them massing on my border," and no real reason your geography
matters.

Mustering fixes that. It turns attacking into a **visible, physical operation**
that takes place *somewhere*, takes *time*, and can be *raced, reinforced, or
overrun*. It also cuts down on clicking: you set a muster flag once and the front
advances on its own.

This is the steampunk fantasy we want — winding up the clockwork columns at the
frontier, running troop trains and coal tenders up to the railhead, and
releasing the advance.

---

## How it works (player's-eye view)

### 1. Your manpower is a *pool* and a *pipeline*
- Your towns still raise manpower into your **pool** (same as today — this is your cap).
- New: you also have a **logistics throughput** — how fast you can push that
  pool *forward to the front*. Think of it as how many trains you can run.

You can't muster troops you haven't raised, and you can't push them forward
faster than your logistics allow. The pool is the ceiling; the pipeline is the speed.

### 2. You attack by placing a muster flag
Select a border tile and **muster** there. Troops accumulate on that tile over
time (you can watch it fill). Once it banks the cost of an attack (~60 manpower),
it can strike the adjacent enemy tile. Each muster flag has a mode:

- **HOLD** — gather up to a cap and wait. You fire manually. Good for stockpiling
  a big hit against a fortress.
- **ADVANCE** — the moment it can afford an attack, it fires at the best adjacent
  enemy, then refills and does it again. This is the "set it and forget it"
  parasite-style advance — it eats into enemy land on its own, just rate-limited
  and pointed where you aimed it.

A flag can sit slightly behind the line and **claw its way forward**, expanding
one tile at a time toward the objective you pointed it at.

### 3. Outposts are now railheads
We're **removing the old auto-sweep behavior from outposts.** Instead, an outpost
projects a **5×5 zone** that:
- **speeds up mustering** for your tiles inside it (the forward depot), and
- **boosts attack power** for strikes launched from inside it.

So you build outposts to *stage* offensives, not to fight on their own.

### 4. It's a race, and everyone can see it
A muster is **visible** — no Observatory needed to see troops gathering against
your own border (an Observatory only lets you spot buildups deeper in enemy
land). That means:
- The defender gets a **window to react** — reinforce, build a fort, or muster a
  counter-strike of their own.
- If the defender **captures your mustering tile before it fires, the gathered
  troops are lost.** Same if they take it mid-attack.
- Whoever has better forward infrastructure (an outpost near the contested tile)
  musters faster — so you can **out-tempo** an opponent and land your blow before
  theirs is ready.

### 5. Forts hold a garrison
New tension: **active forts reserve a slice of your manpower pool as garrison.**
That manpower is walled off — you can't muster it for attacks. Build a wall of
forts and your defenses are rock-solid, but you'll have *less* manpower free to
push offensives. Go all-in on attacking and your fortifications stay manned, but
your offensive runs dry first. An unmanned fort shouldn't be a fortress, and now
it won't be.

### 6. Concentration beats spreading
You **can** put muster flags on many tiles at once — but your logistics
throughput is **split across all of them.** Ten flags each fill at a tenth the
speed. Mustering on every border tile buys you nothing; it just thins you out.
One concentrated push — especially backed by an outpost depot — fills far faster
than scattered probes. **Pick your spear point.**

---

## A couple of vignettes

**The breakthrough.** You want the enemy's river town. You build an outpost two
tiles back, drop a single HOLD flag on the bordering tile, and let it stockpile
inside the depot's speed bonus. The enemy sees it coming and starts a fort — but
your railhead fills you first. You launch, take the tile, and your flag advances
onto the next one.

**The counter-punch.** Your neighbor masses a muster against your mining tile.
You can't out-build their stack in time — but you *can* drop your own flag on the
tile next to *their* muster and race them. Your outpost makes you faster. You
strike first, capture their staging tile, and their entire gathered army
evaporates.

**The overreach.** You pour everything into a three-front ADVANCE. It works —
land floods in. Then a rival hits your heartland, and you discover your forts are
hollow: you spent the pool that would have manned them. The walls fall because
nobody was home.

---

## What this changes about how you play

- **Geography matters.** Where your depots and forts sit decides where you can
  strike fast and where you're slow.
- **Attacks are commitments, not clicks.** You telegraph them; you can be
  interrupted; timing is a skill.
- **Offense and defense compete for the same manpower.** You can't be all-in
  everywhere.
- **Less micro, more intent.** Set a flag to ADVANCE and a front manages itself.

## What we're *not* changing

- The core combat math (exposure/defensiveness, fort multipliers, the 3-second
  combat lock, counter-capture on a lost attack).
- How towns generate manpower, or the tech tree, economy, victory paths, seasons.
- Frontier claiming/settling of neutral land (that stays as-is; this is about
  *attacks*).

---

## What we want your feedback on

Please react to any of these — this is the stuff we're unsure about:

1. **Pacing.** How long should a single muster take with *no* outpost help —
   ~20s? ~60s? Longer? Where does "tense buildup" become "boring wait"?
2. **The ADVANCE flag.** Does a self-advancing front feel satisfying, or does it
   feel like the game is playing itself? Should ADVANCE be the default, or HOLD?
3. **Forts reserving garrison.** Is "all-in offense hollows your defense" a fun
   trade-off, or an annoying tax? Should the reserved amount be small (flavor) or
   big enough to force real choices?
4. **The tempo race.** Is racing an opponent's muster (and capturing their
   staging tile) exciting, or frustrating to be on the losing end of?
5. **Visibility.** Should *all* musters be visible, or should there be a way to
   stage a surprise attack (e.g. a tech/structure that hides a buildup)?
6. **Concentration vs. spread.** Does "one spear point fills fast, ten probes
   crawl" feel right? Or do you want to be able to pressure a whole border at once?
7. **Outposts as depots.** Now that they don't auto-fight, are outposts still
   worth building? What would make a depot feel essential?
8. **Anything that sounds like it'd be exploitable or unfun** — tell us before we
   build it.

Drop your thoughts in the beta channel. Brutal honesty welcome.
