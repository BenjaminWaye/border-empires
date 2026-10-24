# Relic redesign implementation

Status: implemented; ready for review
Owner: Benjamin Waye (product); Codex (implementation)
Last verified: 2026-10-24
Replaces: the earlier blade-anchor proposal in `relics-design.md`; final shipped rules will replace the corresponding sections of `natural-wonders-design.md`.

## Scope and sequence

The accepted surface is the weathered space-age ziggurat, with human-scale
stairs and a raised House banner. Use painted capture artwork, not the rejected
small 3D underground model. Machines use aether; locals leave them dormant to
avoid Wardens. Repair costs, random breakdowns and reactivation encounters are
future work, not hidden additions to this release.

1. [x] Shared state and lifecycle: dormant/active/depleted, explicit finite
   reserves, compatibility with old tiles and persistent consumption.
2. [x] Revised effects and simulation regression tests: activation on ordinary
   garrison; no recapture refill; committed battle bonuses and honest previews.
3. [x] World generation and discovery: seven distinct families, seeded
   selection, map-size/placement fallback, anonymous proximity beacons.
4. [x] Both renderers: shared ziggurat, ownership flag, dormant/active/depleted
   presentation, fog-safe light columns, minimap marker and tile information.
5. [x] Capture experience: painted illustration, current effect/reserve,
   first-reveal versus recapture notification, revisitable information.
6. [x] Verification and delivery: focused tests, persistence/transfer tests,
   browser checks, complete local CI, changelog, gameplay/lore documentation.

## Working defaults for implementation

These fill unspecified parameters for a reviewable first version; they are
balance defaults, not claimed to have been supplied verbatim by the user.

| Family | Working implementation contract |
|---|---|
| Foundry Heart | Random revealed strategic resource, shortage weighted. +4 TITANIUM / +2 CRYSTAL / +1 UMBRITE capacity while garrisoned. FOOD excluded. Persist the first allocation; a later holder must have revealed its resource before benefiting. No stockpile economy is introduced. |
| Antimatter Drive Works | Dock income ×2, dock-launched attack strength ×1.15 and duration ×0.75. Movement remains implicit; no independent ship unit system. |
| Ancillary Vault | One finite reserve of 2,000 manpower, granted on first garrison. Remove the ongoing +2,000 manpower-cap bonus. Bodies already awarded remain with their House after loss of the vault. |
| Combat-Suit Factory | 100 empowered ATTACK deployments, ×1.5 attack strength while garrisoned and controlled. A launch reserves/consumes a site charge; rejects do not. No free refill on recapture. The committed battle retains its booked bonus. |
| Ancient Field Generator | Local defense field over garrisoned tiles in radius 3, ×1.5 defense, 30 defensive engagements. Finite and predictable; no random collapse or first-successful-attack cancellation. |
| Fabrication Coordinator | +1 simultaneous Development project while garrisoned; no Manifest discount. Existing projects are not cancelled when this capacity is lost. |
| Nanofabricator Reserve | Five construction rush subsidies, up to 40 Coin each, replacing the recurring daily Quickforge discount. Spend a charge only for a successful discounted purchase. |
| Concordance Resonator | Old aether tower; cast radius 50, no ordinary Crystal-slot demand. Ordinary vision and protection radii retain their own existing rules. |
| Subsurface Survey Array | Resource-signature survey in radius 12, using already revealed resource types. No enemy ownership/army data. Activation is automatic; no additional repair/activation button. |

All finite reserve counts belong to the site and survive owner changes and
restart. Counter state must be carried through tile serialization and snapshots.
No unbounded per-player/per-attack history is introduced. Existing campaign
ownership reset behavior is preserved.

## Map state language

- Dormant: unclaimed/not garrisoned; muted sealed structure, no operating light.
- Active: operating lights and House banner when held; remaining reserve shown
  in tile info and capture dialog where applicable.
- Depleted: the ruin remains, operating glow is off, House banner remains if
  owned, and a distinct crossed-cell/empty-reserve marker plus the word
  “Depleted” make the status readable without relying on colour. Both 2D and
  3D use the same authoritative status. It remains selectable/capturable.
- A depleted locator must not advertise an operational reward. Fog uses known
  information and never leaks fresh ownership or depletion changes.

## Art and delivery

Use `relic-overlay-preview.md` for approved visual references and the saved
armour-works painting/prompt. Finish the Warpress dialog with that painting;
produce additional family art from finalized briefs, keeping owner insignia
neutral. Preserve source images and optimize browser copies. Record missing
art explicitly rather than presenting an incorrect family illustration as final.

No deployment or production-world regeneration is part of implementation.

## Verification progress

- Shared lifecycle and hint payload tests pass.
- Runtime tests cover garrison-only vault recovery, persisted depletion,
  final-charge battle strength, six nano rushes (five discounts), revealed-resource
  allocation, local field coverage and survey privacy.
- Existing wonder/rush compatibility tests pass.
- Desktop and 390 × 844 capture views inspected; native Escape/focus return checked.
- Production 2D and 3D lifecycle models inspected side by side in Storybook.
- First full local run passed 3,528 simulation tests and caught the nanofabricator
  dependency gap. It is fixed and its end-to-end regression now passes.
- The final local CI run passed shared/domain/protocol checks, 3,533 simulation
  tests, performance and world-generation stress suites, and 1,496 gateway tests.
  It caught three client source guards affected by helper extraction/material
  ordering; those were repaired and the complete client suite then passed all
  5,405 tests, TypeScript lint and the production build.
- Source-size, documentation, changelog and Storybook TypeScript checks pass.
  No deployment or existing-world regeneration was performed.
