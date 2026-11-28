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
   (2026-11-26, owner decision: Town focus changes within a minute rather than
   at the next refill, so a visit can be spent tweaking towns while manpower
   refills. A confirmed change then locks that town until the next refill, so
   re-tuning is at most once per town per refill. See `town-focus-plan.md`.)
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
  *Decided 2026-11-27 (owner):* a viable site is one whose opening reach is
  clear of every rival's reach; a reserved place gets in even when the next
  contest is at its player cap; a House redeploying after elimination also
  needs a viable site; and the join screen is always shown, never skipped.
  *Decided 2026-11-27 (owner):* choosing to wait keeps the player on a
  waiting screen, not an empty map: the Sector Contests running now, the
  offer to fund a new sector, the running contest's current standings, a
  way to be emailed when the next contest starts, and the option to land
  after all. The screen does not close to the map, which is all fog for a
  player who has not joined. Waiting does not reserve a place.
- **The sector list** (decided 2026-11-27): the join screen lists the Sector
  Contests running now that the player can play in. A full one (every House
  place taken, or no viable landing site) is greyed out. If none has room,
  or the player chose to wait for the next contest (decided 2026-11-27), the
  player can start funding a new sector. The host of a hosted sector is
  not notified.
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
- **Records** such as Longest Road and Most Deadly Tile (already built). Longest Road also shows its current holder during play (owner decision, 2026-11-25).
- **Achievements:** hard personal badges earned once per contest, which must not repeat the victory paths, records, awards or House Charges (owner decision, 2026-11-25).
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
| Cosmetics | One-time purchases kept permanently across contests. Sell what rivals see. Launch set, in build order (decided 2026-11-23): muster flag design, ancillary soldier skin, then colour scheme and beacon skin | Launch |
| Paid playable Houses | Houses that play differently, balanced as sidegrades | Decide after the first public contest, on its data |

- **Paid sectors cover themselves.** A hosted sector opens only when it is
  funded, so it cannot run at a loss. The only uncovered cost is the one free
  sector. *Changed 2026-11-24:* hosted contests have no time limit; a hosted
  sector is closed after 7 days with no human visit. A sector played for more
  than about three months therefore costs more than its price; the owner
  accepted this.
- **Hosted sector terms** (decided 2026-11-23 and 2026-11-24): Standard
  (640×320) and Small (320×160) maps, both USD 20 including tax; no cap on
  sectors running at once; the seller is TIDN AB. *Decided 2026-11-25:*
  EU, EEA and UK consumers may withdraw within 14 days, paying for the days
  the sector was open; everyone else gets no refund once a sector has opened,
  except for faults on our side and any other right the buyer has by law. Details in
  [`hosted-sectors-plan.md`](hosted-sectors-plan.md) §13.
- **The hosting pitch:** your own world, starting now, with the people you
  choose. A solo game is a hosted sector with one human; there is no separate
  single-player product at launch.
- **Hosting options at launch:** map size and map type. Contest length, clock
  speed, AI difficulty and custom rules come later.
- **Price at launch: USD 20 for a standard sector** (decided 2026-11-23). Each
  sector needs its own server for now. Smaller maps should cost less, but a
  cheaper tier is added only after it has been measured.
- **A funded sector starts by itself.** Once payment completes, the server is
  created and the contest opened automatically; the owner does not start
  servers by hand (decided 2026-11-23).
- **The first cosmetic product: "Claim the title of Count", USD 4.99**
  (decided 2026-11-24 and 2026-11-25). One purchase gives the High-noble muster
  standard and the Lancet guard soldier look, and the title of Count, shown
  before the House name on the contest roster and the public profile. It is
  sold as one bundle, not as separate items. The title confers nothing in a
  contest; Duke is still only earned. Details: [`cosmetics.md`](cosmetics.md).
- **Cosmetics not in the launch set:** an AFC skin, because rivals rarely see
  the AFC.
- **House crests, free for now** (owner decision, 2026-11-27, after two
  playtesters found the letter-in-a-square emblem generic and looked for a
  way to personalise it). A House picks one of 12 crests, drawn in place of
  its initial inside the same emblem, so the diplomacy screen gains no extra
  marks, and stitched on its muster flags in place of the cog. Name, colour
  and crest are chosen together in one dialog. Each of the three can be changed
  once per Sector Contest, with its own allowance; the first crest pick (letter
  to crest) counts (owner decision, 2026-11-27). The catalogue flags each crest `free`, so paid crests can be added
  later without new plumbing. Details: [`cosmetics.md`](cosmetics.md#house-crests).
- **Purchases belong to the account, not the device.** The web is the main
  shop. Payments go through Stripe (decided 2026-11-23). Stripe collects
  the money but does not file sales tax or VAT for the owner; registration and
  filing stay with the owner. The apps show what
  the account owns. In-app purchases are added if a store requires them or
  they clearly sell better.
- **App stores (decided 2026-11-26).** Android ships consumption-only: it shows
  owned cosmetics and hosted sectors, with no prices, buy buttons or links to
  the web shop. Apple requires items bought on the web to be buyable in the
  iOS app too, so the iOS app gets in-app purchase for hosted sectors and
  cosmetics before it is submitted. That work comes after the web and Android
  launch and does not hold it up. No links out to the web shop from either app
  at launch. Details and sources: [`app-store-purchase-rules.md`](app-store-purchase-rules.md).
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

**If time gets tight,** cut in this order: cosmetics, then the rating
(keeping the profile). Items 1–3 are never cut. Split funding was first in
line to be cut but is kept for launch (owner, 2026-11-25).

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
    contest, it was not on the real Hetzner server, and all 40 humans were
    online throughout, where real players take a 15–30 minute turn about
    every four hours. Next (owner, 2026-11-24): a run of days on the owner's
    own machine with humans playing in turns. Until then the hosting price
    is not settled.
  - Known 2026-11-27, from 69.5 hours on the owner's MacBook with humans
    playing in turns: the growth does not stop. What the simulation holds
    after garbage collection rose to 470 MB, still about 1.2–1.5 MB an hour
    on day 3; at that rate the heap's peaks reach the 900 MB limit around
    day 10 of a contest. What holds it is not known yet. Tap times from that
    run do not count, because the Mac was heavily loaded by other programs.
    The hosting price is still not settled.
  - Known 2026-11-28
    ([`load-results/sim-heap-growth-2026-11-28.md`](load-results/sim-heap-growth-2026-11-28.md)),
    from heap snapshots of an aged world: the growth above follows owned
    land, about 5 KB per newly owned tile, which accounts for the whole
    day-3 rate; nothing found grows with time alone
    without a cap. One memo that grew without a bound was fixed and the
    largest per-tile holder halved: on the same world the heap grows half as
    fast and is 42 MB smaller. If growth stops when the land is full, heap
    peaks level off near 600–650 MB of the 900 MB limit; if the day-3 rate
    went on regardless, peaks would reach 900 MB around day 13 (day 10
    before). A full map has not been run, so which holds is still open. The
    options (a full-map run, a higher heap limit, a shorter contest, cutting
    more per-tile state) are in that record for the owner; none is chosen.
  - Decided 2026-11-23, revised 2026-11-25 (owner): raise the checkpoint
    process-memory watermark from 700 MB to 1,500 MB, and the simulation-heap
    watermark from 480 MB to 680 MB, so that checkpoints stop being put off at
    100 Houses. 1,250 MB held early in a contest but not on a world with about
    nine game hours of play (1.2–1.3 GB); in every run so far 1,500 MB would
    have put off none. Confirmed 2026-11-27 on the 69.5-hour run: process
    memory reached 1,323 MB and the heap 659 MB at a checkpoint, so neither
    watermark would have put one off
    ([`load-results/late-contest-2026-11-24.md`](load-results/late-contest-2026-11-24.md)).
- What happens when a player tries to join a map with no room for a landing.
  *Answered 2026-11-26, owner decisions 2026-11-27* ([`game-mechanics.md`](game-mechanics.md), "No landing
  site, no join"):
  - Before: a new player was sent into a running contest with no warning, and
    on a full map was landed inside a rival's reach, owning little more than
    their landing site. Nobody was ever told the map was full.
  - Now, as §6 says: the join card states the day, the extra manpower and that
    difficulty is high, with the choice to wait. With no viable landing site,
    joining is closed and the player is put on the next-Sector waitlist as
    their reserved place.
  - "Viable" keeps the rule the code already had: a site whose opening reach is
    clear of every rival's reach (confirmed 2026-11-27).
  - Decided 2026-11-27 and built: a reserved place skips the next contest's
    player cap; human redeploys need a viable site (an eliminated House waits,
    landless, and tries again at its next login; a withdrawal is refused while
    no site is free); the join screen is kept, with no automatic join; full
    sectors are greyed out in the sector list (§6), which offers funding a new
    sector when none has room, on hosted sectors too. AI Houses still land in
    the last-resort pass.
  - Built 2026-11-28 (chosen by the agent on the owner's delegation): an
    online House waiting for a landing site is landed within about a minute of
    one freeing up, and the player is told it is waiting.
- Current Apple and Google rules on purchases made on the web and used in the
  apps. *Researched 2026-11-25*
  ([`app-store-purchase-rules.md`](app-store-purchase-rules.md); Google
  figures from secondary sources, to be checked in Play Console):
  - Google Play allows a "consumption-only" app that shows what was bought on
    the web, as long as the app sells nothing, shows no prices and does not
    link to the shop.
  - Apple's guideline 3.1.3(b) lets a game unlock items bought on the web only
    if the same items are also sold as in-app purchases. Read literally, the
    iOS app needs in-app purchase for cosmetics and hosted sectors, which is
    the case §8 names ("if a store requires them"). How strictly Apple applies
    this to small games is not documented.
  - Links to the web shop: allowed on iOS in the US with no Apple fee for now
    (a court-set fee is pending), and in the EU, Japan and Brazil for 15 %
    (10 % for small businesses). Forbidden elsewhere, including the UK and
    Korea. Google charges its service fee on linked sales in the US, EEA and
    UK. Emails about the web shop are allowed everywhere.
  - Recommendation: Android ships as consumption-only with no prices or links;
    iOS needs an owner decision (add in-app purchase, or ship without it and
    risk rejection); no link-outs at launch. Owner decisions listed in the
    research note.

## 12. Keeping this document true

Change this document in the same branch as any decision that changes it, and
date the change. If a proposal conflicts with it, either the proposal changes
or the owner changes this document first.
