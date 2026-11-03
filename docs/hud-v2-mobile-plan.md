# HUD v2 on mobile: research and plan

Status: proposed (2026-11-03). Nothing here is built yet.

The new HUD (`packages/client/src/client-hud-v2/`) is the default on desktop
since #2587. Phones still get the legacy HUD: `isHudV2Active()` in
`client-hud-v2-flag.ts` returns false whenever `isMobile()` matches
`(max-width: 900px)`. This plan covers bringing the new HUD to phones and then
retiring the legacy mobile chrome (`#mobile-nav`, `#mobile-sheet`,
`#mobile-core`, the mobile `#tile-action-menu` styles).

Design inputs already in the repo: the **Mobile** section of
[`design/hud-v2/ui-teardown.html`](design/hud-v2/ui-teardown.html) (phone
sketches of the map, town and battle screens) and its "Where today's panels
go" table. This plan builds on those sketches rather than replacing them.

## 1. Research: what good 4X / strategy UIs do on a phone

Public UI write-ups for these games are thin. The points below come from the
sources listed at the end plus direct knowledge of the games' shipped UIs.
Treat individual claims as references to check against the game itself, not
as citations.

### Turn-based 4X built for phones

- **The Battle of Polytopia** (designed phone-first). One resource number at
  the top, almost nothing else on the map. Selecting a unit or city puts its
  few actions in a short strip at the bottom. Detail lives one tap away, never
  on the map at rest. Reviewers single out the text size and forgiving tap
  targets: you rarely tap the wrong tile. The studio describes the core
  decision as choosing what to hide in menus so the map never confronts you
  with everything at once.
  *Take:* the map at rest shows one or two numbers; selection drives the
  bottom of the screen.
- **Civilization VI on iPhone/iPad.** A full desktop 4X ported to touch.
  Reviewers found touch often felt better than mouse, and the collapsible
  menus worked on iPhone, but small screens made detail hard to read and some
  gestures had to be taught in a mobile tutorial.
  *Take:* parity of features is achievable; the failure mode is density, not
  missing features. Collapse by default; teach any gesture that isn't a tap.
- **Civilization VII on console.** Rebuilt its console HUD around a radial
  menu to reach the most-used systems quickly. Launch reception was poor on
  PC partly because the controller-first UI felt chunky, and Firaxis had to
  patch UI problems after launch.
  *Take:* a separate touch layout must not leak into desktop, and the dense
  screens (Civ VII's trade screen was the worst case) need their own phone
  layout, not a scaled-down desktop one.

### Persistent real-time strategy on phones (our closest genre match)

Border Empires is persistent and real-time, which makes it closer to *Rise of
Kingdoms*, *Whiteout Survival* and *Clash of Clans* than to turn-based 4X. Those
games converge on the same layout:

- Resources in a thin top strip; tapping it opens a full breakdown instead of
  making each number its own target.
- A collapsible **quest/timer tracker** on the left edge: one line when
  folded, a list when open. This is the phone equivalent of Stellaris's
  outliner and of our desktop tracker.
- A **bottom navigation bar** of four to six destinations, badges on each.
- Selecting something on the map opens a **bottom sheet** or a small ring of
  actions around the selection; the map stays visible above it.
- Big, single primary buttons at the bottom right for the most common action.
- Timers everywhere, each one tappable to jump to the thing.

### Platform guidance

- Minimum touch target 44×44 pt (Apple HIG) / 48×48 dp (Material). Several
  desktop v2 targets are smaller (rival tokens 40 px, chips 34 px, the gear
  34 px).
- Sheets with **detents** (peek, half, full) and a grabber; at the smaller
  detents the content behind stays interactive. This is exactly the tile dock
  problem: you need to keep panning the map with the tile open.
- Primary actions in the bottom third (thumb zone); avoid putting frequent
  actions at the top left, the hardest corner to reach one-handed.
- Respect `env(safe-area-inset-*)`, and keep draggable things away from the
  very bottom edge where the system home gesture lives.
- Text no smaller than ~14 px on phones.

### What this means for us

1. **Map at rest is nearly empty.** Treasury summary on top, a one-line
   tracker, the orb and a tab bar. Rivals and the season clock fold into one
   pill.
2. **Selection drives a bottom sheet** with three detents. The action bar
   sits at the top of the sheet so the primary action is reachable at the
   peek detent.
3. **Destinations become tabs, not floating bubbles.** Five tabs as the
   teardown says: Map · Manifest · Diplomacy · Chronicle · More.
4. **Dense screens get their own phone layout** (town, battle, Manifest,
   Ranks), not CSS shrinking of the desktop one.
5. **No hover.** Every `title=` tooltip and `:hover` label in v2 (about 56
   uses) needs a tap or long-press equivalent or must be redundant.

## 2. Where the code is today

- Gating: `isHudV2Active(isMobile)` in `client-hud-v2-flag.ts`; the frame in
  `client-hud-v2.ts` toggles `body.hud-v2`, closes any open screen and turns
  the Diplomacy lens off when the layout drops to phone width.
- **Landscape phones already get the desktop HUD.** `isMobile()` checks width
  only, so an iPhone Pro Max in landscape (932×430) is "desktop" and gets the
  360 px + 420 px town panels on a 430 px-tall screen. Phase 0 fixes this.
- Desktop layout is hard-coded for wide screens: `.hud-v2-top`/`.hud-v2-right`
  are fixed corners; screens start at `top: 140px`/`192px`; the town screen is
  a 360 px left column plus a 420 px right column, and its action bar width is
  `calc(100vw - 880px)`; Chronicle is a 430 px drawer.
- Some v2 screens host legacy DOM (trade view, player profile, AFC panel,
  Settings). Those legacy panels already have mobile styles we can reuse.
- 13 non-test client files branch on `isMobile()`; the legacy mobile layout
  lives mostly in the `@media (max-width: 900px)` block of `style.css`
  (6,503 lines, over the 500-line limit; nothing can be added to it).
- `.v2s-backdrop` uses `backdrop-filter: blur(4px)`, which is expensive on
  low-end phones, the players most likely to be on the 2D renderer.
- `focusCamera()` in `client-hud-v2-context.ts` centres the selected tile on
  the viewport. On a phone with a half-height sheet that tile ends up under
  the sheet.

## 3. Target layout (portrait phone)

```
┌───────────────────────────────┐
│ ◆1.2k +34  🍖4/6  Int82% ▾  ⚙ │  Treasury bar: one target → Treasury sheet
│ ▸ 3 need you · Garden 42m · +2│  Tracker line: tap to unfold
│                       Day 9 ◷ │  Season + rivals pill → Ranks
│                               │
│            (map)              │
│                               │
│ ◐ lens                  ◉ 412 │  Lens button · manpower orb (thumb side)
├───────────────────────────────┤
│ Map  Manifest  Diplo Chron More│  Tab bar (safe-area padded)
└───────────────────────────────┘
```

With a tile selected, the tab bar is replaced by the **tile sheet**:

| Detent | Height | Shows |
|---|---|---|
| Peek | ~120 px | Tile name, owner crest, action bar (primary action large, right) |
| Half | ~50 dvh | Plus tile facts and the details from `client-hud-v2-tile-details.ts` |
| Full | ~90 dvh | Plus build list / long content; map no longer interactive |

The map stays pannable at peek and half. Selecting another tile swaps the
sheet content without closing it. The camera centres selections in the
visible map area above the sheet (see Phase 2).

Landscape phones use the same compact layout with the sheet docked to the
right edge (max 380 px wide) instead of the bottom, and the tab bar becomes a
left rail.

## 4. Screen mapping

| Desktop v2 | Phone v2 |
|---|---|
| Resource bar chips (each opens Economy on a resource) | Whole bar is one target → Treasury sheet listing every resource with its Economy breakdown; `▾` gets a warning dot when a hidden resource has a problem |
| Crest + bubbles (Manifest, AFC, Diplomacy, Ranks, Towns, Chronicle) | Tab bar: Map · Manifest (AFC upgrades as a segment) · Diplomacy · Chronicle · More (Ranks, Towns, profile, Settings) |
| Season clock + rival tokens (top right) | One pill: season day + leader crest; tap → Ranks. Rival tokens move into Diplomacy |
| Tracker (left aside) | One-line tracker that unfolds into a sheet; rows keep their focus-the-map links |
| Manpower orb | Same orb, bottom right above the tab bar; tap opens the manpower panel as a half sheet |
| Lens switcher | Corner button bottom left; menu opens upward |
| Tile dock + action bar | Tile sheet with three detents (above) |
| Battle screen | Full-screen sheet: both sides on one row, modifier breakdowns folded, win chance + effort + **Confirm attack** at the bottom |
| Town screen | Full screen, tab bar hidden, three tabs: Overview · Build · Tiles; prev/next town arrows in the header; action bar pinned to the bottom |
| Manifest tree | Scrolls one lane at a time horizontally; tapping a node opens its detail as a sheet |
| AFC upgrades | Six cards stacked in one column, Installed folded above |
| Diplomacy | List → detail push; detail has a Back button |
| Ranks | Tracks stacked full width, side column below |
| Chronicle | Half-height sheet, map visible above; tapping a row centres the map above the sheet |
| Profile, Settings | Full-screen sheet (legacy panels already have mobile styles) |
| Esc handling | Android back button / swipe-back closes the top sheet (history entry per open sheet) |

## 5. Phases

Each phase is one PR to `develop`, behind a phone opt-in until Phase 7, so
partial work never reaches phone players by default.

### Phase 0: foundations (no visible change)

- Replace the boolean desktop gate with a layout mode:
  `hudV2Layout(): "desktop" | "compact" | "off"`. Compact when width ≤ 900 px
  **or** height ≤ 500 px with a coarse pointer (fixes landscape phones).
  `isHudV2Active` becomes `hudV2Layout() !== "off"`; the frame toggles
  `body.hud-v2-compact` alongside `body.hud-v2`.
- Phone opt-in: `?hud=v2` on a phone stores the flag and turns compact mode
  on; the stored default stays legacy on phones until Phase 7.
- Keep the existing "leaving the HUD closes the screen" logic for desktop ↔
  compact switches (rotation, window resize) so nothing is stranded.
- Compact CSS goes in new files (`client-hud-v2-compact*.css`), never into
  `style.css` or the existing v2 sheets near their limits.
- A shared sheet primitive (`client-hud-v2-sheet.ts`): detents, grabber, drag
  with pointer events, background interaction at peek/half, `history`
  integration for the back gesture, safe-area padding. All later phases use it.
- Playwright screenshot harness at 390×844, 360×780 and 932×430 (landscape),
  against a local `pnpm dev`, for before/after images in every PR.
- Turn off `backdrop-filter` in compact mode.

### Phase 1: map at rest

Treasury bar + Treasury sheet, tracker line, season pill, orb, lens button,
tab bar with badges (reuse `navHtml` inputs: AFC ready, diplomacy requests,
Chronicle unread). Tabs open the existing desktop screens full screen for now
(they'll be rough until Phase 5; acceptable behind the opt-in).

### Phase 2: tile sheet and action bar (the core loop, highest risk)

- Mount the tile dock (`client-hud-v2-tile-dock.ts`, `-action-bar.ts`,
  `-tile-details.ts`, `-tile-facts.ts`) inside the sheet. Same HTML builders,
  compact CSS.
- Primary action ≥ 48 px tall at the right of the peek detent; secondary
  actions wrap below; every target ≥ 44 px.
- Tap-to-select vs. pan: keep the existing map input rules; the sheet only
  swallows events inside itself.
- `focusCamera()` gains an optional visible-area inset so the selected tile
  centres above the sheet. **Renderer parity:** the inset must be applied in
  both the 2D canvas camera and the true-3D camera (`isTrue3DRendererActive()`
  branches); test on 2D first since low-end phones are mostly there.
- Neutral-tile quick claim, crystal targeting and placement preview must still
  work with the sheet at peek.

### Phase 3: battle

Battle preview and live battle as a full-screen sheet using the existing
`client-hud-v2-battle*.ts` data. Effort confirm and Enter-to-confirm become a
bottom Confirm button.

### Phase 4: town screen

Full-screen town with Overview · Build · Tiles tabs, built from the existing
`client-hud-v2-town*.ts` pieces (built list, build list, support-ring focus,
Rush/Cancel/Jump to front). The support ring stays visible on the map in the
Tiles tab with the sheet at half.

### Phase 5: destination screens

Chronicle half sheet, Manifest lane-by-lane, AFC single column, Diplomacy
list → detail, Ranks stacked, Towns list, profile and Settings full screen.
Hover labels and `title=` tooltips get tap equivalents (long-press on tab
icons shows the label; tooltips on the Treasury rows become inline text).

### Phase 6: everything else that floats

Tutorial guide anchors (`tutorial-guide-anchor.ts` already lists both legacy
mobile and v2 selectors; add the compact ones and check the card doesn't cover
the sheet), onboarding checklist corner position, alerts/toasts, diplomacy
offer dock, victory alert, guest-save banner, discovery tips. Audit the 13
`isMobile()` branches and route each through the layout mode.

### Phase 7: rollout and cleanup

1. Staging: compact on by default for phones, `?hud=legacy` still works.
   Playtest on a low-end Android on the 2D renderer and on an iPhone.
2. Production default on, changelog entry with `createdAt` frozen at merge
   time.
3. After a release with no regressions: delete `#mobile-nav`,
   `#mobile-sheet`, `#mobile-core`, the phone `#tile-action-menu` styles and
   the `mobilePanel` state. This removes a large part of the 900 px block in
   `style.css`, bringing it closer to the line limit. Update
   `design/hud-v2/README.md` (known gaps), `client-hud-v2-flag.ts` comments
   and `AGENTS.md`/`README.md` if anything there describes phones as legacy.

## 6. Testing

- Unit tests beside each module, as v2 does today: layout-mode selection
  (portrait, landscape phone, tablet, desktop), sheet detent state machine,
  back-gesture closing order (same order as `onEscape`), camera inset maths.
- Regression test for the landscape-phone bug (932×430 must select compact).
- Screenshot harness from Phase 0 in each PR description.
- Manual check per phase on the 2D renderer (force it) and the 3D renderer.
- `pnpm ci:local` before every PR; no file over 500 lines, no growth of
  `style.css`.

## 7. Risks and open questions

1. **Sheet vs. map gestures.** A drag that starts on the map must pan, one
   that starts on the grabber must resize. Get this right in Phase 0 before
   anything depends on it.
2. **Tab bar or bubbles?** The teardown chose a five-tab bar. A floating
   bubble cluster (desktop style) keeps more map but is harder to reach.
   Recommendation: tab bar, hidden whenever a sheet is above peek.
3. **Tablets** (901–1200 px, touch): desktop layout with 44 px targets, or
   compact? Recommendation: desktop layout plus a `pointer: coarse` pass on
   target sizes; revisit after phone launch.
4. **Long-press radial menu** on tiles (teardown: "later"). Not in this plan;
   the sheet covers every action. Consider once Phase 2 is in players' hands.
5. **Performance.** The 250 ms frame rewrites only changed regions, which
   should be fine, but measure on a low-end Android with the 2D renderer
   before Phase 7.

Renderer note: the HUD is DOM over both renderers, so it needs no renderer
work, except the camera inset in Phase 2 (both renderers) and any new map
highlight a phase adds, which must also land in both.

Lore reviewed; no canon change (layout only).

## Sources

- [Interview with Midjiwan CEO on The Battle of Polytopia (Cubed3)](https://www.cubed3.com/features/interviews/interview-with-midjiwan-ceo-christian-lovstedt-on-the-battle-of-polytopia)
- [Super Tribes / Polytopia review (TouchArcade)](https://toucharcade.com/2016/04/20/super-tribes-review/)
- [Civilization VI iPhone review (Macworld)](https://www.macworld.com/article/231955/civilization-vi-iphone-review.html)
- [Civilization VI for iPad review (TouchArcade)](https://toucharcade.com/2017/12/21/sid-meiers-civilization-vi-for-ipad-review/)
- [Civilization VI on iPhone hands-on (AppleInsider)](https://appleinsider.com/articles/18/10/04/hands-on-civilization-vi-in-its-entirety-has-made-its-way-to-the-iphone)
- [Civilization VII console UI (PlayStation Blog)](https://blog.playstation.com/?p=398944)
- [Who Civilization VII's UI was made for (Push Square)](https://www.pushsquare.com/news/2025/02/ps5-ps4-pc-players-cant-decide-who-civilization-7s-ui-was-made-for)
- [Firaxis acknowledges Civilization VII UI problems (CGM)](https://www.cgmagonline.com/news/civilization-vii-quality-of-life-updates)
- [Designing for reachability on large phones (DEV)](https://dev.to/del_rosario/designing-for-reachability-interfaces-for-7-inch-phones-in-2026-2b93)
- [Mobile UI safe areas (PlayCanvas)](https://developer.playcanvas.com/tutorials/mobile-ui-safe-areas)
- Apple Human Interface Guidelines: Sheets (detents, background interaction) and minimum 44 pt targets; Material Design: 48 dp targets.
