# Choosing and switching Sector Contests from a galaxy map — design for approval

Status: accepted 2026-11-28, being built
Owner: Benjamin Waye (every question in [§10](#10-questions-for-the-owner) is his to answer)
Last verified: 2026-11-28, against `develop` at `5cd2616e6` and PR 3055 (branch `agent/wait-contest-map-stall`)
Replaces: none. Builds on [`hosted-sectors-plan.md`](hosted-sectors-plan.md) and the join card and waiting screen in [`gdd.md`](gdd.md) §6.

**Owner answers, 2026-11-28:** the plan is accepted as recommended (Q1–Q7).
With only one Sector Contest running the player goes straight into it, with
no map. Hosted sectors are not a separate kind of campaign in the fiction
(Q8, §8).

## 1. What the owner asked for

When several Sector Contests are running, a player choosing where to play
picks from a map of the galaxy, sees each sector's state, lands there, and, if
they picked the wrong one, jumps out and picks another. The same map is how
they switch sectors once they are in the game.

What this plan does not reopen (all in [`gdd.md`](gdd.md) §6 and §8):

- One free public sector runs at all times; every new player starts there and
  never sees a payment screen first.
- The join screen states the contest day, the landing manpower and that
  difficulty is high, and is always shown, never skipped (decided 2026-11-27).
- A full sector (every House place taken, or no viable landing site) is greyed
  out; if none has room, or the player chose to wait, they can fund a new one.
- Waiting does not reserve a place. Hosted sectors are web only, private
  (unlisted, members only) and closed to guests.
- Money never buys power.

## 2. What exists today

Checked in the code. "PR 3055" means the waiting-screen branch, not yet on
`develop` when this was written.

| Area | Today | Where |
|---|---|---|
| Sector list | Rows for the public sector (main gateway `GET /sector/board`), the hosted sector this page plays on (its own board) and the player's other open hosted sectors (hosting service, no board). A row shows Houses `n of m` and a full reason. No day, no standings. | `packages/client/src/client-sector-list/` |
| `/sector/board` | `seasonId`, `status`, human `houses`, `maxHouses`, `full`, `noLandingSite`, `waitingCount`. Nothing else. | `apps/realtime-gateway/src/http-routes/register-sector-board-route.ts` |
| Current Standings | Only over the socket: the leaderboard every INIT and GLOBAL_STATUS_UPDATE carries, drawn by `client-standings-html.ts` (PR 3055). There is **no HTTP route** for a running contest's standings, so a page cannot show another server's. | PR 3055 |
| Join card | Day, landing manpower, high difficulty; **Land now** and **Wait for the next contest** (**Not now** on a hosted sector); the sector list below. | `client-join-season-overlay.ts` |
| Waiting screen | No close button; email line, **Land now instead**, tabs **Sectors** and **Standings**. | `client-join-season-waiting/` (PR 3055) |
| Changing server | **Enter** fetches a short-lived ticket from the hosting service, puts it in `sessionStorage` and reloads the page with `?sector=<id>`; leaving reloads without it. The socket is created at page load, so there is no switch without a reload. | `client-hosted-sectors/client-hosted-sector-session.ts`, `client-hosted-sectors-panel.ts` |
| Feature flag | Hosted sectors appear only with `VITE_HOSTED_SECTORS=1`, never in the apps. | `hostedSectorsEnabled` |
| Map size | Compiled into the client. A Small hosted sector needs its own client build under its own path ([`hosted-sectors-plan.md`](hosted-sectors-plan.md) §8), so moving between sizes is a full navigation, not just a new socket. | `WORLD_WIDTH`, `WORLD_HEIGHT` |
| Galaxy maps | **Space View** (only for accounts holding a Planet): a 2D strategic map with the Core at the centre and won Sectors placed at stable positions hashed from their `seasonId`, plus a true-3D solar-system view. The **galaxy overlay** (`client-galaxy-view/`) is a list of the account's Planets, Outposts and Stipends, not a map. Neither shows running contests. | `client-space-view/client-strategic-map/`, `client-space-view/client-space-map-3d/` |
| Sector numbers | "Sector 003" names a *won* Sector, derived on every read. Running contests are deliberately unnumbered so the two never clash. | `galaxy-sector-numbering/`, [`game-mechanics.md`](game-mechanics.md) "Season capacity" |
| Leaving a contest | No way exists. A House stays on its map until the contest ends; `WITHDRAW_AND_REDEPLOY` moves it within the same contest only. Each server is separate, so one account can already hold a House in the public sector and in a hosted one at once. | — |

## 3. The Sector Map

### 3.1 One screen

A full-screen **Sector Map**: the frontier as the strategic map already draws
it, the Core in the centre, and each running Sector Contest the player can
play in as a frontier world with a marker. Tapping a world opens its **sector
card** (§4). It is a new screen, not the Space View, because most players
own no Planet and must still use it.

- **2D first.** It reuses the strategic map's layout and gesture code
  (`client-strategic-map-layout.ts`, `-gestures.ts`), which already places a
  world at a stable spot from its id and works on a phone. A handful of
  markers do not need a 3D scene, and the map may be the first thing a new
  player sees. *New:* the renderer for contest markers and the screen around
  it.
- **Phone first.** On a phone the card slides up from the bottom over the
  map; on desktop it sits beside the map. With few sectors the map is mostly
  empty space, so it zooms to fit the markers.
- **Not a canvas overlay on the game map.** The AGENTS.md 2D/true-3D rule is
  about overlays on the game map. The Sector Map is its own screen; §7 phase
  4 adds the same markers to Space View's 3D view for Dukes.

### 3.2 What it shows

| Marker | Shown when | Notes |
|---|---|---|
| Public Sector Contest | Always, while active or in its countdown | Gold. Labelled "Public Sector Contest", never with a Sector number. |
| Each hosted sector the player belongs to | Web with the flag on, while open, and for the 3 days an ended one stays up (greyed, "Ended") | Title as the host named it. Private sectors the player is not a member of are never shown ([`hosted-sectors-plan.md`](hosted-sectors-plan.md) Q9). |
| **Fund a new sector** | Web with the flag on; prominent when every listed sector is full or the player is waiting, smaller otherwise (same rule as PR 3055) | An unclaimed frontier world with a dashed outline. Opens the existing hosting form. |
| "You are here" | On the sector this page is connected to | A ring on that world. |
| Your House | On every sector where the account has a House | A small banner in the House colour. |
| Won Sectors (Duke worlds) | Optional, faint, as background | Gives the map a sense of history. See Q7. |

A sector that is full is drawn dimmed with its reason ("Full: no landing
site left" / "Full: every House place is taken"), matching the list today.

### 3.3 Who sees it

| Player | What they get |
|---|---|
| Any player, only one sector available (public only: guests, the apps, flag off, or no hosted sectors) | **No map.** The join card and waiting screen stay exactly as PR 3055 ships them. A map with one world adds a tap and nothing to choose. |
| Signed-in web player with two or more sectors available | The Sector Map in place of the sector list (§5). |
| Guest | Public sector only (guests cannot join hosted sectors, Q8), so no map. |
| The apps | Public sector only until native hosted support (Q15), so no map. When that ships, the map comes with it; funding stays off in the apps. |
| Duke (holds a Planet) | As above, plus, in phase 4, running contests drawn in Space View. |

Decided (Q1): show the map whenever the player can choose between two or
more sectors, and never otherwise. With one, the player goes straight into
that sector as today.

## 4. Selecting a sector, and landing

### 4.1 The sector card

The sector card **is the join card**, moved onto the map: the same honest
warning, so the GDD rule "the join screen is always shown" still holds.

- Title, and "You are here" or "Your House is here".
- **Day N** of the contest, and Houses `n of m`.
- **Landing manpower** (2,000 plus the late-join catch-up) and the
  high-difficulty line, as the join card says them today.
- **Current Standings**, top 5, with "See all" opening the full ledger PR
  3055 already draws.
- One button: **Land here**, **Return** (the player has a House there),
  **Full** (disabled), or **Ended** (greyed, opens the final standings).

*New system:* everything but the House count needs data the client cannot
get for another server today. Proposal: extend `GET /sector/board` with
`day`, `landingManpowerReserve` and `standings` (top 5: House name, colour,
crest, score; no player ids), cached for a minute on the gateway like the
landing-site probe. It is already public, so this adds no new exposure for
the public sector; for hosted sectors it matches Q9 ("standings are not
secret from someone who has the address"). The card for the sector the page
is on keeps using the live socket data.

*New:* the client needs each hosted sector's server address to read its
board before entering. Today the hosting service gives an address only with
a ticket, at Enter. Proposal: the "My sectors" list includes each open
sector's public board URL (no ticket needed to read a board).

### 4.2 Land here without a second click

Two cases.

1. **The sector this page is on.** Land here sends the existing JoinSeason.
   Nothing new.
2. **Another sector.** The page must reload onto that server (§2), and the
   join card on arrival would ask again. To avoid that second click:
   - The map writes a **land intent** to `sessionStorage` next to the hosted
     session: `{ target, seasonId, createdAt }`, valid for two minutes, then
     reloads (public: no `?sector=`; hosted: fetch the ticket first, as Enter
     does now; Small map: navigate to that size's build).
   - On boot the page reads and deletes the intent. If its target is this
     server, its `seasonId` is the running contest and the account has no
     House here, it sends JoinSeason at once and shows "Landing…" in place
     of the join card.
   - Anything else (expired, contest changed, refused as full or with no
     landing site, a reserved-place retry that fails) falls back to the
     normal join card with the reason, so the player is never left on fog.
   - The player read the warning on the sector card, so the GDD's "always
     shown" is met by the card, not skipped. This needs the owner's
     confirmation (Q2).

*New:* the land intent and its boot check. No server change: JoinSeason,
the reserved-place retry and the landing-site check all work as they do now.

A reload takes a few seconds and the target server's INIT payload is the
real cost. Switching without a reload (a socket swap) is not worth it: a
different map size needs a different build anyway, and the whole client
state would have to be reset by hand.

## 5. How it replaces the join card and waiting screen

When the map is shown (§3.3), the order of screens becomes:

1. A player with no House here opens the game → the **Sector Map**, centred
   on this page's sector with its card open. One tap lands; a tap elsewhere on
   the map picks another sector. The fog is hidden behind the map, so the
   "don't close to an all-fog map" rule from PR 3055 holds by construction.
2. **Wait for the next contest** stays on the card of the public sector. It
   switches the card to the waiting content (email line, Land now instead,
   Standings) without leaving the map. The waiting screen's **Sectors** tab
   is no longer needed: the map is the list.
3. No landing site anywhere → every world dimmed, the public card shows the
   reserved-place message as now, and Fund a new sector is prominent.

When the map is not shown, nothing changes. The join card and waiting screen
stay one component with two hosts (overlay or map card), so there is one
copy of the warning text and of the land logic.

## 6. Switching sector in game

### 6.1 Entry point

- One HUD entry, **Sectors**, in the settings hub where "My sectors" is now
  (it replaces that list). Shown only when §3.3 shows the map.
- On the map, the current sector is marked; tapping another opens its card
  with **Land here** or **Return**.
- Dukes also reach it from Space View in phase 4.

No other buttons are added to the game HUD: switching is rare, and HUD space
is for the contest (GDD §3).

### 6.2 What happens to the empire left behind

Recommendation for launch: **the House stays.** Leaving the page does nothing
to it, as closing the browser does nothing today. Its borders, Palisades and
queued work carry on; GDD §5 says time offline is not punished, and §4
"defending is cheaper than attacking" is what protects it. A House in another
sector is just a second, independent game, which the servers already allow.

What that leaves open (each needs the owner, §10):

- **Several Houses at once** (Q3). Already possible across servers. If the
  owner wants one House per account at a time, that is a *new rule* and needs
  a cross-server check in the hosting service at JoinSeason.
- **"I picked the wrong one"** (Q4). If the player just leaves, their House
  keeps a human place in a sector capped at 50 (or 40/12 hosted), and in the
  public sector it finishes with a low placement that counts toward the
  rating. Option: **Leave this sector** on the card of a sector where the
  player has a House, available only in the first 24 hours after landing.
  It removes the House, frees its place and does not count the contest
  toward the rating. *New system and rule change:* no way to remove a House
  exists (§2); its land would have to go somewhere (back to neutral is the
  simplest; to Insurgents is a game-balance question), and the 24-hour
  window would need to block abuse (land, scout, leave, land again). Not
  recommended for the first version; a player who wants out just plays
  elsewhere.
- **Reserved place and waitlist.** Unchanged: a reserved place is per
  contest and is used only when the player lands there.

## 7. Phasing

Hosted sectors are not launched, and the public sector is the only one most
players will ever have. Each phase stays invisible until a player can choose
between two sectors.

| Phase | What | Visible to |
|---|---|---|
| 0 | `/sector/board` gains `day`, `landingManpowerReserve`, top-5 `standings`; "My sectors" carries each sector's board URL. No client change. | Nobody |
| 1 | Sector Map screen and sector card (one shared join component), behind `VITE_HOSTED_SECTORS`. Replaces the sector list and the waiting screen's Sectors tab only when §3.3 shows the map. | Staging builds with the flag |
| 2 | Land intent across servers (§4.2), including Small-map builds. In-game **Sectors** entry replaces "My sectors". | Same |
| 3 | Ships when hosted sectors launch, with that flag. | Web players with a hosted sector |
| 4 | Running contests drawn in Space View (2D strategic map and true-3D), so a Duke sees them beside their worlds. | Dukes |
| Later | Leave this sector (Q4), a second free sector (Q6), native apps. | Needs owner decisions |

Each phase is a separate PR to `develop` with a changelog entry when it is
visible, and regression tests for the board fields and the land intent's
fallbacks.

## 8. Lore

From [`lore/galactic-lore.md`](lore/galactic-lore.md) §2: the Court opens a
Sector, a frontier world, and lands rival Houses on it; Houses turned away
wait for the next one; the winner holds the world and becomes a Duke. The
map fits that directly: running contests are frontier worlds the Court has
opened, placed beyond the Core like the won Sectors Space View already draws.
When a contest is won, its world becomes a Sector with a number in the same
place (positions are hashed from the `seasonId`).

**Decided 2026-11-28 (owner):** there is one kind of Sector campaign. Most
are opened because Houses pay the cost of the expedition, which is how they
force the Court to open more contests than it would on its own; the free
public contest is simply the one the Court opens unasked. The map draws them
all alike. Recorded in the world bible's §2, "Sector campaigns".

Still open, and only if the owner builds the matching rule:

- **A House on two worlds at once.** The Mothership stays in orbit for a
  whole contest (§11 "Landings"). A House in two contests needs two
  expeditions; the simplest reading is that a House can send more than one.
- **Leaving a Sector.** If Q4 is built, the House's expedition is recalled
  and its ground is abandoned.

## 9. New systems and rule changes, labelled

| Item | Kind |
|---|---|
| Sector Map screen and contest markers | New client system |
| `/sector/board` day, landing manpower and standings | New server fields |
| Board URL in "My sectors" | New hosting-service field |
| Land intent across a reload | New client system |
| One House per account at a time (only if Q3 says so) | Rule change and new cross-server check |
| Leave this sector (only if Q4 says so) | Rule change and new simulation command |
| Sector card counts as the join screen (Q2) | Interpretation of a 2026-11-27 decision |
| Paid campaigns as the ordinary way Sectors open | Lore, accepted 2026-11-28 |

## 10. Questions for the owner

All answered 2026-11-28: Q1–Q7 as recommended, Q8 as stated.

| # | Question | Recommendation |
|---|---|---|
| Q1 | Show the map only when a player can choose between two or more sectors? | Yes. With one sector, keep the join card and waiting screen as PR 3055 ships them. |
| Q2 | Does the sector card on the map count as "the join screen is always shown", so landing on another server needs no second click? | Yes: it carries the same day, landing manpower and difficulty warning. |
| Q3 | May one account hold Houses in several sectors at once? | Yes, as the servers allow today. A one-House rule needs a new cross-server check and blocks friends playing a hosted sector alongside the public one. |
| Q4 | Build **Leave this sector** (remove the House in its first 24 hours, no rating hit)? | Not for the first version. Revisit if players complain about a wrong pick or abandoned Houses fill the public cap. |
| Q5 | Is showing the public and hosted sectors' top-5 standings to anyone who opens the map acceptable? | Yes. The public board is already public, and Q9 says hosted standings are not secret. |
| Q6 | If the owner pays for a second free sector, how is it listed? | Through the hosting service as a "public" sector row, so the map needs no special case. Decide when it happens. |
| Q7 | Draw won Sectors faintly behind the running contests? | Yes, as background only, no interaction; it shows new players there is a galaxy to win. |
| Q8 | Lore for hosted sectors? | **Decided 2026-11-28:** not a separate kind. Paying is how Houses force the Court to open more contests. |
