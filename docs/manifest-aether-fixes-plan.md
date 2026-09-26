# Manifest step 9 — Aether ability corrections (implementation plan)

Source: `docs/manifest-full-plan.md` §7. Item 1 is skipped (already true).

## Findings (2026-09-27, read from code)

- `ABILITY_DEFS` (`packages/game-domain/src/server-game-constants/server-game-constants.ts`) is unused, and disagrees with server handlers and client gating:
  - reveal_empire: defs `cryptography`, server + client `beacon-towers` (correct)
  - reveal_empire_stats: defs/server/client `surveying` -> should be `beacon-towers` (Augury Office)
  - aether_lance (Purge): defs `signal-fires`, server/client `crystal-lattices` (correct: Aether Resonance Core)
  - `revealCapacityForPlayer` (`apps/simulation/src/runtime-ability-helpers.ts`) uses `cryptography` -> should be `beacon-towers`
  - aether_emp: client-only gating (`cryptography`), no ABILITY_DEFS entry, no server handler
- Survey Sweep (`surveySweepPingKind` in `runtime-ability-command-handlers.ts`) only pings GEMS/TITANIUM/towns -> add UMBRITE.
- Aether Wall: server already blocks both directions (`crossingBlockedByAetherWall`); only client copy is wrong ("one-way ... faced side") in `client-crystal-ability-info.ts`.
- Retort: `RETORT_RECAST` has no server handler and the message enum lacks UMBRITE; client menu has no Umbrite target. Item 9 therefore means implementing the handler, not a tweak.
- Siphon: current design is a until-cancelled 3x3 slot-transfer lock (`siphon-mode/`); item 8 is a redesign.

## Phase 9a (next to execute)
1. New `packages/game-domain/src/ability-gating/` helper reading `ABILITY_DEFS`; fix the three wrong defs; server handlers and client `requiredTechForTileAction`/`hasAetherWallCapability` read it. Parity test vs `tech-tree.json`.
2. Survey Sweep reveals Umbrite.
3. Fix Aether Wall copy (two-way).
Note 500-line limits: `runtime-ability-command-handlers.ts` (495) and `client-tile-action-support.ts` (498) must not grow.

## Needs a decision before building
- Item 6 Aether EMP: no behaviour spec exists anywhere.
- Item 8 Siphon: "target field" scope (single tile vs 3x3), replaces slot-transfer/until-cancelled model?
- Item 9 Retort: implement server handler + Umbrite target (cost/cooldown/rules).
