# Mustering & The Advance — Beta Feature Story

> **Status:** Design pitch for beta feedback. Nothing here is shipped yet, and
> every number below is a placeholder we want to tune *with you*. The point of
> this doc is to explain where combat is today, where we want to take it, and to
> get your reactions and playtest notes before we build it.
>
> **How to read it:** Part 1 is how attacking works right now. Part 2 is the
> problem we're solving. Part 3 is the new system in detail. Part 4 is what
> changes for you. Part 5 is the actionable bit — specific things to try and a
> feedback form.

---

## Part 1 — How combat works today

Border Empires has no army units. **Combat is tiles changing owner.** You select
one of your tiles, target an adjacent enemy tile, and attack. Here's the full
loop as it exists today:

- **Manpower is a single empire-wide pool.** Your towns generate it. A small
  settlement caps you around 150 manpower; a sprawling metropolis around 2,400.
  It regenerates *slowly* — very roughly, a town refills its own cap over about
  12 hours. So manpower is genuinely scarce and you spend it deliberately.
- **An attack costs ~60 manpower, spent instantly,** from that one global pool —
  no matter where on the map the fight is. A town on your eastern coast can fund
  an attack on your western frontier this very second.
- **Combat is a dice roll weighted by power.** Your attack power vs. the
  defender's defense power decides your win chance. Then there's a **3-second
  combat lock** on both tiles so nobody can interfere mid-fight.
- **Defense comes from how "walled-in" a tile is** (we call it exposure). A tile
  surrounded by friendly tiles is tough; a lone tile jutting into enemy land is
  weak. Freshly-claimed frontier tiles barely defend at all; settled tiles,
  towns, and especially **forts** (which today multiply the manpower cost to
  crack them by 5×, 10×, even 20× — up to a brutal ~1,200 for a Thunder Bastion)
  are hard targets.
- **Losing an attack can cost you the tile you attacked *from*.** A failed
  assault can let the defender counter-capture your origin.
- **Gold income pauses while your manpower is below cap.** Even a well-fed town
  stops earning until your empire manpower is topped back up. This is the catch
  that shapes the new fort design below — anything that *spends* manpower also
  freezes your economy until it regrows.
- **Outposts today auto-fight.** A built outpost automatically attacks enemy
  tiles within a radius around it, spending from a per-outpost budget. It's a
  "set it down and it grinds" structure.

**It works — but attacking is essentially a click.** Manpower teleports, fights
resolve in 3 seconds, and your geography barely matters to *how* you attack, only
*where*.

---

## Part 2 — The problem we're solving

Three things bug us about today's combat:

1. **No sense of an army.** There's no buildup, no staging, no "I can see them
   massing on my border." You either have 60 manpower or you don't.
2. **Geography is flat.** Because manpower teleports to any front instantly,
   where your towns and forts sit doesn't shape your offensives — only your
   defenses.
3. **It's either too clicky or too hands-off.** Manual attacking is
   click-click-click along a border; the auto-sweep outpost is the opposite —
   it grinds with no intent behind it.

We want combat that feels like a **physical operation**: it happens *somewhere*,
takes *time*, can be *seen, raced, reinforced, or overrun* — and that reads as
the steampunk fantasy of winding up clockwork columns and running troop trains up
to the front before you unleash the advance.

---

## Part 3 — Where we're going: Mustering

The core change in one sentence:

> **You no longer spend manpower instantly to attack. You *muster* it at the
> border — troops gather on a tile over time — and that buildup is the only way
> to launch an attack.**

Here's how we expect it to work.

### 3.1 — Your manpower becomes a *pool* and a *pipeline*
- **Pool (unchanged):** your towns still raise manpower into an empire-wide pool.
  This is still your hard ceiling — *you can never muster troops you haven't
  raised.*
- **Pipeline (new):** a **logistics throughput** stat — how fast you can push
  that pool *forward to the front*. Think of it as how many troop trains you can
  run at once. It's set by your economy.

So the pool says *how much* you have; the pipeline says *how fast you can get it
to where the fighting is.*

### 3.2 — You attack by placing a muster flag
Select a border tile and **muster** there. Troops accumulate on that tile over
time, and you can watch the buildup fill. Once it banks the cost of an attack
(~60 manpower), it can strike the adjacent enemy tile.

Each muster flag has a **mode**:

- **HOLD** — gather up to a cap and wait. *You* decide when to fire. Use it to
  stockpile a heavy blow against a fortress, or to bait a reaction.
- **ADVANCE** — the instant it can afford an attack, it fires at the best
  adjacent enemy, then refills and repeats. A flag set to ADVANCE will **eat into
  enemy land on its own**, advancing tile by tile toward the direction you
  pointed it — but it's rate-limited by your pipeline and won't throw itself at
  hopeless targets (it won't attack a fort it can't out-muster, so it won't
  suicide into a full bastion).

A flag can even sit a tile or two *behind* the line and **claw its way forward**,
claiming a step at a time toward the objective.

**Barbarians are raided, not besieged.** Barbarian tiles move around (every few
seconds), so a slow muster would never catch one. Attacking a barbarian is
therefore a quick, cheap **raid** — closer to an expansion (~10 manpower, little
or no wind-up) than a mustered assault — and it resolves against whatever's on the
tile when it lands, so if the barb wandered off you simply take the ground it
left. Barb-clearing stays fast; only fortified *players* require a real muster.

### 3.3 — Outposts become railheads, not auto-fighters
We're **removing the outpost auto-sweep.** Outposts stop fighting on their own.
Instead, an outpost projects a **5×5 zone** that:
- **speeds up mustering** for your tiles inside it (a forward supply depot), and
- **boosts attack power** for strikes launched from inside it.

You build outposts to *stage* offensives — they're the railhead that makes your
army gather fast and hit hard.

### 3.4 — Mustering is visible, and that creates a race
A muster is **visible to anyone who can see the tile** — and since you can always
see the tiles bordering your own land, **any muster aimed at you shows up
automatically.** No Observatory needed for that (an Observatory only helps you
spot buildups *deeper* in enemy territory, before they reach your border).

This turns every attack into a **tempo race**:

- The defender gets a **window to react** — reinforce, build a fort, or muster a
  counter-strike of their own.
- If the defender **captures your mustering tile before it fires, the troops
  gathered there are lost.** Same if they take it mid-attack.
- Whoever has better forward infrastructure musters faster — so a well-placed
  outpost lets you **land your blow before the enemy's is ready.**

### 3.5 — Forts are manpower containers that fill over time
This is the mirror image of mustering. Where an attacker gathers troops on a
border tile, **a fort gathers a garrison on a defensive tile** — and that
garrison *is* its defense.

- **Forts don't cost a manpower lump to build.** (Good — a lump would drop your
  empire below cap and freeze your gold; see Part 1.) Instead, a fort fills its
  garrison **gradually**, and the trickle **starts while it's still under
  construction**, so it comes online already part-manned.
- **The garrison fills from your *spare* manpower** — the overflow once your
  empire pool is already topped up. So forts garrison while you're consolidating,
  and **don't** fill while you're spending manpower on attacks.
- **A fort's garrison is the number an attacker must out-muster.** No more
  abstract ×5/×10/×20 (the old ~1,200 wall is gone). A *freshly built* fort holds
  little and is easy to crack; a fort you've **held and let fill for a while**
  becomes a genuine siege. Placeholder caps: base fort ~120, Iron Bastion ~240,
  Thunder Bastion ~360.
- **A fort's defense scales with how full its garrison is.** A fort at half
  garrison gives about half its defense — fill ratio drives strength.
- **Every assault bleeds the garrison — even a failed one.** When the fort holds,
  it still loses ~5–15% of the attacking force from its garrison. So you don't
  need one giant stack to crack a bastion: **wear it down in waves.** Each repulse
  lowers both its strength *and* the manpower you'll need next time. The catch is
  the heal — see below.

**The siege is a heal race, and hitting many forts at once wins it.** A fort
refills its garrison from your *overflow regen*. So if you attack **several forts
at the same time, they all draw from the same regen and each heals slower** — a
fort-heavy turtle can be cracked by coordinated multi-front pressure, while a few
concentrated forts heal fast. (Mirror image of "concentrate your offense.")

The trade-off this creates:
- Sit and consolidate → your forts fill and your walls harden.
- Pour everything into attacks → your pool never tops up, the overflow dries up,
  and **your forts stay hollow.** Over-extending on offense quietly weakens your
  defense — an unmanned fort isn't a fortress.

**How you'll see it (important):** reserved garrison is **not** subtracted from
your manpower number — that number stays honest and always trends toward cap.
Instead, **each fort shows its own fill meter** right on the map (`⚙ 180 / 360`),
glowing as it garrisons and visibly hollow when it's been bled. If a wall is
weak, you can see exactly which fort is empty — no hidden math on your pool.

### 3.6 — Concentration beats spreading
You **can** place muster flags on many tiles at once — but your logistics
pipeline is **split across all of them.** Ten flags each fill at a tenth of the
speed. Mustering on every border tile buys you *nothing* in total speed; it just
thins you out everywhere. **One concentrated spear point — especially backed by
an outpost depot — fills dramatically faster than scattered probes.** Pick where
you push.

---

## Part 4 — What changes for you

| | **Today** | **With Mustering** |
|---|---|---|
| Launching an attack | Instant click if you have 60 manpower | Place a flag; troops gather over time, then strike |
| Where manpower comes from | One global pool, spent anywhere instantly | Same pool, but it must *flow* to the front via your pipeline |
| Can the enemy see it coming? | No | Yes — musters are visible; you can be raced or interrupted |
| What outposts do | Auto-attack a radius | Speed up mustering + boost attack power in a 5×5 (no auto-fight) |
| Forts | Walls with a flat ×5/10/20 cost to crack (up to ~1,200) | Containers that fill a garrison over time; that garrison is what an attacker must out-muster |
| Building a fort | Costs a manpower lump (which freezes your gold) | Costs no manpower lump; garrison trickles in instead — economy keeps running |
| Many fronts at once | Free (manpower teleports) | Possible, but splits your pipeline — concentration wins |
| Clicking | One click per attack | One flag per front; ADVANCE mode runs itself |

### What is **not** changing
- The core combat math: exposure/defensiveness, the 3-second combat lock, and
  counter-capture on a lost attack. (Fort defense changes — see §3.5 — from a
  flat multiplier to a real, fillable garrison.)
- How towns generate manpower; the tech tree; economy; victory paths; seasons.
- Claiming and settling **neutral** land — that stays exactly as-is. This change
  is about **attacks on enemy tiles**, not expansion into empty land.

---

## Part 5 — Help us test it (the actionable bit)

We can't tune this without you. Below are specific things to try once it's in a
playtest build, then a short feedback form. Even reactions to *this doc* (before
any build) are useful — tell us what sounds fun and what sounds broken.

### Test missions — try these and tell us how they felt
1. **The slow burn.** Drop a single HOLD flag on a quiet border with no outpost
   nearby. Time how long it takes to bank one attack. Was the wait tense or
   boring?
2. **The railhead.** Build an outpost behind the same border, then muster inside
   its zone. How much faster did it feel? Was building the depot worth it?
3. **Set-and-forget.** Put one flag on ADVANCE pointed at an enemy town and walk
   away for a few minutes. Did the front advance the way you wanted, or did it do
   something dumb?
4. **The duel.** Find an opponent (or AI) massing against you. Drop your own flag
   next to *their* staging tile and try to capture it before they fire. Did the
   race feel winnable / fair?
5. **The overreach.** Spend your whole pool on a big multi-front ADVANCE, then
   check your forts. Were they hollow because nothing overflowed into them, and
   did that punishment feel fair?
6. **Spread vs. spear.** Try mustering on five border tiles at once, then try one
   concentrated push of the same length. Which actually broke through faster?
7. **The fresh fort vs. the old fort.** Attack a fort someone *just* built, then
   attack one that's been standing a while. Could you feel the difference in how
   much you had to muster? Could you *read* a fort's garrison meter at a glance to
   know whether it was worth attacking?

### Feedback form — copy/paste and fill in
```
1. Muster pacing (no outpost): too slow / about right / too fast — and the number you'd pick (sec per attack):
2. Muster pacing (with outpost depot): too slow / about right / too fast:
3. ADVANCE flag: satisfying / "game plays itself" / didn't trust it — why:
4. HOLD vs ADVANCE: which did you use more, and should ADVANCE or HOLD be the default?
5. Forts filling a garrison over time: fun trade-off / annoying / didn't notice it:
6. Could you easily SEE how much garrison a fort held (the meter), and use it to decide whether to attack? yes / sort of / no:
7. The tempo race (seeing + capturing musters): exciting / frustrating / never came up:
8. Visibility: are you OK that all musters are visible, or do you want a way to hide a surprise attack?
9. Concentration vs. spread: did "one spear beats ten probes" feel right?
10. Are outposts still worth building now that they don't auto-fight? What would make a depot feel essential?
11. Did your gold/economy ever pause unexpectedly because of manpower? Was it clear why?
12. Anything that felt exploitable, confusing, or unfun:
13. Overall: does this make combat better than today? (1–5) and one sentence why:
```

### The big open questions we're stuck on
These are the design forks where your input matters most:
- **Pacing:** what's the right base muster time with no help — 20s? 60s? More?
- **Default mode:** should new flags default to HOLD (deliberate) or ADVANCE (low-click)?
- **Garrison weight & fill speed:** how big should a full garrison be (120? 360?),
  and how fast should it trickle in? Slow fill makes a fresh fort a real
  opportunity window; fast fill makes forts reliable but less interesting.
- **Combat math:** are you comfortable with fort defense becoming literal
  manpower-you-must-out-muster (one clean number), or do you prefer the current
  power-vs-power dice roll with garrison just feeding into it?
- **Surprise attacks:** should there *ever* be a way to hide a muster (a tech, a
  structure), or is "you can always see the army gathering" a core promise?

Drop your notes in the beta channel. Brutal honesty welcome — it's cheaper to
change our minds now than after we build it.
