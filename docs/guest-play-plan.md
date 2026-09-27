# Guest play ("Play now" without an account)

Status: 2026-09-27. PR 1 (server) implemented, self-reviewed, and pushed on
`agent/guest-play`. See **Progress** at the bottom.

## Goal

Let a visitor start playing with one click, then keep their empire by
linking a Google or email account later. Sign-up is the biggest drop-off
between the landing page and the first move; in-app browsers (Instagram,
TikTok, Discord) can't do Google sign-in at all
(`client-inapp-browser.ts`), and that is where rally links get opened.

## Decisions (user, 2026-09-27)

1. The season player cap stays, raised to **100** per the user's call
   (2026-09-27) — neither prod nor staging had ever actually set
   `SIMULATION_MAX_SEASON_PLAYERS`, so both were silently running the code
   default of 50 despite a stale comment in both `fly.combined*.toml`
   files claiming 120. Both files now set `SIMULATION_MAX_SEASON_PLAYERS
   = "100"` and `SIMULATION_MAX_SEASON_GUESTS = "10"` explicitly. Guests
   get their own allowance *inside* the 100 (not additive), so idle guests
   can never lock out real sign-ups. Worst case: "Play now" stops working
   and people sign in instead. The gateway lobby display's own separate
   default (120) still doesn't match; low priority since it's cosmetic.
2. Guests cannot request or accept alliances or truces until they save
   their empire. Allied players share vision, allied dock crossings, and
   the "diplomatic dominance" victory sums the whole allied bloc's
   territory, so throwaway allied accounts are an exploit.
3. "Play now" is the primary button on the sign-in card; sign-in options
   sit below it.

## Prerequisite

The gateway does not verify Firebase ID token signatures
(`auth-identity.ts` `decodeFirebaseTokenFallback`). That must be fixed
before guest play launches (PR 2). It is tracked as a separate task. PR 1
does not depend on it: PR 1 adds no way to become a guest.

## How it works

- Identity: player id = Firebase uid (`auth-identity.ts`). Upgrading an
  anonymous Firebase account with `linkWithPopup` / `linkWithCredential`
  keeps the uid, so the empire carries over with no server migration.
- Guest detection: the gateway reads `firebase.sign_in_provider ===
  "anonymous"` from the token on every login.
- Storage: the simulation records guests in
  `SimulationSeasonState.guestPlayerIds`, next to `joinedPlayerIds`.
  Season-scoped (resets at rollover), persisted with snapshot checkpoints
  like `joinedPlayerIds`.
- `auth_kind` on `PreparePlayerRequest` / `JoinSeasonRequest`: `"guest"`,
  `"account"`, or empty when the caller doesn't know. A string rather than
  a bool so a caller that doesn't pass it can't look like an upgrade.
- Join: a new `"guest"` is rejected with `guest_full` when the guest
  allowance is used up; the overall cap still applies to everyone.
- Upgrade: the gateway sends `auth_kind` on every login. A player in
  `guestPlayerIds` whose login says `"account"` is removed from the list.
  No new RPC. The rally-link route also passes it; any other caller leaves
  it empty, which changes nothing.
- Email on upgrade: `reconcileGatewayAuthBinding` returns early on a uid
  match without saving a new email, so an upgraded guest would never get
  season-start emails. It now saves the email when the stored binding has
  none. The gateway's 5-minute identity cache is bypassed when the token's
  guest state no longer matches the cached value.
- Diplomacy lock: `lockedForGuests` wraps the alliance/truce request and
  accept actions per socket, using that socket's own guest flag, and
  returns `GUEST_DIPLOMACY_LOCKED`. Checking the actor on both request and
  accept is enough: a guest can neither send nor accept, so no alliance or
  truce involving a guest can form. No guest registry is needed.

## PRs

### PR 1 — server support (no user-visible change)

- sim-protocol: `auth_kind` on `PreparePlayerRequest`/`JoinSeasonRequest`,
  `guest_full` on `JoinSeasonAck`; `guestPlayerIds` on season state.
- simulation: guest allowance check, guest list add/remove, counters
  `sim_guest_join_rejected_full_total`, `sim_guest_upgraded_total`, gauge
  `sim_season_guest_players`.
- gateway: `isGuest` on resolved identity; pass through prepare/join and
  the rally-link route; `GUEST_SLOTS_FULL` error; binding email on
  upgrade; cache bypass; diplomacy lock with counter
  `gateway_guest_diplomacy_blocked_total`.
- Regression tests for each of the above.

### PR 2 — "Play now" (blocked on the token-verification fix — not started)

Grounded in the actual markup/code, not a sketch:

1. **Firebase console**: enable the Anonymous sign-in provider (manual,
   one-time, not code).
2. **Markup** — `client-dom-markup.ts:125`, inside `.auth-login-state`,
   before the existing `#auth-google` button (decision 3: "Play now" is
   primary, sign-in options sit below it):
   ```html
   <button id="auth-play-now" class="panel-btn auth-play-now-cta">Play now</button>
   <div class="auth-divider"><span>Or sign in</span></div>
   ```
3. **DOM binding** — `client-dom.ts:64`, add
   `authPlayNowBtn = requireElement<HTMLButtonElement>("#auth-play-now")`,
   thread it into `AuthFlowDeps`/`dom` the same way `authGoogleBtn` is.
4. **Click handler** — `client-auth-flow.ts`, new handler beside
   `dom.authGoogleBtn.onclick` (~line 274): `signInAnonymously(firebaseAuth)`
   (new import from `firebase/auth`), same busy/error handling as the
   Google button. No `logSignUpConversion` call — guest start isn't a
   `sign_up` GA event (see analytics below).
5. **After that**, the existing flow is unchanged: `onAuthStateChanged`
   fires → socket `AUTH` (now carrying an anonymous token, so the gateway
   marks `isGuest`) → `profileNeedsSetup` → the onboarding
   name/colour step (`.auth-onboarding-state`, already built, no changes
   needed) → `JOIN_SEASON`.
6. **`GUEST_SLOTS_FULL`** — `client-network.ts:2487`, sibling to the
   existing `if (errorCode === "SEASON_FULL")` branch. Needs its own
   `applyGuestSlotsFullError`-style state update (model on
   `applySeasonFullError`) and a distinct message on the sign-in card:
   "Guest spots are full — sign in to claim an empire" with the sign-in
   options visible (not hidden behind the Play-now-only state).
7. **In-app-browser detection already exists** (`detectInAppBrowserName` /
   `inAppBrowserGoogleSignInMessage`, used today to block the Google
   button inside Instagram/TikTok/Discord's in-app browser). Guest play
   should NOT be blocked there — that's the whole point for rally links
   opened from a chat app. Just make sure `authPlayNowBtn.onclick` isn't
   gated behind that check.
8. **Diplomacy UI**: `GUEST_DIPLOMACY_LOCKED` currently surfaces as
   whatever the generic alliance/truce error toast shows. Give it its own
   copy pointing at the "save your empire" flow (PR 3) instead of a raw
   error string.
9. **Analytics** (`client-auth-flow-analytics.ts`): add `guest_start`,
   fired on a successful anonymous sign-in. Do not fire `sign_up` for it —
   that event means a real account, and PR 3's upgrade is where it should
   fire (via `logSignUpIfNewUser`-equivalent, since account linking isn't
   `createUserWithEmailAndPassword`/`signInWithPopup`).
10. Changelog entry (`client-changelog-data.ts`) — this is user-visible.

### PR 3 — "Save your empire"

### PR 3 — "Save your empire"

- HUD badge "Guest — save your empire" + one prompt at a milestone.
- Link: Google `linkWithPopup`, email+password `linkWithCredential`,
  email link `EmailAuthProvider.credentialWithLink`. Force a token refresh
  and reconnect after linking so the gateway sees the non-guest token.
- Conflict (`auth/credential-already-in-use`, `auth/email-already-in-use`):
  offer "Switch to your existing empire (this guest empire stays behind)"
  or "Keep playing as guest". Empires cannot be merged.
- Badge copy warns the guest account lives only in this browser.
- Analytics: `guest_start`, `guest_upgrade {method}`,
  `guest_upgrade_conflict`, `guest_slots_full`. `sign_up` keeps meaning a
  real account (fires on upgrade, not on guest start).
- Changelog entry.

### Later — idle-guest cleanup (only if needed)

Trigger: the guest allowance is regularly full of idle guests. Remove
guests not seen for 24h (last seen, not account age), freeing tiles and
the slot. Needs a new "remove player from the live sim" path (free tiles,
clear per-player caches, persist) — the risky part, so it waits for data.
Needs per-player last-login tracking; `auth_identity_bindings.updated_at`
only changes on first bind and cannot serve as "last seen".

## Known limits

- A restart before the next checkpoint can drop the newest entries in
  `guestPlayerIds` (same as `joinedPlayerIds`). The next login of that
  guest re-adds them via PreparePlayer, so the drift self-heals.
- A guest who is already over the overall cap (not just the guest
  allowance) gets `SEASON_FULL`, whose text promises an email. PR 2's
  client should offer sign-in on `SEASON_FULL` for guests so they can be
  notified.

## Progress

### PR 1 — server support: done, pushed, awaiting review

Two commits on `agent/guest-play` (base `develop`):
- `sim: guest allowance inside the season player cap`
- `gateway: mark guest logins and lock guest diplomacy`
- plus a review-fixes commit (below).

Self-review (code-review skill, medium effort) found two real gaps, both
fixed before push:
- `maxSeasonGuests` was declared on `PrepareOrJoinDeps` /
  `SimulationServiceOptions` but never actually wired into
  `simulation-service.ts` (unlike the parallel `maxSeasonPlayers`), so it
  was always `undefined` and silently fell back to the env var. Fixed by
  extracting `resolveSeasonCaps()` into a new `season-caps.ts` — this also
  kept `simulation-service.ts` (already over its 500-line cap) at a net
  zero line change, since one shared import/destructure replaced the two
  separate ones `maxSeasonPlayers` already had.
- The rally-link HTTP route's `preparePlayer(identity.playerId, {
  isGuest })` call had no test asserting the guest flag actually reaches
  it. Added `http-routes-rally-guest.test.ts` (a new file, not appended to
  the already-oversized `http-routes.test.ts`).
- Also fixed while cross-checking against the plan: the season cap
  decision (100) had been recorded as an "open question" instead of
  applied. `fly.combined.toml` / `fly.combined.staging.toml` now set
  `SIMULATION_MAX_SEASON_PLAYERS=100` and `SIMULATION_MAX_SEASON_GUESTS=10`
  explicitly, and the stale "120" comment in both files is corrected.

Verified before push: `pnpm lint`, `pnpm check:file-lines`, `pnpm test`
(every workspace package) all pass on the final tree.

### Still open in PR 1's own scope

- No code review from another person/agent has happened yet — self-review
  only.
- The Fly config changes are source-only in this branch; they take effect
  only once merged and deployed (ask before merge/deploy, per project
  rule).

### Not started: PR 2, PR 3, later cleanup

See the PR 2 / PR 3 / "Later" sections above — none of that code exists
yet. PR 2 is additionally blocked on the separate Firebase-token-signature
fix (see **Prerequisite**), which also hasn't been started.
