# AFC Specializations — UI specification

Status: active proposal; first client interface slice implemented locally
Owner: Benjamin Waye (product decisions); implementing agent (delivery)
Last verified: 2026-10-18
Replaces: the domain/Sharding panel when the [implementation plan](afc-specializations-plan.md) ships

See the [catalogue](afc-specializations-catalog.md) for all thirty rewards and the
[interactive study](design/afc-specializations-preview.html) for the proposed flow.
The study is a review artifact, not a connected client or shipped interface.

## Intent and visual direction

The player needs to notice a new choice, compare six approaches, understand its
effect on this empire, and commit one permanent campaign choice without losing
the map context. Existing brass/gunmetal/parchment styling should make this feel
like the AFC's command console, not a separate research shop.

No `.interface-design/system.md` was present in the inspected checkout. Reuse
the existing `client-steampunk-theme-style.css` tokens rather than introducing
a new theme: brass `#d9ad52`, parchment `#f2e8d3`, muted `#bda880`, iron
`#14100a` / `#1b140d`, and verdigris `#7fb8a4` for installed status. Cinzel
headings, Spectral/body, and Space Mono/numerals use existing fonts/fallbacks.
Use bordered layered panels, restrained inset depth, 4px spacing increments,
8/12/16/24px internal gaps, and at least 44px touch targets. A small branch
symbol and text label distinguish roles; color is supplementary, not essential.

## Where players find it

1. **Global navigation:** replace Sharding with AFC Upgrades. Keep one global
   entrypoint; a persistent ready count survives panel closure and reload.
2. **AFC inspector:** put **Manage AFC upgrades** in the existing overview. It
   opens the global management screen directly. Do not add another AFC tab or
   nest a Specializations tab beneath Modules, Actions, or Overview.
3. **Map discovery:** a clickable **↑ N upgrades ready** badge sits above each
   visible, active, owned AFC after landing. It opens management directly. Both
   2D canvas and true 3D use the current camera projection, including pan/zoom.
   Hide it when claimed, pending, captured, inactive, offscreen, or hidden. The
   global navigation count remains available when the AFC is offscreen. Never
   draw upgrade positions as additional module sockets.
4. **Manifest:** each tier header says "First commission unlocks AFC Upgrade N."
   Commission success has one contextual "Choose AFC upgrade" action when needed.
5. **Activity / onboarding:** one event per newly unlocked tier, with a deep link.
   Avoid modal interruption of attacks; the player can continue and choose later.

The global panel remains accessible if the AFC was lost. Show current choices
and explain the need to rebuild an active AFC before making a new installation.
Do not force a camera jump to select an upgrade. Provide an optional Locate AFC.

## Main screen

Desktop: use an expanded management panel with a readable six-candidate area
and a detail column. Keep the map available around the panel. Do not squeeze
six cards into a narrow existing tile tooltip. The AFC inspector can summarize
the same state and open this management panel at the selected tier.

```text
AFC / CAMPAIGN HEADQUARTERS                   1 upgrade ready
2 of 5 upgrade positions installed
Review upgrade tier [ III · Ready · Choose one specialization     v ]

UPGRADE III · Choose one specialization       Free
Your choice lasts for this campaign. Other tier-III choices will close.

[Vanguard / conquest]  [Bastion / defense]      [Selected choice detail]
[Dominion / expand]   [Exchequer / core Coin]  Exact benefit and scope
[Oracle / aether]     [Chancery / diplomacy]   Your empire: before → after
                                             How it works in the world
                                             [Install upgrade — free]
```

Use one labelled native tier selector, with installed names and locked states,
in both the study and connected client. The management sheet has no additional
tab bar or horizontal tier scrolling. These are five campaign choices, not six
mandatory class picks.
Installed positions name their actual upgrade and branch. Locked positions name
the exact next condition. Multiple banked choices show a count and install oldest
unfilled tier first. All thirty rewards remain inspectable without appearing
installable. Future tiers contain a View in Manifest action, not a fake countdown.

Cards present branch, name, one concrete mechanical sentence, and state. Avoid
Coin/Shard price rows when the choice is free. Ongoing / On installation badges
differentiate persistent modifiers and one-shots. A branch path view is optional
secondary browsing; do not imply same-branch prerequisites or faction lock-in.

## Detail and commitment

Use this order:

1. Tier, branch, upgrade name, and passive/active/one-shot classification.
2. Benefit in ordinary language; technical effect keys never appear.
3. Authoritative affected scope and preview: named towns, forts, towers, links,
   or deposits; current → projected values; zero targets shown explicitly.
4. Explanation: who or what produces the benefit, usually two short sentences.
5. Primary action and a concise reminder that this tier's alternatives close.

The first click selects a card and reveals details; it never commits. The
explicit Install action submits once. No second generic confirmation modal is
needed after the consequence is visible. During submission disable installation
and show Installing. Mark installed only after server acknowledgement. On rejection,
retain selection, refresh eligibility/preview, and explain the specific reason.

Examples of live previews:

| Choice | Preview |
| --- | --- |
| Founding Concession | Three named core towns; FOOD demand 4 → 2 each; qualifying Coin/day before → after. |
| Clearing Privilege | Manufactory uplift +35% → +60% per copy where a Clearing House applies; exact total income change. |
| Scarcity Consignment | "Crystal · 2 eligible deposits · 2 Mines arrive"; normal FOOD slot demand and any resulting dormancy. |
| Metropolitan Concession | Three named core towns, persistent Coin change, and exact one-time population deliveries. |
| Defensive Depth | A representative fort attack commitment 300 → 600 MP, with its actual combat-preview baseline. |
| Reciprocal Trade Pact | Number of qualifying allied links and additional Coin/day; partner contribution shown separately. |

Use the same formulas as gameplay. Avoid promising a global income doubling when
only a particular output component or allied-link contribution is affected.

## Active actions and effect visibility

- Orbital recruitment appears in the AFC action area and the MP panel: Coin
  amount, 5 MP/Coin, delivered MP, reserve overflow, and purchase receipt.
- Counterphase appears in tower actions after its upgrade, with targeting,
  duration, range, and the actual shared cooldown. Show disabled/cooldown reasons.
- Armistice appears in player diplomacy: both participants, twelve hours, expiry,
  and the 48-hour personal cooldown. Forced Court truces have a distinct source label.
- Flag detail shows Momentum stacks and decay time; frontier capture visibly
  refreshes the timer. Both map renderers show the same stack cue when selected.
- Fort detail and attack preview expose factory contribution, fortified-town
  reserves, commitment modifiers, and ward readiness/recharge.
- Town and dock breakdowns attribute their specialization contribution by name.
- Oracle-detected flags use a signal marker with coordinate/owner, a Locate/Purge
  action, and "MP and orders unknown." A masked signal never displays a guessed MP value.
- Suppressed towers and consumed wards have clear status, expiry, and map cues.
- Diplomacy standings distinguish actual-land leadership from weighted contribution;
  explicitly state which House is currently eligible for the sole victory.

## Mobile and accessibility

On phones, use the existing management sheet. Six candidates form a single-column
list. Selecting a card expands its details immediately beneath it; every other
choice remains in the same list. No child screen, Back navigation, nested tabs,
or sideways tier scrolling. Selecting another card moves the inline detail;
selecting the open card or pressing Escape closes it. The commitment action
remains in the document flow above safe-area insets. On desktop the expanded
management panel places selected details beside the comparison cards.

Routine HUD ticks keep unchanged content mounted so they preserve touch scrolling,
keyboard focus and an open native selector. Changed content preserves scroll and
restores focus to the corresponding control.

Use semantic buttons and headings, labelled native selection controls, visible
keyboard focus, logical focus restoration, and polite live announcements for
installed/rejected states. Escape closes the detail and returns to its card.
State uses text/icons as well as color. Locked choices remain readable and explain
their condition. Honor reduced motion; no flashing or perpetual badge pulsing.
Verify 390px and 320px widths, 200% text zoom, long localized names, and touch.

## Introduction and migration

Introduce alongside a new-season ruleset. Existing seasons retain their paid catalogue and commands. The clearer AFC
Upgrades navigation and inline comparison can ship independently; actual costs
remain visible and eligibility uses current balances and owned prerequisites.
Free-upgrade copy and new rewards wait for the versioned ruleset; never advertise
free installation for a paid old domain command. Release notes explain the new home, free tier unlocks, six roles,
one-per-tier permanence, and Shards' remaining monument use.

The first newly commissioned Manifest tier triggers one restrained banner:
"AFC upgrade available — choose how your expedition specializes." Link to the
appropriate tier. Reconnecting with unclaimed upgrades shows the persistent
count, not a replay of every old notification.

## UI delivery and review gates

1. Shared state/view model and reusable tier/card/detail components, with typed
   contracts and Storybook states. Remove old copy through a dedicated extraction.
2. Global entrypoint + AFC inspector integration + Manifest ready indication.
3. Real numerical previews and actions, followed by acknowledgement/rejection
   handling and reconnect/ownership-loss coverage.
4. Both map renderers: ready AFC, Momentum, wards, suppression, and masked flags.
   Inspect `isTrue3DRendererActive()` branches explicitly before declaring parity.
5. Desktop/phone visual review, keyboard/touch flow, and a complete end-to-end
   free choice in a new staging season. Do not ship merely a renamed domain grid.

The included preview demonstrates candidate browsing, future/installed/ready tiers,
the distinction between mechanics and explanation, a deliberate installation,
and a resettable sample campaign. It does not simulate real affordability,
authoritative previews, or networking failures. The client slice implements the
standalone entrypoint, inline details, owned-AFC overview link, and ready badge
in both renderers against the current paid catalogue. Free Manifest unlocks, all
thirty proposed effects, and the remaining active-action UI are later plan phases.
