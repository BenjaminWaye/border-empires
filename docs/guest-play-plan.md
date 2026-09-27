# Guest play ("Play now" without an account)

Status: planned 2026-09-27. PR 1 (server) in progress on `agent/guest-play`.

## Goal

Let a visitor start playing with one click, then keep their empire by
linking a Google or email account later. Sign-up is the biggest drop-off
between the landing page and the first move; in-app browsers (Instagram,
TikTok, Discord) can't do Google sign-in at all
(`client-inapp-browser.ts`), and that is where rally links get opened.

## Decisions (user, 2026-09-27)

1. The season player cap stays. Guests get their own allowance *inside* it
   (`SIMULATION_MAX_SEASON_GUESTS`, default 10), so idle guests can never
   lock out real sign-ups. Worst case: "Play now" stops working and people
   sign in instead.
   - Open question: prod and staging do not set
     `SIMULATION_MAX_SEASON_PLAYERS`, so both enforce the code default of
     **50**, not 100. The gateway lobby display defaults to 120. Decide the
     real number and set it in both `fly.combined*.toml` files.
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
- Join: `JoinSeasonRequest.is_guest`. A new guest is rejected with
  `guest_full` when the guest allowance is used up; the overall cap still
  applies to everyone.
- Upgrade: `PreparePlayerRequest.is_guest` is sent on every login. A
  player in `guestPlayerIds` who logs in with a non-guest token is removed
  from the list. No new RPC.
- Email on upgrade: `reconcileGatewayAuthBinding` returns early on a uid
  match without saving a new email, so an upgraded guest would never get
  season-start emails. It now saves the email when the stored binding has
  none. The gateway's 5-minute identity cache is bypassed when the token's
  guest/email state no longer matches the cached value.
- Diplomacy lock: a wrapper around `SocialState` rejects alliance/truce
  request and accept for guests (`GUEST_DIPLOMACY_LOCKED`). Checking the
  actor on both request and accept is enough: a guest can neither send nor
  accept, so no alliance or truce involving a guest can form.

## PRs

### PR 1 — server support (no user-visible change)

- sim-protocol: `is_guest` on `PreparePlayerRequest`/`JoinSeasonRequest`,
  `guest_full` on `JoinSeasonAck`; `guestPlayerIds` on season state.
- simulation: guest allowance check, guest list add/remove, counters
  (`sim_guest_join_rejected_full_total`, `sim_guest_upgraded_total`),
  gauge-able guest count.
- gateway: `isGuest` on resolved identity; pass through prepare/join;
  `GUEST_SLOTS_FULL` error; binding email on upgrade; cache bypass;
  guest registry + diplomacy lock with counter
  (`gateway_guest_diplomacy_blocked_total`).
- Regression tests for each of the above.

### PR 2 — "Play now" (after the token fix lands)

- Enable the Anonymous provider in the Firebase console (manual).
- "Play now" button → `signInAnonymously`, then the existing flow
  (socket AUTH → JOIN_SEASON → name-and-colour setup, which already exists
  via `profileNeedsSetup`).
- `GUEST_SLOTS_FULL` → show the normal sign-in options with a short note.
- Diplomacy UI for guests: explain the lock instead of a generic error.
- Changelog entry.

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
- The gateway guest registry is in memory. After a gateway restart a guest
  is re-marked on their next login; until then only their own actions are
  checked, which is what the lock relies on.
