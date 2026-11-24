# Border Empires — Game Design Document

Status: canonical reference

Owner decisions recorded 2026-11-22. This is the north star: who the game is
for, what it should feel like, what is in and out of scope, and what wins when
two goals clash. Read it before proposing gameplay, product or monetization
changes.

It does not repeat rules or numbers. Those live in:

| Topic | Document |
|---|---|
| The loop, pillars, pacing, known tensions | [`core-loop.md`](core-loop.md) |
| Rules reference | [`game-mechanics.md`](game-mechanics.md) |
| Economy | [`product/resource-and-manpower-economy.md`](product/resource-and-manpower-economy.md) |
| Fiction and naming | [`lore/galactic-lore.md`](lore/galactic-lore.md) |

When this document and another disagree about intent, this one wins. When they
disagree about a number or a rule, the code wins and the docs get fixed.

## 1. The game in one paragraph

**Feeling.** Build a small settlement into a regional power you're proud of.
Every visit, you come back to find your plans worked, your borders held, and
one more clever move ready to make, in a month-long race against a hundred
rivals.

**Fiction.** Noble Houses land on a contested world and compete in a **Sector
Contest** for the Court. The House that wins holds the world, and its leader
becomes a Duke. Everything else about the setting is canon in
[`lore/galactic-lore.md`](lore/galactic-lore.md).

**Naming.** Players see "Sector Contest", never "season". "Season" survives
only in code and in older docs.

## 2. Who it is for

Adults with jobs who love strategy games (4X, browser strategy,
Diplomacy-style play) but can't put in hours any more. They play on their
phone a couple of times a day, 15–30 minutes a visit.

- **Phone first.** HUD, information density and interaction length are
  designed for a phone. Desktop is the richer secondary experience.
- Hardcore optimisers are welcome and find their depth in development, but the
  game is not paced or balanced around being online all day.

## 3. What is fun, in priority order

When features compete for attention, time or screen space, this order decides:

1. **Optimising and developing your own territory.**
2. **Strategic conflict at your borders.**
3. **Social and diplomatic play:** alliances, truces, ganging up on the leader.
4. **Exploration and discovery.**

## 4. Pillars

Pillars 1–5 are defined, with their code references, in
[`core-loop.md` §1](core-loop.md#1-core-fantasy-and-design-pillars). The owner
intent in §1.1 of that document still applies.

1. **No babysitting.** Anything that moves runs on its own once ordered.
2. **Manpower is the real currency.**
3. **Check in a couple of times a day, not all day.**
4. **Tall is viable against wide.**
5. **Several ways to win.** Five victory paths, each needing a 24-hour hold.
6. **A contest you don't win still pays off.** (Added 2026-11-22.) Ninety-nine
   of a hundred Houses lose each contest. A player who gives the game a month
   must come away with something to show for it: House Charges completed,
   records held, a rating, and awards. See §7.

Three principles sit beside the pillars:

- **Defending is cheaper than attacking.** A House that prepares its borders
  (Palisades, forts) survives being away between visits, even when attacked on
  several fronts. A House that doesn't prepare can be knocked out. Protection
  comes from preparation, not from a rule that prevents elimination.
- **A knocked-out House plays on.** It redeploys with a manpower reserve and
  can fight its way back. Even when it can no longer win, it plays for its
  Charges, the records and its rating.
- **AI Houses are rivals, not filler.** They play by the same rules and
  through the same actions as humans, with no hidden bonuses. A human should
  not be able to tell from the rules alone which Houses are AI. A new system
  may ship before the AI can use it, but AI support is always wanted.

## 5. What Border Empires is not

Use this list to say no quickly.

- No armies you steer by hand.
- No buying power (§8).
- No punishment for time offline.
- No requirement to be in a guild or a chat to compete.
- No power carried from one Sector Contest into the next. The galactic layer
  is for identity and bragging rights.

## 6. The Sector Contest and how players enter

A Sector Contest is the product unit: about 100 Houses on one map for up to 30
days, ending when a House holds a victory path for 24 hours. Each contest is
self-contained and fair.

- **One free public sector runs at all times.** Every new player starts there.
  A new player never waits for a sector to fill and never sees a payment
  screen first.
- **Humans plus AI.** A sector is designed for roughly 30–50 humans, with AI
  Houses filling the map.
- **Join at any time, with an honest warning.** A player can join a running
  contest whenever a viable landing site exists. The join screen states the
  day of the contest, the manpower bonus they land with, and that difficulty
  is high: they will have to fight tooth and nail to hold ground. They can
  choose to wait for the next contest instead.
- **No landing site, no join.** If the map has no viable site, joining is
  closed and the player's place in the next contest is reserved.
- **When the free sector is full:** a waiting list for the next free contest,
  plus an offer to fund a new sector (§8). The owner decides case by case
  whether to pay for a second free sector.

## 7. Bragging rights

This is how pillar 6 is delivered.

- **Public House profile on the web**, shareable as a link: contest history,
  placements, House Charges collected, records held, awards. A profile exists
  in the game today; the public web version is launch scope.
- **A simple rating** that moves with placement in each contest. Placement
  based at launch, not true Elo. Add it if the existing profile has none.
- **Records** such as Longest Road and Most Deadly Tile (already built).
- **Awards:**
  - **Never Gave Up:** the House that redeployed the most times in a contest.
  - **Comeback Kid:** a House that redeployed and still finished in the top 5.

## 8. Business model

The cost being covered is concrete: about USD 10 a month per sector server.

**Hard rule: money never buys power.** Not manpower, Coin, speed, vision or
any other advantage inside a Sector Contest. This holds for every future
product, including paid Houses.

| Product | What it is | Status |
|---|---|---|
| Free play | The full game in the one free public sector | Launch |
| Hosted sector | A private Sector Contest for a host and the people they invite, with AI Houses filling the rest. Paid by one host or split among a group; it opens when its funding bar is full | Launch |
| Cosmetics | 3–5 one-time purchases (House crest, colour scheme, capital skin, beacon skin), kept permanently across contests | Launch |
| Paid playable Houses | Houses that play differently, balanced as sidegrades | Decide after the first public contest, on its data |

- **Paid sectors cover themselves.** A hosted sector opens only when it is
  funded, so it cannot run at a loss. The only uncovered cost is the one free
  sector.
- **The hosting pitch:** your own world, starting now, with the people you
  choose. A solo game is a hosted sector with one human; there is no separate
  single-player product at launch.
- **Hosting options at launch:** map size and map type. Contest length, clock
  speed, AI difficulty and custom rules come later.
- **Smaller maps cost less.** Prices are set after load testing shows what a
  server can hold.
- **Purchases belong to the account, not the device.** The web is the main
  shop, through a provider that handles sales tax and VAT. The apps show what
  the account owns. In-app purchases are added if a store requires them or
  they clearly sell better.
- **Dropped:** a recurring patron or supporter pass. A mark plus goodwill is
  too weak to buy twice.

## 9. Launch: Q1 2027

**Definition.** One public Sector Contest runs to its end with at least 50
humans, on a server that stays stable with the map fully revealed, with
hosting on sale.

**Scope.** No new game systems before launch.

1. Stable server (gate number one).
2. The visit-as-a-turn flow ([`visit-as-a-turn.md`](visit-as-a-turn.md),
   [`replenishment-update-plan.md`](replenishment-update-plan.md)).
3. Fixed onboarding ([`core-loop.md` §12](core-loop.md#12-known-tensions-and-open-questions), tension 4).
4. Hosted sectors with payment.
5. Cosmetics.
6. Public web profile with rating and awards.

**If time gets tight,** cut in this order: cosmetics, then split funding
(keeping single-host payment), then the rating (keeping the profile). Items
1–3 are never cut.

**How we judge the first public contest.** Targets are set once there is a
baseline.

1. Share of humans still playing in week 4.
2. Share of humans who join the next contest. This one decides whether paid
   Houses are worth building.
3. Whether at least one sector is hosted or funded by players.

## 10. After launch

- **First design problem:** expansion goes flat in mid-game
  ([`core-loop.md` §12](core-loop.md#12-known-tensions-and-open-questions),
  tension 1). It ranks ahead of the runaway-leader problem because it hits the
  top priority in §3 and every player.
- **Paid playable Houses,** if the first contest's data supports them.
- **A true solo mode** with a faster clock.
- **More hosting options.**

## 11. Open items to verify before launch

- What one server can hold, including the load when the map is fully revealed.
  *Partly answered 2026-11-23 and 2026-11-24*
  ([`load-results/full-reveal-2026-11-23.md`](load-results/full-reveal-2026-11-23.md),
  [`load-results/sector-memory-2026-11-23.md`](load-results/sector-memory-2026-11-23.md),
  [`load-results/late-contest-2026-11-24.md`](load-results/late-contest-2026-11-24.md)):
  - One revealed player did degrade the server for everyone. The cause was
    found and fixed: the whole map was being re-sent on every change.
  - After the fix, 100 Houses (60 AI and 40 connected humans) with up to four
    revealed sessions ran without stalls on two CPU cores, early in a contest.
  - Memory: 100 Houses ran at about 0.9–1.1 GB with half the land owned,
    after about 150 MB of waste and one leak were removed. That is inside a
    small server's 4 GB.
  - Known 2026-11-24, with humans who send real commands and reconnect, one
    revealed session, in the production base image on two cores: the first
    nine game hours fit a 4 GB server with about 2.7 GB unused, at about 40 %
    of one core. The server is not what gives out first. The simulation's
    900 MB heap limit is: it held about 490 MB after nine game hours, peaked
    at 685 MB, and was still rising slowly when the runs ended.
  - Still open: whether that growth stops. Nine game hours is about 1 % of a
    contest, and it was not on the real Hetzner server. It needs a run of
    days on a throwaway server or on staging, which needs the owner. Until
    then the hosting price is not settled.
  - Decided 2026-11-23 (owner): raise the checkpoint process-memory
    watermark from 700 MB to 1,250 MB, so that checkpoints stop being put off
    at 100 Houses. Done 2026-11-24 in `deploy/env/*.env`, together with the
    simulation-heap watermark (480 MB to 680 MB), which was putting
    checkpoints off on its own once humans played.
  - Still open, owner decision: 1,250 MB holds early in a contest but not
    later. On a world with about nine game hours of play the process ran at
    1.2–1.3 GB and about a third of checkpoints were put off again. In every
    run so far a watermark of 1,500 MB would have put off none
    ([`load-results/late-contest-2026-11-24.md`](load-results/late-contest-2026-11-24.md)).
- What happens when a player tries to join a map with no room for a landing.
- Current Apple and Google rules on purchases made on the web and used in the
  apps.

## 12. Keeping this document true

Change this document in the same branch as any decision that changes it, and
date the change. If a proposal conflicts with it, either the proposal changes
or the owner changes this document first.
