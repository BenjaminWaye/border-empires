# Manifest step 9 — Aether ability corrections (implementation plan)

Status: done -- all §7 items addressed or decided-skip, on `agent/manifest-tech-data-cleanup` (PR #2085)

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

## Phase 9a — done (2026-09-27)
1. `packages/game-domain/src/ability-gating/` reads `ABILITY_DEFS`; fixed the three wrong defs (reveal_empire_stats and reveal_empire -> beacon-towers, aether_lance -> crystal-lattices); server handlers and every client gate/reason-string now read it. Parity test in `ability-gating.test.ts`.
2. Survey Sweep now also pings Umbrite (`runtime-ability-command-handlers.ts`), test updated.
3. Aether Wall copy fixed to say it blocks both directions (it already did server-side).
4. **Item 6, Aether EMP, implemented**: new command end-to-end (client-protocol/sim-protocol/gateway/simulation), handler in `runtime-aether-emp-command-handler.ts`. Targets a hostile owned tile; every Ambaric Transformer (AETHER_TOWER) that empire holds within `AETHER_EMP_RADIUS` (5 tiles, **not balance-tuned, placeholder**) of it gets `disabledUntil = now + AETHER_EMP_DURATION_MS` (15m); `isStructurePowered` now also checks `disabledUntil`, so every Sky Dock/Resonance Grid/monument depending on that Transformer loses power for the same window automatically. Regression test proves the cascade. Ability gated on `cryptography` (Counterphase Core Module), unchanged and already correct.
   - Follow-up not done: the client's crystal-targeting picker (`client-crystal-targeting.ts`) still only offers tiles that already carry a powered-structure type as EMP targets. This is stricter than the server (which accepts any hostile owned land tile) so it is not a correctness bug, but it means a player cannot target a bare tile near a Transformer the way the new server behavior would allow. Left as a client UX follow-up.

## Phase 9b — done (2026-09-27, post-merge review pass)
A cross-check of the branch diff against this plan's own claims (rather
than trusting the "done" list above at face value) found the item-1 sweep
had two gaps:
- Two test fixtures granted the pre-fix `surveying` tech instead of the new
  `beacon-towers` requirement for reveal_empire/reveal_empire_stats, so
  they silently stopped testing what they claimed to
  (`runtime.reveal-empire-stats-perf.test.ts`,
  `runtime-truce-sync.test.ts`) — both fixed.
- Four requirement-hint strings still named the pre-rename tech instead of
  its Manifest name (Survey Sweep, Siphon ×2, Create/Remove Mountain) —
  all fixed to match the sibling strings item 1 already corrected. Gating
  logic itself was never wrong in any of these; this was copy-only.

## Phase 9c — done (2026-09-28)
Item 9 (Retort) implemented per `docs/manifest-retort-recast-plan.md`: new
`RETORT_RECAST` server handler (`apps/simulation/src/runtime-retort-recast-command-handler.ts`),
registered in every command-registration list needed for it to actually
reach a handler (it had previously been missing from three of them, which
is why it silently did nothing), Umbrite added as a fourth target, and the
client's stale pre-split reason string fixed.

## Remaining
- Item 8 (Siphon redesign) — **skipped per user direction 2026-09-27**: Siphon was just reworked; do not touch it.

All other §7 items are done. See `docs/manifest-full-plan.md`'s progress
report for the full picture, including the still-open 3D delivery-animation
work (§10) that item 9's implementation does not include.
