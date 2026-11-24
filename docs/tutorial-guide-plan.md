# Tutorial guide

Status: active; phases 1–3 implemented, phase 4 (telemetry and playtests) open
Owner: client maintainers
Last verified: 2026-11-17

## Why

Players kept asking for a tutorial after the 8-slide intro guide was removed
(changelog "No more intro slides", 2026-10-12). The slides covered the map on
first login. The New empire checklist that stayed only covers the first
~10 minutes (town and four food slots). Nothing taught manpower, Manifests,
building, mustering or the "every visit is a turn" rhythm (`core-loop.md` §0).

## Research basis

- **Teach by doing.** Each step is a real action in the live game. It completes
  when the game sees the player do it, not on a "Next" click.
- **Teach just in time.** A step appears when it becomes relevant. A step that
  isn't possible yet waits with a one-line note instead of asking for the
  impossible.
- **Tutorials pay off in complex games.** Andersen et al., CHI 2012, studied
  over 45,000 players and found tutorials raised play time by up to 29% in the
  most complex game and did little in simple ones. Border Empires is complex,
  so a tutorial is worth building, but it should stay light.
- **Teach decisions, not buttons.** Every step carries one line of *why*.
- **Never take control away.** No modal, no scrim, no frozen input. Every step
  can be skipped, the card can be minimised, and the guide can be hidden.
- **Keep text short.** About ten words to do and one line of why; point at
  things instead of describing them.
- **Measure it** (phase 4). Paradox found their Crusader Kings III tutorial
  strongly affected retention.

## Design

**Who gets it.** Every player, at the start of every season (owner decision
after the 2026-11 playtest, where an account from an earlier season went
straight to the map with no guide). Progress is per season: the gateway
stores `guideSeasonId` with `guideStatus`/`guideSteps`, and on INIT the client
starts a fresh guide whenever the stored progress belongs to another season,
or there is none. Progress saved before it carried a season is adopted as the
current season's (and stamped), so a player who already finished or skipped
the guide this season isn't sent through it again. **Skip guide** ends it for
the rest of the season. With no season known (no current season on INIT) the
old rule applies: only a new account (`profileNeedsSetup`, or a guest
session) is enrolled. Each guest's local storage is scoped by its Firebase
uid (`guest:<uid>`, `debugAuthIdentityKeyForEmail`), not one shared
`anonymous` key, so a new guest doesn't inherit an earlier guest's progress on
the same browser.

**What it looks like.** One small card in the bottom-left corner: the same slot
the checklist bubble uses, measured to clear the Center/AFC button. When that
spot would cover the step's ringed tiles (projected by the active renderer,
2D or true-3D) or a notification (salvage and refinery toasts on the map, an
opened discovery-tip card, the HUD v2 tracker and right-hand column), the card moves
to the mirrored spot on the right edge (`tutorial-guide-placement.ts`). It only
moves when its current spot covers something and the other covers less. The
card shows:

- the chapter's name (no "n/10" chapter number: steps complete out of order and
  waiting chapters are passed over, so the number jumped and read as skipped
  steps);
- what to do;
- one line of why;
- "Later: …" naming earlier chapters that are still waiting (AFC upgrade while
  a Manifest docks, Contest and Diplomacy before a first contact);
- a progress bar with a steps-done count;
- **Show me** (centres the camera on the step's map target; repeated presses
  cycle through the targets; when the card covers the screen centre, as on a
  phone, it folds to its launcher so the target isn't under it), **Skip** (this step)
  and, on the last step, **Finish**;
- a compact **Skip guide** button in the same action row (no new HUD element,
  and the card keeps its size on a 375px phone).

**Finish** replaces the card with a short "Guide complete" card that closes
itself after a few seconds. Its bar is always full: Finish is only offered once
every step left waits on a first contact, and those steps are handed to the
First Contact tip (the card says so). A "Guide complete" over a 14/16 bar
contradicted itself. There is no in-game reward for finishing.

The card minimises to a round launcher with a remaining-steps badge. The root
element ignores pointer events; only the card and the launcher take clicks.

- **Map targets** go into `state.onboardingHighlightTiles`, which both renderers
  already draw as pulsing rings: 2D in
  `client-onboarding-checklist-highlight.ts`, true-3D in
  `client-map-3d-onboarding-checklist-highlight.ts`. Every map highlight the
  guide shows is therefore in both renderers.
- **HUD-button targets** get a pulsing outline element drawn over the button
  (`pointer-events: none`), which is renderer-independent DOM. The selectors
  cover the legacy top strip, the mobile nav and the new desktop HUD's
  `[data-hud-v2-open]` buttons. Under the new HUD, its Manifest screen counts
  as opening Manifests and the Activity step names the Chronicle. The card
  shares the checklist bubble's `.onb-root` class, so the new HUD's rules lift
  it above the bottom-left minimap and hide it behind the town, battle,
  Chronicle, AFC, Ranks, Towns and Profile screens. It stays visible where its
  steps send the player: while a side panel (Manpower, Manifests; not
  Settings, whose modal dim shares that layer) or a HUD v2 screen is open it
  is lifted to z-index 48, and on the HUD v2 Manifest and Diplomacy screens it
  overrides their `.onb-root` hiding (`syncGuideCardLayer`).
- **The recommended Manifest** is marked in both Manifest trees (HUD v2's
  `[data-v2-manifest-select]` nodes and the legacy `[data-tech-card]` cards)
  with a pulsing ring and a "Guide pick" badge while a Manifest step is
  current (`tutorial-guide-manifest-pick.ts`). Both trees rebuild their
  markup, so a MutationObserver re-marks them before paint while the pick shows.
- **Off-screen targets** get no edge arrow. "Show me" pans the camera to them
  instead.

**When it hides.** The guide is hidden while a dialog covers the map, and while
the AFC landing is about to play (its AFC on screen) or playing
(`isTutorialGuideDeferred`). Unlike the other onboarding UI it doesn't wait for
a landing whose AFC is off screen: that can wait up to 5 minutes for the player
to look at it, and in the playtest the guide only appeared minutes in, at step
3, with the pan and zoom steps ticked while it was hidden.

**Discovery tips while it runs.** Discovery tips are "!" pins on the map at
the tile they are about, and a tip's card opens only when its pin is tapped
(`client-map-tip-pins/`, owner 2026-11-21: cards that opened on their own got in
the way of play). While the card is expanded on a step the player can do now,
tips stay unpinned so there aren't two pieces of guidance on screen. `TOWN` and
`FOOD`, which the find steps teach, are retired as if dismissed. Urgent feedback
(`OUT_OF_REACH_EXPAND`, `ENEMY_EMPIRE`, `FIRST_MUSTER`, `FIRST_DOCK`) is never
held. Every other tip waits in the queue and is pinned once the card is
minimised, the guide is only waiting on a first contact, or it is finished or
hidden (`client-onboarding-ui-overlays.ts`).

**Persistence.** `guideStatus` (`active` | `done` | `dismissed`) and
`guideSteps` (completed step ids, at most 64) are stored on the gateway's
player profile through `SET_HINT_STATE`, and mirrored in localStorage for
instant reads. Completion is sticky: a step stays done once done. Settings ›
Hints › **Restart guide** (shown only to enrolled accounts) resets it.

## Chapters

The game requires a commissioned Manifest before any building other than a
Relay Beacon, so the Manifest chapter comes before Build, and the Build step
is unavailable until the recommended Manifest exists.

| # | Chapter | Step (completes when…) | Target |
|---|---|---|---|
| 1 | Explore | drag the map; zoom (player input, via `client-map-input.ts`, shared by both renderers); then **Explore**: the scout drone is in the air (`scoutDroneFlight` with `landsAt` ahead). The drone is free and reports towns, food and rivals, so it is the guide's way to find what the foothold asks for. Explore is skipped for a House with no AFC (`afcRecovery.requiredSince`, no drone to send), counts as done when nothing within 16 tiles of home is unexplored, and, added after launch, counts as done for saved progress past it (`doneIfLaterStepDone`). There is no separate "tap a tile" step: the foothold steps teach tapping with a real objective ("Tap the marked town and …"). A bare tap had no goal: a tap only selects (claims wait for the tile's Expand To or a second tap) | an unexplored tile: the nearest unexplored tile to home, pushed 8 tiles further along the same line (at most 16 from home, so the first flights report back within a visit) while that tile is also unexplored (`tutorial-guide-explore-target.ts`), so tapping it opens the Explore menu |
| 2 | A foothold | two of the checklist goals (`onboardingChecklistState`): take a town, then take 4 food slots (judged from live tiles until the guide's own foothold steps are saved, then a constant DONE so later chapters skip the reach scan; never from the checklist's saved completion flag, which is account-wide and never resets). There are no separate "find" steps: they could only wait, with no instruction, when nothing was in sight | see below |
| 3 | Your reach | owns (or is building) a Relay Beacon. A beacon needs no Manifest, so it comes before the Manifest chapter; one built during the foothold completes it. Added after launch, so it also counts as done for a player whose saved progress already has a later step (`doneIfLaterStepDone`). It completes only on a beacon. Before the player holds any town (the foothold's town step was skipped), a town they can take (Garrison, Expand To, or a claim underway) is pointed at first, never an Explore; once a town is held it always asks for the beacon | the town; otherwise the tile where a beacon adds the most new reach (`bestRelayBeaconSites`, computed only while this step asks; never a town or dock the player hasn't garrisoned); its build menu badges the beacon Recommended |
| 4 | Manpower | the manpower panel is open | manpower gauge |
| 5 | Manifests | the Manifest panel is open; a Manifest commissioned (`techIds`, minus any Manifest a Waystation granted for free: the activated waystation tile's `grantedTechId`). The step recommends the **Industrial Tooling Module** (`trade`): tier 1, 10 Coin, and it unlocks the Manufactory. A free Manifest raises the next price (10 to 40 Coin), so the commission step waits while the player's Coin is below the catalog price, showing the price; Finish isn't offered during that wait (`waitBlocksFinish`) | Manifest button |
| 6 | Build | owns a structure other than a Relay Beacon. Available once the Industrial Tooling Module is commissioned. It asks for a **Manufactory**, which goes on a garrisoned town (never the spawn settlement) or its support ring and uses one food slot. Until the module docks on an active AFC (about a minute; the tile menu hides the Manufactory until then), the step says it is docking. Without the module, the step waits with a pointer to that Manifest. The Manifest step itself completes only on that Manifest, or once anything has been built. Without any garrisoned town (the town step was skipped), it asks for a town first, with the town step's wording and target | the player's garrisoned towns; without one, the town to take |
| 7 | Contest | owns a muster flag. Available once mustering unlocks on first contact with Planetary Defense or a rival House; until then the note says to Explore to find one | own garrisoned tiles touching another owner |
| 8 | Diplomacy | (waiting note: Explore to find a rival House) after a rival House's land has been seen (Planetary Defense doesn't count, `isMeetablePlayerId`), the Allies panel, mobile Social panel or HUD v2 Diplomacy screen is open, or a truce or alliance is offered or in force. Opening the panel before meeting anyone doesn't count | Allies / Social / Diplomacy button |
| 9 | Your turn | the Activity dashboard (or Chronicle) is open; then **Finish** on "That's the basics. Your manpower refills every 4 hours." (at or over the manpower cap, where no batch is paid: "That's the basics. Spend your N manpower."). The why line leads with Explore for towns | Activity button |

**Finish rule:** Finish appears once every other step left is waiting (no
Planetary Defense or rival House met yet), so a player with no neighbours can
still finish. Pressing Finish ends the guide for good. The existing "First
Contact!" discovery tip teaches muster flags later.

**Taking the town and the food** (`tutorial-guide-foothold-targets.ts`): reach
auto-claims every neutral tile inside it as the player's FRONTIER, so the
wording follows the target's state. Towns and food tiles (grain and fish) use
the same rule.

- Food only counts inside reach: Garrison is reach-gated, so a grain or fish
  tile outside reach (even the player's own frontier from Expand To) shows
  "Outside your reach" and can never complete the step. With no food in reach,
  the step asks for a Relay Beacon. Towns ignore reach (`settleIgnoresReach`).
- A target that is already the player's frontier: "…, then Garrison". Its tile
  menu offers Garrison, not Expand To.
- Otherwise, a neutral target the player has seen, in vision or remembered
  under fog (a scout drone's reveal drops back to fog behind it, and fogged
  tiles offer Expand To too), in practice one outside reach: "…, then Expand To".
  Expand To walks the border across through a waypoint chain.
- Otherwise, with grain or fish known outside reach within 12 tiles of home
  (Manhattan): "Food is outside your reach: build a Relay Beacon". Exploring more
  can't bring it into reach; food further out is no reason to stop exploring.
- Otherwise, no town known at all and the server names one (the town step
  only): "A town is this way: tap the mark, then Explore", ringed at the
  nearest unowned town (`guideTownLead` on PLAYER_UPDATE, computed by
  `apps/simulation/src/guide-town-lead/` from the neutral-town index, sent while
  the player holds no town beyond their landing settlement), for as many
  flights as it takes. Tapping that ringed tile plans the whole way there, one
  stop per leg along the line, as many as the charges allow
  (`client-scout-drone-lead-route.ts`): a single far stop is pulled back to the
  leg range every flight. Added after Playtest Run 4, where a newcomer flew
  five flights in random directions over three mornings, built four beacons
  and quit.
- Otherwise, nothing known: "tap the marked dark ground, then Explore"
  while the drone can launch (ringed at the Explore target), or "Your drone
  is flying: wait for its report" while it flies. Only for the first 3
  flights of the session: a target the drone can't reach (a rival border,
  open sea) would otherwise be asked for again and again.
- Otherwise (no AFC, or nothing unexplored near home): "build a Relay Beacon:
  tap the marked tile, then Build" when the checklist has a recommended beacon
  site (only that site is ringed). Without a site, the step says "…at the
  edge of your land".
- While a claim or garrison on a target is already underway
  (`optimisticPending`, for example right after Expand To), the step says so
  instead of asking for a Garrison that is already queued.

A neutral town counts as an Expand To target only with an overland route from
the player's land (`tutorial-guide-town-route.ts`, a bounded client-only search
mirroring the Expand To planner: LAND steps, unexplored ground passable, dock
pairs). A town across water the player has seen has no Expand To in its menu,
so the step asks for the scout drone instead ("No town you can reach: …"):
crossing water is what the drone is for. Only the nearest 8 towns are checked.

Known limits: food targets don't get the route check, and allied or truce
borders are not modelled in the town route. A fogged target shows its owner as
last seen, so a town a rival took since the drone flew over can still be
suggested until the player sees it again.

The ringed tiles are the nearest matching targets (up to three), or the beacon
site. Both food steps show "Look for" with the game's own grain and fish
resource icons, so the player knows what to spot on the map.

If the only steps left are waiting (for example no contact yet), the card shows
the first waiting step's note.

There are no rewards for steps, in line with the opening contract's "no new
payouts".

## Code map

| File | Role |
|---|---|
| `packages/client/src/client-tutorial-guide/tutorial-guide-steps.ts` | Chapters, steps and `evaluateGuide` (pure) |
| `…/tutorial-guide-input.ts` | Builds the step input from `ClientState`; tile scans cached per tiles revision |
| `…/tutorial-guide-input-signals.ts` | Pan, zoom and tap signals set by `client-map-input.ts` |
| `…/tutorial-guide.ts` | Per-frame controller: persists completions, renders the card and outline, returns map highlights |
| `…/tutorial-guide-card.ts`, `…/tutorial-guide-anchor.ts` | Card DOM and its layer over panels; HUD-button outline |
| `…/tutorial-guide-manifest-pick.ts` | "Guide pick" mark on the recommended Manifest in both trees |
| `…/tutorial-guide-storage.ts` | Enrollment, progress, server sync |
| `…/tutorial-guide-placement.ts` | Moves the card off its ringed tiles and notifications |
| `…/tutorial-guide-town-route.ts` | Overland route check for town targets |
| `…/tutorial-guide-foothold-targets.ts` | Garrison / Expand To / Explore / beacon choice for the town and food steps |
| `…/tutorial-guide-explore-target.ts` | Scout drone status and the unexplored tile the Explore steps ring |
| `client-onboarding-ui-gate/client-onboarding-ui-overlays.ts` | Chooses guide versus checklist; per-frame tick |
| `apps/realtime-gateway/src/gateway-app/handle-set-hint-state-message.ts`, `sqlite-player-profile-store.ts` | Server persistence (`guide_status`, `guide_steps`, `guide_season_id` columns) |

## Phases

1. **Done.** Step engine and card, with the checklist ported as the foothold
   chapter.
2. **Done.** HUD-button outlines and "Show me". Map rings come from the
   existing highlight layer, in both renderers.
3. **Done.** Chapters 3–7 and server-persisted progress.
4. **Open.**
   - Per-step analytics (shown, completed, skipped) on the admin insights
     funnel.
   - Fresh-account playtests on desktop and mobile
     ([agent gameplay testing](agents/topics/agent-gameplay-testing.md)).
   - Tune step copy and order where players drop off.

## Lore

Lore reviewed; no canon change. The scout drone is already canon (world
bible §12, "AFCs as industrial seeds": the Sentinel-pattern sensor drone). The
guide's copy uses existing canon terms: a
Manifest is *commissioned*, barbarians are *Planetary Defense*, and empires
are *Houses* (see [the world bible](lore/galactic-lore.md) §11–12).
