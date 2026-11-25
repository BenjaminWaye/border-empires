# Hosted sectors with payment — design for approval

Status: active proposal
Owner: Benjamin Waye (every question in [§13](#13-decisions-for-the-owner) is his to answer)
Last verified: 2026-11-25
Replaces: none. When delivered, the durable parts move to a runbook `docs/agents/hosted-sectors.md` and to [`agents/deploys.md`](agents/deploys.md).

This is Stage 1 of launch-scope item 4 in [`gdd.md`](gdd.md) §9. Nothing is
built yet. Building starts only after the owner has answered §13.

## 1. What is already decided

From [`gdd.md`](gdd.md) §6, §8 and §9 (including the 2026-11-23 decisions in
PR #2948). This plan does not reopen any of them. The owner's later answers
to §13 (no time limit, idle closure, seller) are recorded in `gdd.md` §8 in
the same branch.

- Money never buys power inside a Sector Contest.
- A hosted sector is a private Sector Contest for a host and the people they
  invite, with AI Houses filling the rest.
- One host pays, or a group splits the price through a funding bar. The sector
  opens when it is fully funded. Split funding is the first thing to cut.
- USD 20 for one standard sector. No cheaper tier yet.
- Stripe, on the web only. Purchases belong to the account. Stripe does not
  file VAT or sales tax for the owner.
- A funded sector starts by itself. The owner does not start servers by hand.
- Host options: map size and map type only.
- One free public sector always runs and is not affected.
- Each sector needs its own server.

## 2. How things work today

Checked in the code on `develop` at `a5abbabe`. These facts shape the design.

| Area | Today | Consequence for hosted sectors |
|---|---|---|
| Servers | Two Hetzner CX23 servers, ordered by hand and set up with `deploy/bin/bootstrap-server.sh`. No code calls the Hetzner API. | Automatic creation is all new. |
| Deploy | CI builds one image and runs `ssh deploy@host <sha>`. `BE_ENV` may only be `staging` or `production` and picks `deploy/env/<env>.env`. The image on GHCR is public. | A third environment file (`hosted.env`) and a way to update many servers are needed. |
| Client → server | The WebSocket address is fixed when the client is built (`client-app-runtime-env.ts`). There is no server list. | The client must learn to connect to a sector chosen at run time. |
| Map size | `WORLD_WIDTH` and `WORLD_HEIGHT` are constants compiled into the client and read in about 166 client and shared source files. Server and client must match. | A second map size needs a second client build, or a large refactor. |
| Map type | Two exist: `continents` and `islands` (`packages/shared/src/worldgen/worldgen.ts`). | These are the two choices a host can get. |
| Accounts | Firebase Auth. The gateway checks the token against Google's public keys and needs no secret. A new server with an empty database accepts the same account at once; the player id is the Firebase user id. | Sign-in works on every sector with no extra work. |
| Profile | House name, colour, contest history and rating are stored in each server's own SQLite file. Nothing is shared between servers. | Results from a hosted sector must be copied out before its server is deleted. |
| Who may join | Anyone with an account, up to `SIMULATION_MAX_SEASON_PLAYERS`. No invite or private gating exists. Rally links only choose where a friend lands. | Privacy is all new. |
| Contest start | A server with an empty database creates contest 1 on first boot from its environment variables. World generation takes roughly 30–100 seconds (code comments, not measured here). | Starting a contest needs no manual step. |
| Contest end | Ends when a House holds a victory path for 24 hours. **The 30-day limit in the GDD is not enforced**: `SEASON_LENGTH_DAYS` is never read. | Without a limit, a hosted sector could run, and cost money, for ever. |
| After the end | The ended world stays up. The next contest starts when 10 Houses commit to it or an admin forces it. | A hosted server must not start a second, unpaid contest. |
| Results | The archive, per-player results and rating are written **only when the next contest starts**, not when a winner is crowned. | A server deleted after crowning would lose its results unless they are exported first. |
| Email, alerts | Resend for player email. Slack webhooks for owner alerts. | Both can be reused. |
| Payments | No payment, purchase or entitlement code exists. | All new. |

## 3. The shape of the design

Three parts.

1. **The hosting service** (new, `apps/sector-control`). A small always-on
   program that takes orders, talks to Stripe and Hetzner, keeps the list of
   sectors and members, and deletes servers when their contest is over. It is
   the only place that holds the Stripe key and the Hetzner token.
2. **Sector servers.** One Hetzner server per hosted sector, running the same
   image as production with a `hosted` configuration: members only, one
   contest, then stop.
3. **The client** on `play.borderempires.com`. It gains a hosting page, a "My
   sectors" list, and the ability to connect to a hosted sector.

```
Player ── play.borderempires.com (client)
            │  buy / invite / list sectors          play
            ▼                                        ▼
   Hosting service  ── creates, checks, deletes ──▶  Sector server (one per hosted sector)
   (on the production server)                        s-<id>.borderempires-sectors.com
      │           │
      ▼           ▼
    Stripe     Hetzner Cloud API + DNS
```

### Where the hosting service runs

Recommended: a **separate container on the existing production server**, next
to the game, reached through Caddy at `https://api.borderempires.com/hosting/*`.
It has its own SQLite file and its own secrets file. Staging gets the same
service with Stripe test keys and a separate Hetzner project.

Why not inside the game gateway: the gateway handles untrusted traffic from
every player. A fault there should not be able to reach a token that can create
servers or a key that can refund money. A separate container also means the
game process never loads those secrets.

Why not its own server: about EUR 6 a month more and one more machine to keep
patched, for a program that is idle almost all the time.

The service is written so that a restart at any moment is safe (§6), because
every production deploy will restart it.

## 4. Purchase flow, single host

1. On the hosting page the player picks map type and map size (§8) and presses
   **Host a sector, USD 20**. They must be signed in with a registered account
   (not a guest).
2. The hosting service checks the limits (§11), creates an **order** in state
   `awaiting_payment`, and creates a Stripe
   Checkout Session: one payment of USD 20, cards and wallets, 30-minute
   expiry, with the order id attached.
3. The player pays on Stripe's page. No card data touches our servers.
4. Stripe calls our webhook with `checkout.session.completed`. The service
   checks the signature, marks the order `paid`, and starts creating the
   server (§5).
5. Stripe sends the player back to a status page (§5, "What the player sees").

Stripe Checkout is recommended over a custom payment form: it handles strong
customer authentication, wallets, receipts and card storage rules, and keeps us
out of card-data compliance scope.

### What goes wrong, and what happens

| Case | Handling |
|---|---|
| Payment fails or the player closes the page | The order stays `awaiting_payment`. The player can retry in the same session. At expiry Stripe sends `checkout.session.expired`; the order is cancelled. Nothing was created. |
| Webhook is delivered twice | Every Stripe event id is recorded; a repeat is ignored. Order state changes only move forward, so "paid" twice is a no-op. |
| Webhook never arrives | The status page asks the service, which asks Stripe for the session directly. A check every few minutes does the same for any order still `awaiting_payment`. |
| Player clicks Buy twice | An account may have one open order. The second click gets the same Checkout Session back. |
| Player pays for two sectors on purpose | Not at launch: an account hosts one live sector at a time (§11). The second order is refused until the first has ended. |
| A second server for one order | The Hetzner server is named after the order id, and names are unique in a Hetzner project, so a repeated create fails harmlessly. |
| Refund (issued by the owner in Stripe) | `charge.refunded` arrives. If the sector is not open yet, the order is cancelled. If it is running, what happens is the owner's policy (§13, Q2). |
| Dispute (chargeback) | `charge.dispute.created` alerts the owner at once. The sector's fate is the owner's policy (§13, Q2). A lost dispute costs about EUR 20 in fees, roughly the whole price. |
| Server cannot be created after payment | §10. |

A receipt email comes from Stripe. A "your sector is ready" email comes from us
through the existing Resend integration.

## 5. Creating the server automatically

### Tooling

The **Hetzner Cloud API** over HTTPS, called directly from the hosting service.
No Terraform and no `hcloud` CLI: the service needs four calls (create server,
read server, delete server, create or delete a DNS record), and a state file
kept by another tool would be one more thing to go out of step.

### Steps after payment

1. **Create the server.** `POST /servers` in a Hetzner project that holds only
   hosted sectors: type CX23, Nuremberg, labelled with the order id, with a
   cloud-init script. The script runs a hosted variant of the bootstrap
   (`deploy/bin/bootstrap-server.sh` today needs admin and CI SSH keys and
   `BE_ENV=staging|production`; the variant takes `BE_ENV=hosted` and installs
   no SSH key) and writes this sector's configuration: sector id, map type, map
   size, AI count, human cap, a random admin token, the ticket public key, the
   sending-only email key (Q14), and the address of the hosting service.
   Cloud-init user data is readable from inside the server only, and every
   secret in it is specific to hosted sectors.
2. **Create the DNS name** `<sector id>.borderempires-sectors.com` (ids look like `s-xxxx`) pointing at the
   new server. Sectors use their own domain, `borderempires-sectors.com`
   (registered at Namecheap on 2026-11-25 with Hetzner's nameservers), so the same token can
   manage it. Hetzner DNS does not accept a subdomain such as
   `sectors.borderempires.com` as a zone (its API answered "unsupported tld" when we tried, 2026-11-25), and Namecheap's API can only replace
   all of `borderempires.com`'s records at once, which would put the main game
   at risk; a separate domain keeps any mistake away from it.
3. **The server deploys itself**: pulls the public image at the release the
   production server runs, starts it, and generates the world. Caddy obtains
   the server's own HTTPS certificate (§11 on why not yet a wildcard).
4. **The hosting service polls** `https://s-<id>…/health`. When it answers
   healthy, the sector is marked `open`, the host is added as its first
   member, and the "ready" email is sent.

The first version uses a stock Ubuntu image plus cloud-init, because there is
then no server image to maintain. If the measured wait is too long, a prepared
Hetzner snapshot with Docker and the game image already installed replaces it.

### How long it takes

Not measured yet; measuring it on a test project is an early Stage 2 task.
Estimate from the parts: server create and boot 1–2 minutes, package and Docker
install 3–5 minutes (near zero from a prepared snapshot), image pull about 1
minute, world generation 0.5–2 minutes, certificate a few seconds. So **about
6–10 minutes from a stock image, 3–5 from a snapshot**.

### What the player sees while waiting

A status page that survives a reload and can be closed:

- Payment received ✓
- Starting your server…
- Generating your world…
- Ready: **Enter your sector** and **Invite friends**

It states the expected wait, says an email will arrive when the sector is
ready, and shows the invite link already, so friends can be gathered meanwhile.
If creation is slow or failing it says so plainly (§10).

### Credentials

| Secret | Used by | Where it lives |
|---|---|---|
| Stripe secret key, Stripe webhook signing secret | Hosting service | `/etc/border-empires/hosting-secrets.env` on the production server (live keys) and on staging (test keys). Not readable by the game container. Never in the repo, chat or logs. |
| Hetzner API token, read and write, for the hosted-sectors project only | Hosting service | Same file. A separate Hetzner project means this token cannot touch the production or staging servers. Staging uses a second project. |
| Per-sector admin token | Hosting service and that one sector server | Generated at creation, stored in the hosting database, deleted with the sector. |
| Signing key for membership tickets (§7) | Hosting service (private half); sector servers get only the public half | Same secrets file. |
| Sending-only Resend key (Q14) | Every sector server | Sector configuration, written at creation. Separate from the production key, so it can be revoked alone. |
| Wildcard certificate key for `*.borderempires-sectors.com` (§11) | Hosting service obtains it; every sector server holds a copy | Fetched by each sector server from the hosting service with its own admin token. |

During Stage 2 development, test-mode keys and a test-project token are asked
for through the secure credential request. Live keys are entered by the owner
on the server and are never seen by an agent.

### Keeping sector servers on the current release

The client is served from `play.borderempires.com` and changes with every
production deploy, so every sector server must run the same release as
production. Recommended: each sector server asks the hosting service every
minute which release to run, and deploys it with the existing
`deploy/bin/deploy` script (which already rolls back an unhealthy release). The
hosting service answers with the release production reports as healthy (its
`/health` release, read after production's own health gate has passed), not
with its own build, so a release production rolls back never reaches sectors.
This is the only call a sector server makes to the hosting service; nothing on
the login path depends on it. No
SSH key that can reach every sector server is stored anywhere. A sector
restart for a deploy is the same short interruption the public sector has
today.

## 6. State kept by the hosting service

One SQLite file, `hosting.db`, beside the game database. Following
[`agents/state-and-persistence-discipline.md`](agents/state-and-persistence-discipline.md):
no in-memory cache is the source of truth, and every table is bounded.

| Table | Holds | Bound |
|---|---|---|
| `orders` | Account, options, Stripe session id, state, timestamps | One open order per account |
| `sectors` | Server id, hostname, state, opened and ended times | One live row per paid order; ended rows are small and kept |
| `sector_members` | Sector, account, role (host or member), joined time | Human cap per sector |
| `sector_invites` | Sector, code, uses left, expiry | A few per sector |
| `contributions` | Split funding only: order, account, amount, Stripe payment id | Minimum contribution caps the count |
| `stripe_events` | Processed event ids | Pruned after 90 days |
| `hosted_results` | Final standings and per-player results of ended sectors | Kept; one row per player per sector |

Every order and sector moves through named states (`awaiting_payment → creating → open →
ended → deleted`, plus `open → deleted` for an idle closure, `cancelled` and
`refunded`). A loop that runs every minute picks up anything not in a resting
state and performs the next step. Each step is safe to repeat. That is what
makes a restart in the middle of creating a server harmless. Counters and a
gauge for each state are exported for the admin page.

## 7. Invitations and privacy

**What "private" means here (recommended):** only members can connect and
play; the sector is not listed anywhere public. It is unlisted, not secret:
its address is random, but the server's public standings endpoints still answer
anyone who has the address. Hiding those too is possible and is Q9.

- **Membership** lives in the hosting service. The host is the first member.
- **Invite link.** The host creates a link such as
  `play.borderempires.com/h/<code>`. A friend who opens it signs in (or
  creates an account) and becomes a member, until the human cap is reached.
  The host can revoke a link and make a new one.
- **Entering.** When a member opens a sector, the hosting service gives the
  client a short-lived signed **ticket** naming the sector and the account.
  The client connects to the sector server and presents it with the usual
  sign-in token. The sector server checks the ticket's signature with a public
  key and refuses anyone without one. It keeps no member list of its own and
  makes no call to the hosting service at login, so a hosting-service restart
  does not lock players out.
- **Guests** (anonymous "Play now" accounts) cannot host and, as recommended in
  Q8, cannot join: a guest account is easily lost, and guests are locked out
  of diplomacy, which is most of the point of playing with friends.
- **Removing a member.** Before the member has landed, the host can remove
  them. After landing, only the owner can, so a host cannot kick a rival who
  is winning.
- **Profile.** A hosted sector is a fresh server, so a member's House name and
  colour are copied in from the public sector on first entry.
- **My sectors.** The client shows the public sector plus every hosted sector
  the account belongs to, with the day of the contest and whether it has
  ended.

## 8. Host options

Chosen on the hosting page before paying, stored on the order, and fixed for
the life of the sector.

- **Map type:** Continents or Islands, the two that exist. Islands is not used
  on staging or production today and had a slow-generation problem in the
  past, so it gets a generation and playtest check before it is offered. If it
  fails, launch has one map type and the option is hidden.
- **Map size:** the server accepts any size, but the client does not (§2).
  Recommended for launch: build the client once per offered size and publish
  each build under its own path on `play.borderempires.com`; the "My sectors"
  list sends the player to the build that matches the sector. This keeps one
  sign-in for all sectors. Making map size a run-time value instead touches
  about 166 source files and is too large for launch. Which sizes are offered
  is Q6.
- **AI Houses** fill the rest: a standard sector is 60 AI Houses and room for
  40 humans, the configuration measured in
  [`load-results/sector-memory-2026-11-23.md`](load-results/sector-memory-2026-11-23.md).

## 9. When the contest ends: teardown

A server is billed for every hour it exists, running or not, so it must be
deleted, not stopped.

1. **End.** The contest ends when a House holds a victory path for 24 hours,
   as today. There is no time limit (owner decision 2026-11-24). To stop a
   forgotten sector costing money for ever, a sector that **no human has
   visited for 7 days is closed**: its results are saved and its server is
   deleted, with no look-around period. Members are emailed two days before.
   AI Houses playing on do not count as a visit.
2. **No second contest.** In hosted mode the server does not offer "commit to
   the next contest" and never rolls over.
3. **Look-around period.** The ended world stays up for a few days so members
   can look at the final map (Q7 sets how long; 3 days recommended).
4. **Export.** The hosting service reads the ended contest's summary from the
   sector server's existing `GET /hq/summary`, which already carries what a
   rollover archives: winner, full standings, House Charges and records. It
   builds the archive record from that and stores it in `hosted_results`. No
   new endpoint on the game server is needed. A contest closed before anyone
   was crowned (idle closure, or a refund under Q2) has standings but no
   winner, awards or House Charges, since those are set at crowning; its
   profile entry shows the standing only, marked as not finished.
5. **Safety copy.** A Hetzner snapshot of the server is taken and kept for 30
   days (a few cents), so a contest can be restored if something was missed.
6. **Delete** the server and its DNS record. The sector is marked `deleted`.

**Kept:** the final results (for the profile, Q4), the order and payment
record, the member list, and the 30-day snapshot. **Not kept:** the live
world, its event log and its per-server social data.

**Account deletion.** The existing deletion flow
([`agents/account-deletion.md`](agents/account-deletion.md)) works per
database, so it is extended to cover what this plan adds: on an accepted
deletion request the hosting service removes the account from
`hosted_sector_members` and `hosted_results` (keeping payment records, which
the law requires, under the purchase-record retention), and sends the deletion
to every live sector the account belongs to through that sector's admin API.
Snapshots expire after 30 days, inside the deletion page's promise; restoring
one re-applies the deletion ledger first, as for any restore. This is part of
PR 4.

The "My sectors" list keeps showing an ended sector with its results.

## 10. Failure handling and alerts

**Server creation fails after payment was taken.** The creation loop retries
with increasing waits, and tries a second location or server type if Hetzner
reports no capacity (several sources report the CX23 as unavailable to order on
some days in autumn 2026). The player's status page says: "Your sector is
taking longer than expected. Your payment is safe and we have been notified."
The owner is alerted on the first failure, not the last. If the sector is still
not open after the time set in Q1, the payment is refunded automatically and
the player is told by email.

**Alerts to the owner**, through the existing Slack webhook and by email:

- a sector creation failing or taking more than 15 minutes;
- a refund issued automatically; any dispute;
- a webhook signature that fails to verify;
- a Hetzner server labelled as a hosted sector with no matching live sector,
  or a live sector whose server is gone (checked every 10 minutes by comparing
  Hetzner's list with ours);
- a sector server unhealthy for more than 10 minutes;
- the number of hosted servers passing an alert mark (§11);
- a teardown that could not export results (the server is then **not**
  deleted).

A daily line in the existing activity digest reports sectors running, opened
and deleted, money taken, and the estimated server cost.

An unmatched server is reported, not deleted automatically, at launch: deleting
a server by mistake loses a paid contest, while leaving one costs cents a day.

## 11. Abuse and fraud limits

- **No cap on hosted sectors** (owner decision 2026-11-23, Q3): sales must
  not stop because the game is growing. In its place: the owner is alerted
  when the count of running sectors passes set marks (10, 25, 50, then every
  50), and when Hetzner refuses a server. A refusal follows the failure path
  in §10, ending in the automatic refund, so money is never kept for a sector
  that cannot be created.
- **One open order and one running hosted sector per account** at launch.
- **Registered accounts with a verified email only.**
- **Stripe Radar** (included) screens cards; Checkout applies strong customer
  authentication when the bank asks for it.
- **Rate limits** on creating orders, invites and contributions.
- **Hetzner's own limit** on servers per project is the one ceiling we do not
  control. The owner asks Hetzner to raise it before launch, and again when
  the alert marks above are passed.
- **Let's Encrypt** issues at most 50 new certificates a week per registered
  domain, here `borderempires-sectors.com` (separate from `borderempires.com`,
  so sectors never use up the main game's allowance). With no cap this would
  stop new sectors in a busy week, so sector servers are to use one wildcard certificate for
  `*.borderempires-sectors.com` instead of one certificate each. A wildcard
  needs a DNS challenge, so the hosting service obtains and renews it with the
  Hetzner DNS token it already holds (sector servers never get that token),
  and each sector server fetches the certificate and key from the hosting
  service with its own admin token, at boot and daily. The cost: a compromised
  sector server exposes the key for all sectors until it is replaced, so the
  certificate is reissued and the old one revoked after any such incident.
  The alternative, if this proves awkward, is to proxy sector WebSockets
  through the production Caddy by path.
  **As built in PR 4 (2026-11-25):** each sector server's Caddy still
  obtains its own certificate. That works up to about 50 new sectors a week
  (fewer if staging and production also renew in the same week); the
  `sector_running_count` alerts give warning. The wildcard follows before
  sales open, and the owner is told if it has not landed by then.
- **A kill switch**: one setting turns sales off without a deploy. Running
  sectors are not affected.

## 12. Split funding (the funding bar)

Built last; cut first.

1. A player opens a funding bar instead of paying in full: they choose the
   options and get a link to share. A bar has a deadline.
2. Each contributor pays their part through Stripe Checkout. The minimum
   contribution is USD 5, because Stripe's fixed fee per payment (about
   EUR 0.25) makes smaller parts poor value.
3. **Recommended mechanism: hold, then capture.** A contribution places a hold
   on the card and takes no money. When the bar is full, all holds are
   captured and the server is created. If the deadline passes first, the holds
   are released and nobody is charged, so there are no refunds and no refund
   fees. Card holds last about 7 days, so the deadline is 72 hours.
4. The player who opened the bar is the host. They may pay the rest at any
   time to start at once.
5. An account may have one open bar.

The alternative, charging each contribution at once and refunding all if the
bar does not fill, allows a longer deadline but loses Stripe's fee on every
refunded contribution. What happens to a half-funded bar is Q10.

## 13. Decisions for the owner

Each has a recommendation. A row marked "Decided" is the owner's answer; the
answers given as "accepted as recommended" below count the same.

**Owner answers, 2026-11-23:** Q1 and Q2 (refunds and disputes) accepted as
recommended. Q3: no cap. Q4 (shown on the profile, not counted toward rating)
accepted. Q6 (Standard and Small, both USD 20) accepted.

**Owner answers, 2026-11-24:** Q5: no time limit; a hosted sector is closed
after 7 days with no human visit. Q7–Q11, Q14 and Q15 accepted as recommended.
Q16: the owner is setting up the Hetzner project and the Stripe account. Still
open: Q12 (legal pages and seller details) and Q13 (tax).

**Owner answer, 2026-11-24:** the seller is TIDN AB. Drafts for Q12 are in
[`legal-drafts/README.md`](legal-drafts/README.md) and a proposal for Q13 in
[`hosted-sectors-tax.md`](hosted-sectors-tax.md). The company details
are filled in; both still need a legal review and the accountant's
confirmation, and sales stay off until then. One point changed Q1(b): for EU,
EEA and UK consumers the drafts give a 14-day right to withdraw with a
deduction for days used, because "no refund once opened" is unlikely to hold
for a service there. The right ends once the contest has ended.

**Owner answer, 2026-11-25:** the withdrawal right above is approved. Still
open: the owner suggested removing the accounts of players who withdraw. It is
not built. Removing a whole account for using a statutory right is likely to
count as penalising that right, and would take the player's profile,
cosmetics and other contests with it; the recommendation is that a withdrawal
ends access to that one hosted sector only, which the refund already does
(Q2). Waiting for the owner's answer after reading this.

**Review of the drafts, 2026-11-25:** lists what the checkout, the hosting
service and the emails must still do before sales open (among them a
withdrawal button, two separate tick-boxes, proof of consent, a confirmation
email and partial refunds), in
[`legal-drafts/README.md`](legal-drafts/README.md#what-the-code-and-settings-must-do-before-sales-open).
The Stripe test-mode work does not do these yet.

| # | Question | Recommendation |
|---|---|---|
| Q1 | **Refund policy.** (a) If the sector cannot be created after payment, when is the money returned? (b) Can a host ask for a refund once the sector is open? | (a) Automatic full refund if the sector is not open 24 hours after payment; the owner is alerted from the first failure and can fix or refund sooner. (b) No refund once the sector has opened, stated at checkout, with the owner free to make exceptions by hand in Stripe. EU, EEA and UK consumers keep a 14-day right to withdraw from a service even when they ask for it to start at once; the consent at checkout only allows a deduction for the days used. See the note above this table; have this wording checked. **Accepted 2026-11-23. (b) decided 2026-11-25: EU, EEA and UK consumers get the 14-day withdrawal with a deduction for days used, as drafted.** |
| Q2 | **A refund or dispute on a running sector.** | **Accepted 2026-11-23.** Refund by the owner: the sector is closed and deleted after its results are saved. Dispute: the sector keeps running for the other players, the owner is alerted, and the disputing account cannot buy again until it is settled. |
| Q3 | **Cap on hosted sectors running at once.** | **Decided 2026-11-23: no cap.** See §11 for the alerts that replace it. (The recommendation was 5 at launch.) |
| Q4 | **Does a hosted contest count toward rating and the public profile?** | **Accepted 2026-11-23.** Show it on the profile, marked "Hosted", with placement and House Charges. Do not count it toward the rating: a host could farm rating in a sector of AI Houses and friends. |
| Q5 | **The 30-day limit.** Is it enforced for hosted sectors, and who wins at the limit? Does the same rule apply to the public sector? | **Decided 2026-11-24: no time limit.** A hosted sector is closed after 7 days with no human visit; see §9. No game rule changes. (The recommendation was to end at day 30.) |
| Q6 | **Which map sizes are offered**, all at USD 20? | **Accepted 2026-11-23.** Standard (640×320, 60 AI Houses, 40 human places) and Small (320×160, 20 AI Houses, 12 human places; this size ran on staging in October). No size larger than standard until its memory is measured. If per-size client builds prove fragile, launch with Standard only. |
| Q7 | **How long an ended sector stays up** before deletion. | **Decided 2026-11-24, as recommended.** 3 days. Each day costs about EUR 0.20. |
| Q8 | **May guest accounts join a hosted sector?** | **Decided 2026-11-24, as recommended.** No. Hosts and invited players need a registered account. |
| Q9 | **How private is private?** | **Decided 2026-11-24, as recommended.** Unlisted and members-only to play; standings are not secret from someone who has the address. |
| Q10 | **A funding bar that never fills.** | **Decided 2026-11-24, as recommended.** Holds are released at the 72-hour deadline and nobody is charged. Contributors are emailed. The host can reopen a new bar. |
| Q11 | **When does a funded contest start?** | **Decided 2026-11-24, as recommended.** At once, as the GDD pitch says ("starting now"). The invite link exists before payment so friends can be ready. A host-chosen start time is a later option. |
| Q12 | **Legal pages and seller details.** Terms of sale, refund policy, updated privacy policy (Stripe as a provider), and the seller's legal name and address, which EU law requires on the checkout. Who writes them, and under which legal entity is Stripe opened? | The owner provides the entity and has the texts written or reviewed by someone qualified. An agent can draft from a template but must not be the final word. Sales stay off until the pages are live. |
| Q13 | **Tax.** Is the USD 20 price inclusive of VAT? Is Stripe Tax turned on to calculate and collect it (Stripe charges extra for this, and the owner still files)? | Price inclusive of tax, so the player always pays USD 20. Turn Stripe Tax on if the owner's accountant confirms registration; this decision needs the accountant, not an agent. |
| Q14 | **Email from hosted sectors** (attack alerts and so on) needs the Resend key on every sector server. | **Decided 2026-11-24, as recommended.** Yes, with a sending-only key separate from the production key, so it can be revoked alone. |
| Q15 | **Hosted sectors in the phone apps.** The apps fix their server address at build time. | **Decided 2026-11-24, as recommended.** Launch on the web (including the phone browser) only; the apps show hosted sectors in the list and open them in the browser. Native support follows. |
| Q16 | **One-time setup the owner must do by hand:** a Stripe account; a Hetzner project for hosted sectors and its token; a domain for sector servers whose nameservers are Hetzner's. | **Done 2026-11-25:** Stripe test account, Hetzner project and token, and `borderempires-sectors.com` bought with Hetzner's nameservers; the Hetzner zone exists. |

## 14. Cost

Prices are from secondary sources dated June–October 2026 and must be checked
on Hetzner's and Stripe's own price pages before launch.

**Per hosted sector**

| Item | Amount |
|---|---|
| Hetzner CX23 with IPv4 | about EUR 6 a month, billed by the hour (EUR 5.49 + 0.50, before VAT). The GDD's "about USD 10 a month" includes margin. |
| A 30-day contest plus 3 days look-around (contests have no time limit; 30 days is a typical length, not a cap) | about EUR 6.60 |
| 30-day safety snapshot | under EUR 0.10 |
| Stripe Tax, if turned on | 0.5 % of a sale where a registration is added, about USD 0.10 |
| Stripe fee on USD 20 | about USD 0.55 for a European card, up to about USD 1.35 for a card from outside Europe with currency conversion |
| VAT, if the price is inclusive (Q13) | USD 4 of the USD 20 at Sweden's 25% (up to about USD 4.25 at the highest EU rate); none for many others |
| **Left over** | roughly USD 7–12 per sector, depending on the buyer's country and card, after the Stripe Tax fee and before any fees lost on refunds |

A contest that ends early costs less. With no time limit (Q5), a sector that
humans keep visiting runs until someone wins: each extra month costs about
EUR 6, so a contest still going after roughly three months has used up its
USD 20. The 7-day idle rule bounds the cost of abandoned sectors only.

**Fixed costs:** none new. The hosting service runs on the production server,
Hetzner DNS is free, and Stripe has no monthly fee. Stripe Tax, if turned on,
adds a small percentage per payment. A lost dispute costs about EUR 20.

## 15. Order of pull requests

Each is a draft PR against `develop` with tests, and nothing is turned on for
players until the last one. Sales are behind a setting that is off by default.

| # | PR | Needs real money or servers? |
|---|---|---|
| 1 | **Hosted mode on the game server.** `deploy/env/hosted.env`; members-only entry by signed ticket; no next contest. | No. Tested locally. |
| 2 | **Client connects to a chosen sector.** "My sectors" list, connection to an allowed sector address only, per-size client builds and their publishing. | No. |
| 3 | **Hosting service skeleton.** `apps/sector-control`: database, account check, orders and sectors as state machines, invites and members, tickets, with a fake payment and a fake server provider for tests. Compose service and Caddy route. | No. |
| 4 | **Hetzner provider.** Create, DNS, cloud-init, health wait, export, snapshot, delete; the reconciliation check; alerts; sector servers following the production release. | Test project only. **Creating the first real server waits for the owner's explicit go-ahead.** |
| 5 | **Stripe, single host, test mode.** Checkout, webhook, expiry, refunds and disputes, automatic refund on failure, status page, emails, limits and the kill switch. Client changelog entry. | Stripe test mode only. No live keys. |
| 6 | **Staging rehearsal and measurements.** A full test-mode purchase on staging creating a real test server: time to open, a forced failure, a teardown. Results recorded in `docs/load-results/`. | Test project, test mode, with the owner's go-ahead. |
| 7 | **Split funding.** Funding bar, holds and capture, deadline release. | Stripe test mode. |
| 8 | **Launch readiness.** Runbook `docs/agents/hosted-sectors.md`, updates to `deploys.md`, `gdd.md` and `README.md`, legal page links, this plan archived. The owner enters live keys and turns sales on. | **Live charges start only when the owner turns the setting on.** |

PR 7 is dropped first if time is short. PRs 1–3 can be built in parallel.

## 16. Risks and what is not known yet

- **Late-contest memory on real Hetzner hardware is unmeasured** (`gdd.md`
  §11). If a late contest needs a larger server, the cost per sector rises and
  the price is the owner's to revisit. The design does not depend on the
  server type.
- **Time to open is an estimate** until PR 6.
- **Islands** may not be fit to offer (§8).
- **Per-size client builds** add a publish step and a second place for a build
  to be stale; PR 2 must prove the hand-over between builds keeps the player
  signed in.
- **CX23 availability** at Hetzner has been unreliable; the fallback type costs
  more, or needs an ARM image for CAX11.
- **A bad release reaches every sector.** Sector servers follow production
  only after production is healthy, and the deploy script rolls back an
  unhealthy release, but a fault that passes health checks would reach all
  sectors.
- **Players whose public-sector player id differs from their Firebase user
  id** (older accounts matched by email) need their hosted results mapped back
  to the right profile. The hosting service keys everything on the Firebase
  user id and resolves the profile on the production server.
- **Awards and the public web profile** (launch item 6) landed on `develop`
  on 2026-11-24 (#2953, #2954), after this plan was written. They read one
  server's own records. Showing hosted results on the profile (Q4) means
  joining them with the stored hosted results; that is part of the export
  work in PR 4.

## 17. Acceptance criteria

- A registered player can pay USD 20 in Stripe test mode and, without any
  action by the owner, be playing in their own sector with the chosen map.
- A player who is not a member cannot connect to that sector.
- A payment event delivered twice creates one sector. A missing webhook still
  leads to a sector.
- A forced creation failure alerts the owner and ends in an automatic refund.
- When the contest ends, results are saved, the server is deleted, and the
  Hetzner project holds no server for that sector.
- With sales switched off, no payment can be started.
- Nothing bought changes anything inside a contest.

## 18. Verification

Unit tests for every state transition, webhook handling and ticket checks;
an integration test of the whole order life with fake Stripe and fake Hetzner;
the staging rehearsal in PR 6; `pnpm ci:local` on every PR. When delivered, the
runbook and [`agents/deploys.md`](agents/deploys.md) become the canonical
references and this plan is archived.

Lore reviewed; no canon change in this plan. Q5 as decided changes no game
rule, so it needs no canon change.
