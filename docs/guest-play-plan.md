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
   = "100"` and `SIMULATION_MAX_SEASON_GUESTS = "100"` explicitly (the
   guest limit was 10 until 2026-09-28, then uncapped: see J4). Guests
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

### PR 2a — unique display names (gateway + small client change)

Lands before PR 2 and is useful on its own. Mirrors how colours already
work (`COLOR_TAKEN`, `suggestedColors` in INIT).

- **Rule**: a display name is unique across the season's players,
  compared case-insensitively after Unicode NFKC normalization, trimming and
  whitespace collapsing. Reserved: `Barbarians`, `AI <n>`, `Nauticus`
  (the seeded player-1 name).
- **Server** (`apps/realtime-gateway`):
  - New `display-name-uniqueness/` module: `nameKey`, `buildTakenNameSet`
    (stored profiles + live overrides, own player excluded, plus reserved
    names), `suggestHouseName(taken)` (`House <Prefix><suffix>`, retried,
    Roman-numeral fallback if the pool is exhausted), `suggestAlternativeName`
    (`<Name> II`, truncated to 24 chars), and a serial lock so the
    check-then-write in `SET_PROFILE` cannot race between two sockets.
  - `handle-set-profile-message.ts`: reject `NAME_TAKEN` (with a
    `suggestion`) when the name changed and is taken. Grandfathering: an
    unchanged name is never re-checked, so existing duplicates keep working
    (same rule as `colorUnchanged`). Counter
    `gateway_display_name_collision_rejected_total`.
  - INIT: `player.suggestedName` only when `profileNeedsSetup` (new
    players), so returning logins pay nothing extra.
  - `gateway-app.ts` is oversized and cannot grow: extract
    `buildTakenColorSet` (lines ~821-838) into the same new module and add
    one INIT line, netting fewer lines.
- **Client**: seed the name field from `suggestedName` (via the existing
  `seedProfileSetupFields`), and handle `NAME_TAKEN` like `COLOR_TAKEN`
  (show the message, offer the suggestion).
- **Tests**: unique on first set; case/whitespace/NFKC variants collide;
  own unchanged name never blocked; reserved names blocked; concurrent
  duplicate requests yield exactly one winner; suggestion is never taken;
  INIT carries `suggestedName` only for players needing setup.
- **Known gaps**: names set before this ships are not de-duplicated; they
  keep working, and only newly chosen names are checked. A player who has
  not finished profile setup still shows their provisional name (the
  provider name, or "Player"), which is not reserved, so alliance-by-name
  can briefly be ambiguous for them.
- **Status (2026-09-28)**: implemented and committed locally on
  `agent/unique-display-names` (worktree
  `.codex-worktrees/agent-unique-display-names`, based on `develop`), not
  pushed. Lint, `check:file-lines` and the full test suite pass. The race
  test was mutation-checked: it fails with the lock removed. Changelog entry
  added (`2026.09.28.1`). Note the repo's changelog check requires a frozen
  `createdAt` literal, so the "use `Date.now()`" line in AGENTS.md is stale.

### PR 2 — "Play now": implementation plan (2026-09-28, not started)

Client-only PR. Branch from `develop` (no compile dependency on PR 1), but
it needs PR 1 deployed to prod before it can ship there, and the
token-verification fix (separate session) deployed before it is enabled
anywhere real. See **Rollout order** below.

#### What the player sees

1. Sign-in card: **Play now** is the primary button, then an "Or sign in"
   divider, then Google and email as today.
2. Click -> busy state ("Starting your empire...") -> `signInAnonymously`
   -> the existing `onAuthStateChanged` path (socket `AUTH` with the
   anonymous token, so the gateway marks `isGuest`) -> INIT -> the
   existing name-and-colour step (`profileNeedsSetup`) -> **auto-join**
   (no "Join season?" prompt for an active season) -> the existing
   `JOIN_SEASON_ACK` camera recenter.
3. Pending season: a guest lands in the normal lobby countdown, same as
   anyone.
4. `GUEST_SLOTS_FULL`: the guest is signed out and the card shows "Guest
   spots are full - sign in to claim an empire" with Google/email
   visible. No dead end, no busy modal.
5. `SEASON_FULL` for a guest: signing in would not help (the whole season
   is full), and the current modal's "We'll email you" is false for an
   account with no email. For guests: sign out, show the card with "This
   season is full - sign in with an account and we'll email you when the
   next one starts."
6. Rally invite (`/r/<code>`): banner copy becomes "Play now to spawn next
   to {owner}"; the rally code already rides along `AUTH`, so it works
   unchanged with an anonymous token.
7. `GUEST_DIPLOMACY_LOCKED`: friendly copy pointing at saving the empire
   (PR 3) instead of the raw error text.

#### Judgment calls (resolved)

All four resolved by the user on 2026-09-28:

- **J1 auto-join: yes.** Without it "one click" is really click + name +
  a "Join season" click. Precedent: the join overlay already auto-sends
  `JOIN_SEASON` when its countdown expires
  (`client-join-season-overlay.ts:160-163`). Guest auto-join goes in the
  same place, guarded by `visible && !seasonPending && !joinSeasonPending`
  (`visible` already requires `!profileSetupRequired`, so the name step
  still happens first).
- **J2 returning players: yes.** A returning player who taps Play now
  creates a second, throwaway empire. Remember in localStorage that a real
  account signed in on this browser and, if so, style Play now as the
  secondary button. This bends decision 3 ("Play now is primary") for those
  visitors only.
- **J3 default name: `House <Surname>` (confirmed), and display names
  must be unique (user, 2026-09-28).** The player is an aristocrat
  competing for a planet and becomes a Duke on owning one (the Duke is
  shown as a purple name plus crown tag, never a text prefix), so the
  default carries no title. Generated from a prefix + suffix pool
  (`Ash`+`grove`), gender-neutral, under the 24-character limit, editable in
  the existing name step. Because names must be unique, the SERVER picks
  the suggestion (so it is already free) and enforces uniqueness on
  `SET_PROFILE`; this is PR 2a below and applies to every player.
- **J4 guest cap: none.** Guests are only limited by the overall cap of
  100 (`SIMULATION_MAX_SEASON_GUESTS = "100"`, equal to it). Consequence:
  idle guests can now fill the whole season and turn real sign-ups away
  with `SEASON_FULL`. There is no cleanup yet, so this is a launch risk,
  not a footnote. Mitigations, in order of cost: watch
  `sim_season_guest_players`; lower the value if it runs away; build the
  idle-guest reclaim (see "Later") before the landing page drives real
  traffic. A separate protection is a reserve (guests may not take the last
  N slots), which is a cap again, so it is not planned.

#### Guest names (decided 2026-09-28, replaces the guest half of J3)

Guests are named `House Noname <n>` (lowest free number) so everyone can
tell who is a guest, and they skip the name-and-colour step entirely: "Play
now" is one click. Real accounts keep `House <Surname>` as their default.

- The gateway provisions the guest at login (`guest-profile/`): name,
  a free colour, stored with `profileComplete: false`, then broadcasts
  `PLAYER_STYLE` so other players see it (the setup step used to do that).
- INIT sends `profileNeedsSetup: false` for a guest, so the client never
  shows the step. When the guest later signs in with a real account
  (PR 3), `profileNeedsSetup` turns true and the normal step appears; their
  first real name and colour are free of the once-per-season rename because
  the profile was never complete. Their `House Noname <n>` number is freed.
- `House Noname <n>` is a reserved name pattern, so a real player cannot pose
  as a guest.
- Cost: a guest cannot pick a colour or name before playing.

#### File changes (sizes checked against the 500-line rule)

New files:
- `client-guest-play/client-guest-play.ts`: `startGuestPlay(deps)` (the
  click handler body), `handleGuestRejection(deps, code)` (sign out +
  message for `GUEST_SLOTS_FULL` / guest `SEASON_FULL`), `isGuestUser(auth)`
  (`auth.currentUser?.isAnonymous === true`; the client needs no wire
  change to know it is a guest).
- `client-guest-play/client-guest-play.test.ts`
- `client-auth-guest-style.css`: styles for `.auth-play-now-cta`.
  `style.css` is 6538 lines, so it cannot grow; import the new file where
  the other `client-*-style.css` files are imported.

Edits:
| File (lines now) | Change | Size impact |
|---|---|---|
| `client-dom-markup/client-dom-markup.ts` (343) | `#auth-play-now` button + "Or sign in" divider before `#auth-google` (line 126) | +3 |
| `client-dom.ts` (299) | `authPlayNowBtn = requireElement("#auth-play-now")` + return object | +2 |
| `client-auth-flow/client-auth-flow-types.ts` (43) | add `authPlayNowBtn` to the dom type | +1 |
| `client-auth-ui/client-auth-ui.ts` (201) | disable Play now with the other buttons while busy / unconfigured | +1 |
| `client-auth-flow/client-auth-flow.ts` (**498, at limit**) | one `bindGuestPlay(...)` call in `bindAuthUi`. If that crosses 500, first extract the `safeLocalStorage*` helpers (lines ~68-96) into their own module | +1-2 or net negative |
| `client-network/client-network.ts` (**2859, oversized**) | edit the existing one-liner at line 2487 in place: add a `GUEST_SLOTS_FULL` branch and route guest `SEASON_FULL` to `handleGuestRejection`. All logic lives in the new module | 0 |
| `client-join-season-overlay.ts` (216) | guest auto-join branch beside lines 160-163; add `isGuest` to `JoinSeasonOverlayDeps`, wired from `client-hud.ts:1145` | +6 |
| `client-auth-flow/client-auth-flow-analytics.ts` (27) | `logGuestStart(analytics, cred)`; fire only when `getAdditionalUserInfo(cred)?.isNewUser` | +10 |
| `client-rally-links/client-rally-links.ts` (260) | banner copy (~line 236) | 0 |
| alliance/truce error copy | find where alliance error codes are mapped to text and add `GUEST_DIPLOMACY_LOCKED` (locate at implementation time) | small |
| `client-changelog` | new entry, `createdAt: Date.now()`; also check the pre-push hook's changelog requirements | small |

Not touched: `client-state.ts` (571, oversized). No new state field is
needed: rejection copy goes through `setAuthStatus`, and guest status is
read from Firebase, not stored.

Renderer parity (2D canvas vs true-3D): not applicable, no map overlay or
tile visualization is added.

#### Build order (one commit each)

1. `client-guest-play` module + unit tests (pure logic, no DOM).
2. Markup, DOM binding, dom type, busy-disable, CSS file.
3. Click handler wired through `bindAuthUi`; `guest_start` analytics.
4. Guest auto-join in the join overlay + hud wiring.
5. `GUEST_SLOTS_FULL` and guest `SEASON_FULL` handling in `client-network.ts`.
6. Rally banner copy and diplomacy-lock copy.
7. Changelog entry, README/docs check per AGENTS.md.

#### Tests

- `startGuestPlay` calls `signInAnonymously`, does not call
  `logSignUpConversion`, logs `guest_start` only for a new user, shows the
  error and clears busy when Firebase rejects, and is NOT blocked inside
  an in-app browser (contrast with the Google button test at
  `client-auth-flow-regression.test.ts:269`; that file's `makeDom` /
  `makeState` helpers need sharing or copying).
- `handleGuestRejection` signs the guest out and sets the right message for
  both codes; a non-guest is never signed out (this is the guard that
  protects real accounts from a stray error).
- Join overlay: a guest auto-joins exactly once for an active season, never
  during `seasonPending`, never while `profileSetupRequired`, never twice
  (`joinSeasonPending`); a non-guest never auto-joins.
- Play now button is disabled while `authBusy` / not `authConfigured`.
- Rally banner copy.

#### Verification before calling it done

- Local dev cannot exercise anonymous sign-in (`devAuthPlayerId` bypasses
  Firebase). Still run the dev server and check the sign-in card at
  desktop and phone widths for layout (the card renders without Firebase).
- Real end-to-end needs staging with: PR 1 deployed, the token fix
  deployed, and the Anonymous provider enabled. Checklist: happy path;
  reload keeps the same guest empire; two devices = two guests; cap
  rejection (needs a temporarily lowered `SIMULATION_MAX_SEASON_GUESTS` on
  staging, since the default is now uncapped: ask before changing); rally link + Play now spawns near the
  inviter; alliance request shows the locked copy; login probe still
  passes.

#### Rollout order (must not be reordered)

1. PR 1 merged and deployed to staging, then prod. (A new client against a
   server without PR 1 would treat guests as ordinary players: no
   allowance, no diplomacy lock.)
2. Token-verification fix deployed to staging, then prod.
3. Enable the Anonymous provider in the Firebase console. It is
   per-project, so it applies to every client build. The anonymous signup
   endpoint is reachable with the public API key even without the button,
   which is exactly why steps 1-2 come first.
4. PR 2 to staging, verify, then prod.

#### Risks

- In-app browsers (Instagram/TikTok/Discord) may not persist storage. A
  guest opening the same link later in a real browser starts over. PR 3's
  badge copy must say the guest empire lives in this browser only.
- Every guest is invisible until they save their empire; watch
  `sim_season_guest_players`, `sim_guest_join_rejected_full_total` and
  `guest_start` vs `guest_upgrade` after launch.

### PR 3 — "Save your empire": implementation plan (2026-09-28)

Client-only, plus the small gateway fix already made on PR 1 (see below).
Branch `agent/guest-save-empire` (contains PRs 1, 2a and 2b; open it against
`develop` and note the dependency).

#### Behaviour

1. A guest sees a small **"Guest - save your empire"** badge in the game. It
   opens the **Save your empire** panel. The panel also opens by itself
   (a) when the guest tries to make an alliance or truce (`GUEST_DIPLOMACY_LOCKED`)
   and (b) once per browser after about 10 minutes of play.
2. The panel offers **Continue with Google** and **email me a link**, says what
   saving gives (keep the empire, alliances and truces, season emails) and that a
   guest empire lives only in this browser.
3. Saving = Firebase **account linking** on the current anonymous user
   (`linkWithPopup` / `linkWithCredential`). The uid does not change, so the
   empire follows the player with no server migration (PR 1 design).
4. After a successful link the client refreshes the ID token and **reloads the
   page**. The reload sends a fresh `AUTH`, the gateway sees a real account,
   PreparePlayer frees the guest slot, and INIT asks for the normal name and
   colour step (their first real choice is free: the guest profile was never
   complete). A reload was chosen over re-authenticating the open socket: it is
   the path every login already takes.
5. **Conflict** (the Google account or email already has an empire): show
   "That account already has an empire" with **Switch to that empire** (the guest
   empire stays behind and cannot be recovered) or **Keep playing as guest**.
   Switching = `signInWithCredential` (Google) / `signInWithEmailLink` (email),
   then reload.
6. Email link: the link is sent with `sendSignInLinkToEmail`. When it is opened
   in this same browser, `completeEmailLinkSignIn` must **link** instead of
   signing in whenever the current user is anonymous (signing in would replace
   the guest session and strand the empire). It waits for `auth.authStateReady()`
   first, because the persisted anonymous user is not loaded yet at page load.

#### Limits to be honest about in the UI

- **A guest empire cannot leave the browser it was started in** (Firebase
  stores the anonymous session in that browser's storage). Inside an in-app
  browser (Instagram, TikTok, Discord) Google sign-in is blocked, and an email
  link opens in a different browser that cannot see the guest, so the link would
  create a *new* account and strand the empire. In an in-app browser the panel
  therefore explains this and offers neither option. These are exactly the
  players arriving from rally links, so it is worth a follow-up (see Open items).
- Clearing site data loses a guest empire. The badge and panel say so.
- Email+password linking from the earlier sketch is dropped: the sign-in card
  does not offer email+password, only Google and email link.

#### Fix made on PR 1 for this PR

The gateway detected guests from `sign_in_provider === "anonymous"`. That claim
describes how the session started and may not change when a provider is linked,
which would leave a player who just saved their empire permanently a guest
(no alliances). A guest is now an anonymous token with **no email and no linked
identities** (commit `d40d8e80a` on `agent/guest-play`). Not verified against
real Firebase: needs a staging check after linking.

#### Files

New: `client-guest-save/client-guest-save.ts` (linking, conflict, email link,
reload), `client-guest-save/client-guest-save-panel.ts` (badge, panel, nudge),
their tests, `client-guest-save-style.css`.

Edits (line limits respected; `client-network.ts` and `client-hud.ts` are over
the cap and get no new lines): `client-auth-flow.ts` (email-link completion
links when anonymous; badge sync call), `client-network.ts` (in place: open the
panel on `GUEST_DIPLOMACY_LOCKED`), `client-auth-flow-analytics.ts`
(`guest_upgrade`, `guest_upgrade_conflict`; upgrade also logs `sign_up`),
`main.ts` (css), changelog.

`guest_slots_full` analytics from the earlier list is dropped: the simulation
already counts it (`sim_guest_join_rejected_full_total`).

#### Tests

Link success (token refresh, reload, `sign_up` + `guest_upgrade` logged);
popup closed (silent); conflict for Google and for email (credential kept,
Switch signs in and reloads, Keep closes, `guest_upgrade_conflict` logged);
email link sends to the current page and remembers the email; email-link
completion links for an anonymous user and signs in for anyone else, after
`authStateReady`; in-app browser blocks saving; nothing acts on a non-guest;
badge mounts only for a guest and unmounts on upgrade; nudge fires once per
browser; diplomacy error opens the panel.

### Later — idle-guest cleanup (only if needed)

Trigger (raised in priority on 2026-09-28, since guests are now uncapped
and can fill the whole season): idle guests are taking a meaningful share
of the season cap. Remove
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
  (changed to 100 on 2026-09-28, see decision 1)
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

### PR 2 ("Play now") — built 2026-09-28, on `agent/guest-play-client`

Stacked on PR 1 (`agent/guest-play`) and PR 2a (`agent/unique-display-names`);
not pushed. Lint, `check:file-lines`, the changelog check and the full test
suite pass. Nothing has been exercised against real Firebase.

Built as planned: the button and divider, `client-guest-play/` (sign-in,
rejection handling, auto-join gating, returning-account emphasis),
`guest_start` analytics, guest auto-join in the join screen, `GUEST_SLOTS_FULL`
and guest `SEASON_FULL` routing, rally invite copy, new CSS file, changelog
entry `2026.09.28.2`.

Additions beyond the plan (all forced by the decisions above):
- Server: optional `profileComplete` flag on `setProfile` (both stores),
  guest provisioning, INIT flag, reserved name pattern, counter
  `gateway_guest_profile_provisioned_total`.
- The suggested default name no longer uses the email's local part (it would
  show part of a person's email address to everyone); such players get a
  `House <Surname>` instead.
- Client: `authIsGuest` state (from Firebase's `user.isAnonymous`), "Guest"
  label instead of "Authenticated user", guest-specific loading text.
- Test support: shared WebSocket helper (`gateway-test-client.ts`) and shared
  `bindClientNetwork` harness; the localStorage helpers moved out of
  `client-auth-flow.ts` into `client-safe-storage/`.

Visual check: the sign-in card was inspected in a browser at desktop and phone
width in both button states (primary and secondary), no console errors. The
sign-in itself was not clicked: it would hit the real Firebase project.

#### Open items before this can ship

1. **PR 3 must ship with, or straight after, this PR.** Until then a guest
   cannot save their empire, and the diplomacy-lock message tells them to
   "save your empire to a real account", which does not exist yet.
2. The token-verification fix must be deployed (separate session).
3. The Anonymous provider must be enabled in the Firebase console.
4. Real end-to-end verification on staging (checklist under "Verification").
5. Abandoned guests keep their `House Noname <n>` number and colour until an
   idle-guest cleanup exists, so numbers climb. Harmless, but visible.
6. `AGENTS.md` still says changelog entries use `createdAt: Date.now()`; the
   check script rejects that (frozen literal required).

### PR 3 ("Save your empire") — built 2026-09-28, on `agent/guest-save-empire`

Contains PRs 1, 2a and 2b. Not pushed. Lint, `check:file-lines`, the changelog
check and the full test suite pass. **Nothing has been run against real
Firebase**, so linking, the reload and the token claims after linking are
untested end to end.

Built as planned (`client-guest-save/`): the badge, the panel (Google, email
link, email sent, conflict, error, in-app browser), linking with token refresh
and reload, switching on a conflict, email-link completion that links for a
guest (waits for `authStateReady`), `guest_upgrade` / `guest_upgrade_conflict`
/ `sign_up` analytics, the diplomacy trigger and the 10-minute nudge, new CSS
file, changelog entry `2026.09.28.3`.

Checked in a browser against the local stack (simulation + gateway + client,
Firebase blanked so nothing could reach the real project): the badge at desktop
and phone width, the panel at both, and that the badge does not cover the
checklist, Center button or minimap. Two real bugs were found this way and
fixed: `#hud` has `pointer-events: none`, so the badge and panel were not
clickable, and the bottom-left corner is taken (bottom-centre on desktop, a
short "Save empire" label between Center and the minimap on a phone). The
conflict, error and email-sent states were checked as text in the DOM and in
unit tests, not visually.

Not done / to verify on staging:
1. Link Google to a guest, confirm the token afterwards is treated as a real
   account (the gateway rule is "anonymous provider AND no email AND no linked
   identities", so it should not matter whether `sign_in_provider` changes).
2. The email-link path in one browser, and opened in another browser.
3. The conflict path for both methods.
4. **In-app browsers cannot save at all** (see Limits). That is the rally-link
   audience. Options: an "open in your browser" hand-off that carries the empire
   (would need a server-side claim code, i.e. a real feature), or accepting it.
5. A guest who is rejected or signs out leaves an orphan empire; needs the
   idle-guest cleanup.
6. No Escape-to-close on the panel.

