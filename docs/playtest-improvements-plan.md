# Playtest improvement plan

Status: active proposal; item 1 implemented locally, live verification pending
Owner: current agent branch for item 1; product owner for subsequent priorities
Last verified: 2026-10-18
Replaces: none; update the relevant canonical references as each item ships

## Evidence and scope

Waypoint played staging for more than an hour, finishing at rank 5 with
0/2,832 manpower available and 94 staged in muster flags. The activity report
showed 259 tiles claimed, 138 lost, 13,067 manpower spent attacking, and one
town lost; a town capture was also observed. The report window and deployed
build were not recorded, so these counts do not establish unique retained
gains, attack success rate, or balance. Several server-update interruptions
required a manual refresh before play resumed.

Preserve the contested world, useful Center controls, and clear town payoff
cards. Prioritize reliable control and explanation before adding mechanics.
Implementation targets the rewrite stack and browser client. New map feedback
must cover both 2D canvas and true-3D, including mobile input.

## Delivery order

### 1. Recover from server updates without refreshing — implemented locally

Trace the existing disconnect, reconnect, authentication, INIT, and map-resync
sequence. Reproduce the paths that stall and fix automatic recovery rather
than relying on a page refresh or only changing loading messages.

Acceptance criteria:

- An established session recovers automatically once the backend is available,
  including after an outage longer than the existing retry budget.
- A socket opening is not mistaken for a restored authenticated game session.
- Retries use bounded backoff and do not create concurrent reconnect loops.
- New authoritative state restores manpower, muster flags, and ongoing work;
  camera and selection survive an ordinary same-season reconnection.
- Interrupted commands are not blindly replayed or charged twice.
- Regression coverage fails before the fix and passes afterward, including an
  integration test of disconnect through successful reauthentication and INIT.

Update the deployment explanation only as needed to describe actual recovery.
Follow [testing and debugging](agents/testing-and-debugging.md); deployment and
production promotion follow [the deployment runbook](agents/deploys.md).

Implementation and verification, 2026-10-18:

- Confirmed with failing regressions: the previous client reloaded after five
  failed reconnects, and a socket that reopened but never delivered INIT could
  remain stuck indefinitely. Authentication error replies already clear the
  in-flight authentication guard; no change to that mechanism was needed.
- Recovery now keeps retrying with capped jittered backoff. After 60 seconds
  without restoration progress it restarts a silent connection; login queue
  messages and INIT-download progress extend that deadline. Applied INIT resets
  the backoff and cancels recovery timers. The first page boot is unchanged.
- Extracted socket lifecycle handling from the oversized network integration
  file into an explicitly typed module; the original file is smaller.
- Local verification: all 4,982 client tests across 720 files passed, including
  the new disconnect/authentication/INIT integration scenarios. Client type
  checking and production build passed, as did file-line, docs, and changelog
  gates. Tests verify authoritative manpower/flags/pending-command recovery,
  preserved camera/selection, no gameplay-command replay, and stalled/active
  recovery paths.
- Not deployed. A controlled staging update during an established session is
  still the live acceptance check. The original playtest's exact outage cause
  cannot be proven without its build and deployment logs.
- Review follow-up: recovery stops when Firebase reports a signed-out player,
  including sign-out in another tab. A later sign-in reopens a closed socket
  without replacing a connection attempt that is already running. Regression
  tests cover sign-out before retries, during backoff, during a stalled restore,
  and subsequent sign-in.

### 2. Preview and confirm bulk garrison

Before Garrison Connected executes, highlight exactly the affected tiles and
show eligible count, total manpower and coin cost, exclusions with reasons,
and what starts immediately versus queues. Keep the preview visible on mobile.
Revalidate eligibility when submitting and explain any changed selection.

Acceptance: preview, queued work, and server validation agree; no silently
included or excluded tiles, including mixed reach and affordability cases.

### 3. Put muster controls together

Use a dedicated Muster tab incorporating the existing commitment controls.
Group orders, staged force, current status, and commitment in one place. Use
a consistent two-column layout for short commands where space allows, with
the selected command's explanation nearby. Separate Clear Muster from routine
orders. Do not switch the general Actions layout solely at a three-action
threshold, which would move controls as availability changes.

Acceptance: common flag operations are discoverable on a small phone without
scrolling through unrelated tile/building actions or hunting between tabs.

### 4. Clarify tile selection and manpower-panel hierarchy

Show the exact selected tile with a strong footprint outline visible around
terrain/buildings and while its panel is open. Another tap can change the
selection before an action. Diagnose actual picking errors separately; a
highlight cannot correct wrong coordinates. Verify coasts, zoom, raised
terrain, display scaling, touch input, and both renderers.

Keep manpower detail in the existing Manpower panel. Put available manpower,
total staged manpower, next refill, and active flags above modifier breakdowns.
Explain that staged force belongs to flags and Clear Muster returns it to the
pool. Preserve the existing clickable flag rows. No new HUD or regeneration
change is proposed.

### 5. Summarize Activity by area

Group nearby related events by area and time window, with opponent breakdowns,
gains/losses, manpower spent, and material town/resource consequences. Center
the map on the area and let players inspect its events. Keep distant battles
against the same opponent separate. Distinguish collapsed detail from history
that is unavailable; major losses remain prominent.

Start with automatic descriptions using a nearby named town/landmark and a
direction, falling back to coordinates. Optional player-defined area names
can follow evidence of repeated use; no region-management system is needed
initially. This is an Activity improvement, not a new front-management screen.

Acceptance: a player can tell whether an area is advancing, holding, or trading
the same ground and identify the important consequence within 30 seconds.

## Existing work and deferred decisions

- Keep Attack To and Expand To as the ordering flow. Expand To already handles
  travel via waypoints; do not build a duplicate guided ordering system.
- Evaluate the incoming AI update first. Repeated failed attacks, tile trading,
  and ability to hold valuable gains become next-playtest scenarios, not a
  separate AI implementation workstream now.
- No manpower-rate or refill-cadence change is authorized by this plan. Improve
  explanation first and collect evidence before proposing balance changes.
- Current develop already has combat previews, reconnect machinery, AI
  stalemate protection, and some out-of-reach garrison fixes. Verify each gap
  against the deployed build before duplicating or changing those systems.

## Verification and follow-up

Record build SHA and session/report windows in subsequent playtests. Check
automatic recovery after backend readiness, selection retries, rejected bulk
actions, understanding of available/staged manpower, and ability to identify
an area's important events. Use several players and seeds before drawing
balance conclusions. Each shipped behavior change needs a client changelog
entry, relevant regression checks, and the repository's required CI gates.
