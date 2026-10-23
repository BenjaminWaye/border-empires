# Account deletion

Status: maintained runbook; implementation is pending deployment and release verification.

## Player flow

Settings → Account → Delete account works for saved and unsaved guest accounts.
The public `/delete-account.html` page provides email/password and supported web
provider sign-in without loading the game or creating a guest session.
Password/provider reauthentication and literal `DELETE` confirmation protect saved
accounts; unsaved guests use the installation that holds their anonymous login.
The native flow does not open an OAuth popup.

`POST /account/deletion` verifies Google's token signature, project and authentication
time independently of the normal game resolver. The server chooses the UID and
bound player ID; neither comes from the request body. It durably records the
request **before** calling Firebase's account-delete endpoint with the owner's
token. Tokens/passwords are never persisted. Acceptance removes that Firebase
login and returns a receipt plus a 30-day completion deadline. A timeout keeps the
request recoverable; the dialog retains its original token in memory for retry.
New HTTP/WebSocket authentication is blocked for pending/completed identities and
other logins bound to the same empire. Email reuse cannot reclaim the old empire.
Existing game sockets are closed when the request is accepted; a second check
before socket attachment also rejects an authentication already loading a world.

Game-data erasure is an **operator procedure**, not an automatic background job.
The account holder does not need to contact support to initiate or complete the
normal request. Benjamin Waye must review the queue daily and finish requests
within the disclosed 30 days. Do not describe Firebase deletion alone as completed
data erasure.

## Queue and monitoring

The existing gateway SQLite schema includes `account_deletion_requests`; both
managed environments set `GATEWAY_DB_APPLY_SCHEMA=1`. In-memory development stores
do not expose the deletion endpoint. Pending work is never evicted. The queue has
a 10,000-row admission cap and exports these metrics without identities:

- `gateway_account_deletion_requests{status=...}`
- `gateway_account_deletion_overdue`
- `gateway_account_deletion_capacity_rejections_total`

Check overdue work and capacity failures as operational incidents. Completed
hashed markers are pruned after 45 days when new requests arrive. Keep the
sidecar restoration ledger on the same 45-day retention schedule. Never publish
the ledger, queue contents or private reviewer contact details.
Offline linked-identity markers and the ledger have an additional hard limit of
50,000 entries. Reaching it aborts erasure instead of evicting recovery protection.

Use Node 22.5+; list receipts/deadlines on a private maintenance host:

```bash
node scripts/account-deletion/process-account-deletion.mjs \
  --database /path/to/border-empires.db --list
```

The production Docker image includes these tools and Node. On the Hetzner host,
an administrative shell can run them using the existing mounted data volume:

```bash
cd /opt/border-empires
docker compose run --rm --no-deps --entrypoint node app \
  scripts/account-deletion/process-account-deletion.mjs \
  --database /data/border-empires.db --list
```

## Complete one request

Read [deployment procedures](deploys.md) first. Schedule a maintenance window;
the gateway **and simulation must both be stopped**, with the final checkpoint
finished. Running the tool against a live process can let cached state restore
personal information, even if SQLite permits the write. Do not run this against
production merely to test it; rehearse on an isolated database first.

1. Inspect every linked Firebase UID privately with `--request <receipt-id>
   --identities`. Never paste this output in a public issue. Confirm all related Firebase
   user records are deleted in Firebase Console; the request removed the login
   used to submit it, but older separately bound UIDs can exist. For
   `awaiting_identity`, verify the interrupted Firebase operation and finish it.
2. Dry-run the erasure command. Review table counts. An unknown identity-bearing
   table aborts the operation until its data policy is added explicitly.
3. Stop both processes, rerun with the explicit offline/identity assertions, and
   keep the current ledger outside any old database that might be restored:

   ```bash
   node scripts/account-deletion/process-account-deletion.mjs \
     --database /path/to/border-empires.db --request <receipt-id> \
     --apply --offline --linked-identities-deleted \
     --ledger /private/current/account-deletion-ledger.json
   ```

   For the container variant, run `docker compose stop app` first (the combined
   process checkpoints on shutdown), then use the `docker compose run` command
   above with `--request <receipt-id> --apply --offline
   --linked-identities-deleted --ledger /data/account-deletion-ledger.json`.
   Restart with `docker compose up -d app` only after all copy/restore checks.
   The identity assertion also permits recovery of `awaiting_identity` requests
   after the operator has verified the interrupted Firebase deletion.

4. Process any copies on staging, retired Fly volumes, retained exports, old
   bootstrap files or local operational clones that contain the same account.
   The active environments use `/data/border-empires.db` without legacy snapshot
   directories. An environment using a bootstrap directory must also remove or
   anonymise that directory's identity/profile records before restarting.
5. Remove account-linked support reports from Slack/support correspondence unless
   there is a documented security/legal need to retain them. Do not claim those
   external records were erased by the SQLite tool.
6. Check the completed receipt, foreign keys and retained neighbours. Restart the
   service, verify health/login and confirm the old account cannot return.

The tool deletes profiles, bindings, telemetry, queued commands, invitations and
private per-account rows. Shared world checkpoints, event logs, season summaries,
social relationships and galaxy history retain consistent **random replacement
identifiers**, with account names removed. This preserves other players' world
state without retaining a mapping back to the removed account. The ledger keeps
only hashes, receipts and completion times, including hashes of older linked UIDs.
Erasure and ledger persistence must both succeed before the transaction commits.
The CLI checkpoints/truncates WAL and vacuums deleted page contents afterward.

## Backups and restoration

Before publishing the policy, verify routine and manual backup retention on the
actual services: **no account-bearing backup may remain beyond 30 days after
completion**. Keep backups isolated from normal use, and remove stale manual
exports rather than treating them as permanent archives. This setting cannot be
proved by unit tests or by a successful app upload.

Keep a current deletion ledger separately from the old backup. Before either
process accepts traffic after restoring a database:

```bash
node scripts/account-deletion/restore-deletion-ledger.mjs \
  --database /path/to/restored.db --ledger /private/current/account-deletion-ledger.json
# Review the dry run, then apply while both processes remain stopped:
node scripts/account-deletion/restore-deletion-ledger.mjs \
  --database /path/to/restored.db --ledger /private/current/account-deletion-ledger.json \
  --apply --offline
```

The restore check matches hashed UIDs against the old bindings and reapplies
erasure, including backups that predate the latest login UID. Do not replace the
current ledger with a stale copy from the backup.

## Verification

`pnpm test:scripts` includes transactional erasure/restore tests. Gateway tests
cover ownership, stale/forged claims, target injection, guest deletion, durable
failure/retry, duplicate requests, queue metrics and token replay on both auth
paths. Client tests cover gateway selection, private bearer-token transport,
receipts and retry after Firebase has removed the user. The 2026-10-23 manual
Firebase probe created/deleted one disposable guest, confirmed `USER_NOT_FOUND`,
and proved duplicate-request handling and rejection of the original signed token.
It did not enter a real game or change an existing player's data.

Lore reviewed; no canon change.
