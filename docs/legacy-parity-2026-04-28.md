# Legacy Parity Audit — 2026-04-28

Diff range: 041d81c..HEAD (2026-04-15 → 2026-04-28)
Total first-parent commits in range: 64
Player-visible items: 14
Arch-only / skipped: 50

## Status legend
- ✅ confirmed working in legacy on staging
- ⚠️ in legacy code but untested on staging
- ❌ gateway-only, needs porting to legacy
- ⏭️ arch-only, skipped per user instruction (#4)

---

## Player-visible items

### Logout button: handler now survives DOM cloning
- **Commit(s):** 81328d2 Fix logout button handler binding (merged → bcc3f81)
- **Player-visible behavior:** The Log Out button in the settings panel (including the mobile-clone) now reliably fires on click. Previously the handler was bound to `#auth-logout` by ID, which broke on any clone of the settings card.
- **Where in code:** `packages/client/src/client-hud.ts` — button uses `data-auth-logout` attribute; event wiring loops over `querySelectorAll("[data-auth-logout]")`.
- **Status:** ⚠️
- **Verification step:** Open the settings panel on staging (desktop and mobile layout). Press Log Out. Confirm Firebase logout fires and the auth state returns to the login screen.

### Logout button disabled during loading
- **Commit(s):** Inside `1fd5b5d` (Merge pull request #25 from codex/logout-press-noop)
- **Player-visible behavior:** The Log Out button is now correctly disabled while `authReady` is false, so pressing it during the "Securing session" loading phase no longer triggers a noop state machine transition.
- **Where in code:** `packages/client/src/client-hud.ts` — `${state.authReady ? "" : "disabled"}` attribute on the button.
- **Status:** ⚠️
- **Verification step:** On staging, open in a slow-network incognito window. While `[auth-progress]` is still loading, try clicking Log Out. Button should be inert.

### Ghost players no longer appear in leaderboard/status metrics
- **Commit(s):** efa49ec Fix season profile setup lifecycle (merged → b8dc978)
- **Player-visible behavior:** Players who connected but never completed profile setup no longer show up as named empires in the leaderboard or status readouts. Their partial territory is cleaned up on reconnect.
- **Where in code:** `packages/server/src/main.ts` — `discardIncompleteHumanPlayer()`, `removePlayerRuntimeState()`, `clearAuthIdentityBindingForPlayer()`; `packages/server/src/server-player-profile-lifecycle.ts` — `playerNeedsProfileSetup()`, `resetHumanProfileForSeason()`; `packages/server/src/server-status-metrics.ts` — filters incomplete players from counts.
- **Status:** ⚠️
- **Verification step:** On staging, connect with a fresh incognito window but do NOT complete the profile/name prompt. Check the leaderboard from a second window. The incomplete player should not appear.

### Settlement food upkeep is now zero
- **Commit(s):** 8b1692d Fix settlement food upkeep
- **Player-visible behavior:** Settlements no longer drain food. Previously a bug caused them to consume food upkeep like towns, starving players early in a game.
- **Where in code:** `packages/server/src/server-town-economy-runtime.ts` — `if (town.isSettlement) return 0;` at the top of the food-upkeep function.
- **Status:** ⚠️
- **Verification step:** On staging, build a settlement. Check the HUD food balance panel — the settlement should not appear as a food consumer.

### Frontier queue waits for confirmed origin ownership before dispatch
- **Commit(s):** f1b1130 fix(client): block optimistic-origin frontier dispatch until ownership is confirmed
- **Player-visible behavior:** Rapid chained expand/attack actions no longer produce intermittent NOT_OWNER errors. The queue now holds the next action briefly when the origin tile is only optimistically owned.
- **Where in code:** `packages/client/src/client-queue-logic.ts` — `frontierSyncWaitUntilByTarget` map; checks `originSyncWaitUntil > Date.now()` before dispatching.
- **Status:** ⚠️
- **Verification step:** On staging, rapidly queue 3+ expands in a row. Confirm all succeed without NOT_OWNER errors in the console.

### Settlement support areas and road links hidden
- **Commit(s):** e1b3038 Remove settlement support and road UI (merged → 9f3455b)
- **Player-visible behavior:** The settlement tile overview no longer shows the "Support X/Y" line or road-network visualisation that was only meaningful for towns. Settlement gold-per-minute display also fixed to avoid NaN.
- **Where in code:** `packages/client/src/client-tile-overview-modifiers.ts` — `Support` line gated on `tile.town.populationTier !== "SETTLEMENT"`; `packages/client/src/client-road-network.ts` — road connection suppressed for settlement tier.
- **Status:** ⚠️
- **Verification step:** On staging, click on a settlement tile. Confirm the support area count line is absent and no road links render from it.

### Tech tooltip fallback cost display
- **Commit(s):** b0258b1 Phase 4 (client-tech-html.ts portion); visible in diff to `packages/client/src/client-tech-html.ts`
- **Player-visible behavior:** Technology tooltips now always show a cost breakdown even when the server hasn't sent a checklist yet, preventing "Cost not listed" for valid technologies.
- **Where in code:** `packages/client/src/client-tech-html.ts` — `fallbackRequirementChecklist()` and `effectiveRequirementChecklist()` helpers.
- **Status:** ⚠️
- **Verification step:** On staging, open the tech tree panel and hover over a tech with a gold or resource cost. Confirm cost is shown immediately without waiting for a server round-trip.

### Attack preview uses shared combat math (same formula as server)
- **Commit(s):** b0258b1 Phase 4: add command coverage rails and align attack preview combat math
- **Player-visible behavior:** The win-chance percentage shown when hovering a hostile tile now matches the server's actual combat resolution odds. Previously the client used a diverging local formula that made some hostile frontier tiles appear to be 100% captures when they were not.
- **Where in code:** `packages/client/src/client-queue-logic.ts` — `localAttackPreview()` now calls `buildFrontierCombatPreview()` from `@border-empires/shared`; `packages/shared/src/frontier-combat.ts` — new shared module.
- **Status:** ⚠️
- **Verification step:** On staging, hover over a hostile tile owned by an AI or another player. Confirm win% and breakthrough win% are below 100% when the target has defense modifiers.

### Dock cooldown and manpower error messages improved
- **Commit(s):** b43aa45 Phase 0 (client-player-actions.ts portion)
- **Player-visible behavior:** When a dock crossing is on cooldown the error now shows a countdown ("still on cooldown for 12s") instead of a raw error code. Manpower-blocking errors show the required amount.
- **Where in code:** `packages/client/src/client-player-actions.ts` — `DOCK_COOLDOWN` branch with `formatCooldownShort`; `INSUFFICIENT_MANPOWER` branch.
- **Status:** ⚠️
- **Verification step:** On staging, attempt a dock crossing immediately after one just completed. Confirm a human-readable cooldown message appears in the HUD.

### Combat resolution null-safety fix (defender lookup)
- **Commit(s):** Inside the diff to `packages/server/src/server-frontier-action-runtime.ts` (multiple commits)
- **Player-visible behavior:** Edge case where a defender's player object became unavailable mid-resolution no longer produces a wrong combat result or crash — the defense multipliers are correctly computed from the owner ID even when the player record can't be fetched.
- **Where in code:** `packages/server/src/server-frontier-action-runtime.ts` — `defenderOwnerId` separate from `defender` object; multiplier calls use id-based lookups with fallbacks.
- **Status:** ⚠️
- **Verification step:** No direct trigger — this guards an edge case. Confirm no ERROR-level server logs mentioning frontier-action during normal staging play.

### Ownership change triggers vision update for affected players
- **Commit(s):** In diff to `packages/server/src/server-ownership-runtime.ts`
- **Player-visible behavior:** When a tile changes owner (attack, abandon, etc.) nearby players now immediately receive a local vision delta and a subscribed-view refresh. Previously there could be a brief period where the tile appeared stale in observers' views.
- **Where in code:** `packages/server/src/server-ownership-runtime.ts` — `sendLocalVisionDeltaForPlayer` and `refreshSubscribedViewForPlayer` called for all `visibilityAffectedPlayers`.
- **Status:** ⚠️
- **Verification step:** On staging with two browser windows (two accounts), have one player attack a tile visible to the other. Confirm the observer sees the tile update without a manual refresh.

### Chunk refresh deferred during player frontier priority
- **Commit(s):** 99624dc Defer chunk refreshes during frontier priority (#31)
- **Player-visible behavior:** Tile data pushes are batched/deferred for 50ms when the player has an active frontier action in-flight. Reduces the visual "tile flicker" that occurred when the player expanded rapidly.
- **Where in code:** `packages/server/src/server-realtime-sync-runtime.ts` — `deferredSubscribedViewRefreshByPlayer`, `DEFERRED_SUBSCRIBED_VIEW_REFRESH_MS = 50`.
- **Status:** ⚠️
- **Verification step:** On staging, queue a rapid frontier expansion sequence. Confirm tiles do not flicker or temporarily revert to a previous state between actions.

### Auth/bridge debug info in settings panel
- **Commit(s):** 7c3040b Fix staging auth identity diagnostics
- **Player-visible behavior:** The settings panel now contains a copyable debug section showing Firebase UID, player ID, backend mode, season ID, and bridge state. Not core gameplay — used for cross-device debugging.
- **Where in code:** `packages/client/src/client-hud.ts` — `authDebugHtml()` and `bridgeStatusHtml()` sections in the settings card.
- **Status:** ⚠️
- **Verification step:** Open settings on staging. Confirm the debug section is present, copy button works, and values reflect the legacy backend (`legacy-server`, `legacy-init`).

### Player display name formatting utility
- **Commit(s):** 1305582 Merge pull request #30 (agent/player2-ai-gap) — `packages/shared/src/player-display-name.ts`
- **Player-visible behavior:** Player names in HUD, leaderboard, and attack-origin tooltips now use a shared `formatPlayerDisplayName()` utility for consistent truncation and fallback labeling.
- **Where in code:** `packages/shared/src/player-display-name.ts` — `formatPlayerDisplayName()`; consumed by client.
- **Status:** ⚠️
- **Verification step:** On staging, confirm player names display consistently in the leaderboard, tile-detail panel, and attack-preview tooltip.

---

## Arch-only items skipped

The following commits touched only `apps/realtime-gateway/`, `apps/simulation/`, `packages/game-domain/`, `packages/sim-protocol/`, Postgres migration SQL, CI/build tooling, Fly config, or rewrite-only staging diagnostics. They are excluded per user instruction #4 (no gateway/simulation-only architectural work).

- b43aa45 Phase 0/land rewrite (#13)
- 5109df5 Phase 1: Clean domain boundary
- 4f24c70 Phase 2: Postgres-authoritative persistence
- 731a2bd Phase 3: offload AI/system planning to worker threads
- 28d5d59 Phase 4 completion
- 67d41d3 Fix phase-5 accept-latency lane scope
- 0c877c8 Phase 5 observability metrics and gates
- 67eb7b5 Revert phase-6-unauthorized
- 2444f7d Phase-6 cutover
- ae1bcb6 Phase-6 prereqs
- 27bc75c Cleanup: safe staging autoscale + health endpoints
- d7a24e1 Supabase bounded postgres
- a5d9b5b Merge PR #24 staging seasonal runtime fixes
- 68f591f 3D terrain default for rewrite (gateway-only default; opt-in via `?renderer=3d` for legacy)
- 0a5b800 3D MVP attempt merge
- bb1bb3f Polish 3D ownership rendering (rewrite default only)
- 1def516 Fix 3D tile picking (rewrite default only)
- 8175795 Fix unexplored blackout (rewrite default only)
- 0335366 3D default renderer regression guard
- 68a89d3 Changelog bump after 3D merge
- 7936172 Attack debug bundle (gateway)
- 8a4031c Fix gateway attack debug build and tests
- 31a7914 Log-blockers-analysis (simulation)
- 6e48c12 Simulation lag attribution diagnostics
- bbf2eec Simulation lag diagnostics
- c1ecd14 Fix AI island frontier expansion (simulation)
- b6e8c5e Fix rewrite settlement food upkeep (simulation)
- bb0d798 Document rewrite settlement upkeep fix
- 7c3040b Fix staging auth identity diagnostics (gateway auth binding — client HUD debug section already listed above)
- 39ad695 Auth-binding staging fix (test-only)
- ec7e38a Auth-binding staging fix merge
- a0fdf09 AI worker sync filter (simulation)
- 805cc35 Auth-init-bootstrap (gateway/simulation)
- 7a8f2d7 Staging nauticus dupe merge
- b8f2e5b Sim-startup merge base
- 492e603 Fix simulation startup availability
- ff0573e Reduce planner relevance sync stalls (simulation)
- bcc3f81 Logout-button-fix changelog bump only
- 088b5bf Abandon-territory-fix (simulation SQL)
- 782b9b4 Gateway: avoid global backend down on subscribe timeout
- 53e56d3 Allow staging reseed on empty durable state (simulation)
- 62ec5d3 Focus AI frontier planning on active edges (simulation)
- ef25992 Changelog bump for AI active-edge parity
- d37fe4b Changelog bump for AI parity
- 5f9806e Staging season reset (simulation scripts)
- 70f3cdf Fix seasonal worldgen (simulation)
- 9f3455b Settlement support areas (changelog only — UI change listed above)
- 030aac5 Fix season rollover reset order (simulation)
- feee7be Fix HQ season player totals (simulation)
- 00143c3 Season-summary-fix merge
- a3d4943 LLM AI training pipeline scaffolding
- ede69e4 Local AI labeling runner
- 6bbe2c2 AI labeling triage pass
- 2a0675d Reset local seed helper
- e90ed83 Harden simulation worker startup
- 4e50bb7 Fix local seeded rewrite startup
- 631ffe1 Merge PR #33 staging AI autopilot debug
