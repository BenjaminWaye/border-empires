# Tutorial guide for new accounts

Status: active; phases 1–3 implemented, phase 4 (telemetry and playtests) open
Owner: client maintainers
Last verified: 2026-11-02

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

**Who gets it.** New accounts only. The gateway marks an account that has not
finished its first profile setup with `profileNeedsSetup` on INIT. An account
with no stored guide status that is in that state, and has not completed the
checklist, is enrolled once (`guideStatus: "active"`). Guest ("Play now")
sessions are enrolled too: the gateway always reports `profileNeedsSetup:
false` for guests, so the client treats a guest session as new. Each guest's
local storage is scoped by its Firebase uid (`guest:<uid>`,
`debugAuthIdentityKeyForEmail`), not one shared `anonymous` key, so a new
guest doesn't inherit an earlier guest's progress on the same browser. Every older
account has no status and a complete profile, so it keeps the New empire
checklist unchanged.

**What it looks like.** One small card in the bottom-left corner: the same slot
the checklist bubble uses, measured to clear the Center/AFC button. The card
shows:

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
  phone, it folds to its launcher so the target isn't under it), **Skip** and,
  on the last step, **Finish**;
- a "Hide guide" link.

**Finish** replaces the card with a short "Guide complete" card (steps done,
and a note when Contest and Diplomacy were never reached) that closes itself
after a few seconds. There is no in-game reward for finishing.

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

**When it hides.** The guide uses the existing onboarding UI gate: it is hidden
while a dialog covers the map or the AFC landing is still pending or playing,
then returns.

**Discovery tips while it runs.** While the card is expanded on a step the
player can do now, the discovery-tip toast stays quiet so there aren't two
pieces of guidance on screen. `TOWN` and `FOOD`, which the find steps teach,
are retired as if dismissed. Urgent feedback (`OUT_OF_REACH_EXPAND`,
`ENEMY_EMPIRE`, `FIRST_MUSTER`) is never held. Every other tip waits in the
queue and shows once the card is minimised, the guide is only waiting on a
first contact, or it is finished or hidden (`client-onboarding-ui-overlays.ts`).

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
| 1 | Look around | drag the map; zoom (player input, via `client-map-input.ts`, shared by both renderers). There is no separate "tap a tile" step: the foothold steps teach tapping with a real objective ("Tap the marked town and …"). A bare tap had no goal, and on the new desktop HUD a tap on neutral land next to your border claims it | — |
| 2 | A foothold | two of the checklist goals (`onboardingChecklistState`): take a town, then take 4 food slots (judged from live tiles until the guide's own foothold steps are saved, then a constant DONE so later chapters skip the reach scan; never from the checklist's saved completion flag, which is account-wide and never resets). There are no separate "find" steps: they could only wait, with no instruction, when nothing was in sight | see below |
| 3 | Your reach | owns (or is building) a Relay Beacon. A beacon needs no Manifest, so it comes before the Manifest chapter; one built during the foothold completes it. Added after launch, so it also counts as done for a player whose saved progress already has a later step (`doneIfLaterStepDone`). It completes only on a beacon. Before the player holds any town (the foothold's town step was skipped), a town they can take (Garrison, Expand To, or a claim underway) is pointed at first; once a town is held it always asks for the beacon | the town; otherwise the tile where a beacon adds the most new reach (`bestRelayBeaconSites`, computed only while this step asks; never a town or dock the player hasn't garrisoned); its build menu badges the beacon Recommended |
| 4 | Manpower | the manpower panel is open | manpower gauge |
| 5 | Manifests | the Manifest panel is open; a Manifest commissioned (`techIds`, minus any Manifest a Waystation granted for free: the activated waystation tile's `grantedTechId`). The step recommends the **Industrial Tooling Module** (`trade`): tier 1, 10 Coin, and it unlocks the Manufactory. A free Manifest raises the next price (10 to 40 Coin), so the commission step waits while the player's Coin is below the catalog price, showing the price; Finish isn't offered during that wait (`waitBlocksFinish`) | Manifest button |
| 6 | Build | owns a structure other than a Relay Beacon. Available once the Industrial Tooling Module is commissioned. It asks for a **Manufactory**, which goes on a garrisoned town (never the spawn settlement) or its support ring and uses one food slot. Until the module docks on an active AFC (about a minute; the tile menu hides the Manufactory until then), the step says it is docking. Without the module, the step waits with a pointer to that Manifest. The Manifest step itself completes only on that Manifest, or once anything has been built. Without any garrisoned town (the town step was skipped), it asks for a town first, with the town step's wording and target | the player's garrisoned towns; without one, the town to take |
| 7 | Contest | owns a muster flag. Available once mustering unlocks on first contact with Planetary Defense or a rival House | own garrisoned tiles touching another owner |
| 8 | Diplomacy | after a rival House's land has been seen (Planetary Defense doesn't count, `isMeetablePlayerId`), the Allies panel, mobile Social panel or HUD v2 Diplomacy screen is open, or a truce or alliance is offered or in force. Opening the panel before meeting anyone doesn't count | Allies / Social / Diplomacy button |
| 9 | Your turn | the Activity dashboard (or Chronicle) is open; then **Finish** on "That's the basics. Your manpower refills every 4 hours." | Activity button |

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
- A target that is already the player's frontier: "Garrison it". Its tile
  menu offers Garrison, not Expand To.
- Otherwise, a neutral target in vision (not fogged), in practice one outside
  reach: "Expand To it". Expand To walks the border across through a waypoint
  chain.
- Otherwise, nothing in vision: "build a Relay Beacon: tap the marked tile,
  then Build" when the checklist has a recommended beacon site (only that site
  is ringed). Without a site, the step says "…on a garrisoned tile at the edge
  of your land".
- While a claim or garrison on a target is already underway
  (`optimisticPending`, for example right after Expand To), the step says so
  instead of asking for a Garrison that is already queued.

Known limit: "Expand To" is suggested for the nearest neutral target in
vision without checking that a land route exists. A visible town across
water may have no Expand To in its menu.

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
| `…/tutorial-guide-foothold-targets.ts` | Garrison / Expand To / beacon choice for the town and food steps |
| `client-onboarding-ui-gate/client-onboarding-ui-overlays.ts` | Chooses guide versus checklist; per-frame tick |
| `apps/realtime-gateway/src/gateway-app/handle-set-hint-state-message.ts`, `sqlite-player-profile-store.ts` | Server persistence (`guide_status`, `guide_steps` columns) |

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

Lore reviewed; no canon change. The guide's copy uses existing canon terms: a
Manifest is *commissioned*, barbarians are *Planetary Defense*, and empires
are *Houses* (see [the world bible](lore/galactic-lore.md) §11–12).
