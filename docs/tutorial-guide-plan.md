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
false` for guests, so the client treats a guest session as new. Every older
account has no status and a complete profile, so it keeps the New empire
checklist unchanged.

**What it looks like.** One small card in the bottom-left corner: the same slot
the checklist bubble uses, measured to clear the Center/AFC button. The card
shows:

- the chapter;
- what to do;
- one line of why;
- a progress bar;
- **Show me** (centres the camera on the step's map target; repeated presses
  cycle through the targets), **Skip** and, on the last step, **Finish**;
- a "Hide guide" link.

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
  it above the bottom-left minimap and hide it behind full-screen views.
- **Off-screen targets** get no edge arrow. "Show me" pans the camera to them
  instead.

**When it hides.** The guide uses the existing onboarding UI gate: it is hidden
while a dialog covers the map or the AFC landing is still pending or playing,
then returns.

**Persistence.** `guideStatus` (`active` | `done` | `dismissed`) and
`guideSteps` (completed step ids, at most 64) are stored on the gateway's
player profile through `SET_HINT_STATE`, and mirrored in localStorage for
instant reads. Completion is sticky: a step stays done once done. Settings ›
Hints › **Restart guide** (shown only to enrolled accounts) resets it.

## Chapters

The game requires a commissioned Manifest before any building other than a
Relay Beacon, so the Manifest chapter comes before Build, and the Build step
is unavailable until a Manifest exists.

| # | Chapter | Step (completes when…) | Target |
|---|---|---|---|
| 1 | Look around | drag the map; zoom; tap a tile (player input, via `client-map-input.ts`, shared by both renderers) | — |
| 2 | A foothold | the four checklist goals: find a town, Expand To it, find food, Expand To 4 food slots (`onboardingChecklistState`) | checklist highlights, Relay Beacon site when nothing is in reach |
| 3 | Manpower | the manpower panel is open | manpower gauge |
| 4 | Manifests | the Manifest panel is open; first Manifest commissioned (`techIds`) | Manifest button |
| 5 | Build | owns a structure other than a Relay Beacon (available only after a Manifest) | nearest own garrisoned empty resource tiles |
| 6 | Contest | owns a muster flag (available once mustering unlocks on first contact with Planetary Defense or a rival House) | own garrisoned tiles touching another owner |
| 7 | Your turn | the Activity dashboard (or Chronicle) is open; **Finish** | Activity button |

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
| `…/tutorial-guide-card.ts`, `…/tutorial-guide-anchor.ts` | Card DOM; HUD-button outline |
| `…/tutorial-guide-storage.ts` | Enrollment, progress, server sync |
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
   - Decide whether discovery tips that repeat the current step should be held
     back. Today they stay in the opposite corner.

## Lore

Lore reviewed; no canon change. The guide's copy uses existing canon terms: a
Manifest is *commissioned*, barbarians are *Planetary Defense*, and empires
are *Houses* (see [the world bible](lore/galactic-lore.md) §11–12).
