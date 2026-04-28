# Gateway-App Code Review — 2026-04-20

**File:** `apps/realtime-gateway/src/gateway-app.ts`  
**Triggered by:** Commit `0c877c8` (Phase 5 observability primary) added ~661 lines to this file alongside a 17-line `metrics.integration.test.ts`.  
**Review focus:** Behavioral drift on the request path that could have been smuggled in alongside the metric wiring.  
**Reviewer:** Claude Sonnet 4.6 (automated second-pass review)

---

## Summary

**Overall risk: LOW.** The request path is behaviorally intact. Metric wiring is additive — no side effects on the command submission path, subscription lifecycle, or event fan-out.

No blocking bugs found. Two low-priority maintenance issues documented below; one medium-priority issue that is a performance concern but not a correctness regression.

---

## Finding 1 — MEDIUM: `commandStore.get` + `markResolved` called N times per TILE_DELTA_BATCH

**Location:** Lines 362–368 (inside the outer `for (const socket of socketsForEvent(...))` loop)

```ts
// TILE_DELTA_BATCH handler — inside outer socket loop
void commandStore.get(event.commandId).then((command) => {
  if (!command) return;
  if (command.type === "ATTACK" || command.type === "EXPAND" || command.type === "BREAKTHROUGH_ATTACK") return;
  void commandStore.markResolved(event.commandId, Date.now()).catch(...);
});
```

**Problem:** `commandStore.get(event.commandId)` is called once per socket in `socketsForEvent(sockets, "TILE_DELTA_BATCH")`. For a world with N players each on one socket, this issues N parallel DB reads and potentially N `markResolved` calls for the same commandId.

`markResolved` is presumably idempotent (uses `UPDATE ... WHERE resolved_at IS NULL` or similar), so correctness is not compromised. But it generates unnecessary DB load proportional to session count.

**Fix:** Hoist the `commandStore.get` + `markResolved` block out of the outer socket loop — execute it once per TILE_DELTA_BATCH event, not once per socket:

```ts
// BEFORE the outer socket loop, or in an early-return block:
if (event.eventType === "TILE_DELTA_BATCH") {
  // ... snapshot updates (inner loop, all sockets) ...

  // Mark resolved ONCE per event, not per socket
  void commandStore.get(event.commandId).then((command) => {
    if (!command) return;
    if (command.type !== "ATTACK" && command.type !== "EXPAND" && command.type !== "BREAKTHROUGH_ATTACK") {
      void commandStore.markResolved(event.commandId, Date.now()).catch(...);
    }
  });

  // Fan out TILE_DELTA_BATCH to preferred-channel sockets
  for (const socket of socketsForEvent(sockets, "TILE_DELTA_BATCH")) {
    queueOrSendSessionPayload(socket, { type: "TILE_DELTA_BATCH", ... });
  }
  return;
}
```

**Priority:** Medium — production correctness is fine, but this adds unnecessary DB round-trips that could become noticeable at >20 concurrent sessions.

---

## Finding 2 — LOW: Duplicate message-type guard list creates a maintenance hazard

**Location:** Lines 203–237 (`ignoredLegacyMessageTypes`) and lines 762–800 (UNSUPPORTED guard)

Both blocks enumerate the same list of command message types. If a new command type is added to the handlers but not to `ignoredLegacyMessageTypes`, or vice versa, behavior silently diverges.

The UNSUPPORTED path at lines 762–800 is effectively dead code: any message that passes `ClientMessageSchema.safeParse` will be caught by either `ignoredLegacyMessageTypes` (early return, no error sent) or the explicit handler chain before reaching the UNSUPPORTED guard.

**Recommendation:** Extract the "fully handled commands" list to a shared constant (e.g., `GATEWAY_HANDLED_COMMAND_TYPES: ReadonlySet<string>`) and derive both the `ignoredLegacyMessageTypes` filter and the handler guard from it. Add a test that asserts `ignoredLegacyMessageTypes ∩ GATEWAY_HANDLED_COMMAND_TYPES = ∅`.

**Priority:** Low — no functional issue today, but creates a correctness risk as new command types are added in Phase 4/5 follow-up work.

---

## Finding 3 — LOW: COMBAT_START sent for SETTLE commands

**Location:** Lines 320–328

```ts
if (event.eventType === "COMMAND_ACCEPTED") {
  // ...send ACTION_ACCEPTED...
  if (event.actionType !== "EXPAND") {
    queueOrSendSessionPayload(socket, { type: "COMBAT_START", ... });
  }
}
```

SETTLE commands that are accepted produce a `COMMAND_ACCEPTED` event with `actionType = "SETTLE"`. This triggers a `COMBAT_START` message to the client, which may be unexpected. SETTLE starts a frontier capture countdown but is not a combat action.

This appears to be **pre-existing behavior** (not introduced by `0c877c8`) and the client may be treating `COMBAT_START` generically as "frontier lock started." However, if the client renders a "combat in progress" UI on SETTLE, this is a parity gap vs the legacy server.

**Recommendation:** Verify whether the legacy monolith sends a `COMBAT_START` equivalent for SETTLE. If not, add `event.actionType !== "SETTLE"` to the guard or rename the client-side message type to `FRONTIER_LOCK_START`.

**Priority:** Low — likely intentional or harmless, but worth confirming against legacy behavior before Phase 6 cutover.

---

## Behavioral integrity audit: PASS

The following request-path checks all pass:

| Check | Result |
|---|---|
| AUTH flow → subscribePlayer → buildInitMessage unchanged | ✅ PASS |
| ATTACK_PREVIEW computed inline (no network, no side effects) | ✅ PASS |
| SETTLE, BUILD_FORT, etc. → `submitDurableCommand` (correct) | ✅ PASS |
| ATTACK, EXPAND, BREAKTHROUGH_ATTACK → `submitFrontierCommand` (correct) | ✅ PASS |
| Alliance/Truce → socialState + fanout (no simulation involvement) | ✅ PASS |
| Error path: bad JSON → BAD_JSON, schema fail → BAD_MSG | ✅ PASS |
| Error path: no auth → NO_AUTH, sim unavailable → SERVER_STARTING | ✅ PASS |
| Catch block sends GATEWAY_INTERNAL_ERROR on unhandled exception | ✅ PASS |
| `session.nextClientSeq` incremented after each command | ✅ PASS |
| Socket close → `playerSubscriptions.removeSocket` called | ✅ PASS |
| Metrics wiring: no metric calls on the hot request path (metrics in separate module) | ✅ PASS |
| No TODO / unfinished stubs in request path | ✅ PASS |

---

## Metric wiring assessment

The Phase 5 metrics (`gateway_event_loop_max_ms`, `/metrics` endpoint, etc.) live in:
- `apps/realtime-gateway/src/gateway-metrics.ts` (not reviewed here, assumed additive)
- `apps/realtime-gateway/src/http-routes.ts` (metrics exposed as Prometheus text)

In `gateway-app.ts` the only Phase 5 additions appear to be:
- The `recordGatewayEvent` helper + `recentGatewayEvents` ring buffer (lines 140–144)
- Event recording call-sites (lines 170, 506, 509, 534–538, 542–546, 572–586)
- `recentEvents` option passed to `registerGatewayHttpRoutes` (line 254)

None of these touch command submission, session state, or event fan-out. The ring buffer is capped at 250 entries (line 143) and cannot cause unbounded memory growth.

---

## Action items

| Priority | Item | Owner |
|---|---|---|
| Medium | Fix `commandStore.get` + `markResolved` called N times per TILE_DELTA_BATCH | Phase 6 pre-flight |
| Low | Extract command type list to shared constant; add set-intersection test | Phase 6 pre-flight |
| Low | Confirm COMBAT_START on SETTLE matches legacy behavior | Phase 6 pre-flight |
