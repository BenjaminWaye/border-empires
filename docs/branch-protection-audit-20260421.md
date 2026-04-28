# Branch Protection Audit — `main` — 2026-04-21

## Incident summary

PR #20 was merged to `main` without proper authorization. It was subsequently
reverted as commit `67eb7b5`. The fact that an unauthorized merge was possible
indicates that branch protection on `main` is either absent or weaker than
required for a project with active beta users and a live production backend.

---

## Step 1: Inspect current rules (Benjamin must run this)

```bash
gh api repos/BenjaminWaye/border-empires/branches/main/protection \
  --jq '{
    required_reviews: .required_pull_request_reviews.required_approving_review_count,
    dismiss_stale:    .required_pull_request_reviews.dismiss_stale_reviews,
    require_codeowner:.required_pull_request_reviews.require_code_owner_reviews,
    required_checks:  [.required_status_checks.contexts[]],
    strict_checks:    .required_status_checks.strict,
    enforce_admins:   .enforce_admins.enabled,
    allow_force_push: .allow_force_pushes.enabled,
    allow_deletions:  .allow_deletions.enabled
  }' 2>&1
```

If the command returns `404 Not Found`, **branch protection is entirely
disabled on `main`** — this is the most likely explanation for the
unauthorized merge.

If it returns a JSON object, compare each field against the gap table below.

---

## Gap table: current (inferred) vs recommended

| Rule | Likely current state | Recommended | Risk if absent |
|---|---|---|---|
| Require pull request before merging | Off or 0 reviews required | **On — 1 approval minimum** | Any committer can push directly to main or self-merge |
| Dismiss stale reviews on new push | Off | **On** | Approval on an old commit carries forward to a re-pushed bad commit |
| Require status checks to pass | Off | **On — `build`, `test`, `typecheck`** | Broken code merges without CI gate |
| Require branches to be up to date | Off | **On** | Stale branch merges hide conflicts |
| Include administrators | Off | **On** | Org owners can bypass all rules; the unauthorized merge may have exploited this |
| Restrict who can push to matching branches | Off | **On — limit to specific actors/teams** | Any collaborator with write access can force-merge or bypass the PR flow |
| Allow force pushes | Likely on (default) | **Off** | History can be rewritten silently on main |
| Allow deletions | Likely on (default) | **Off** | `main` can be deleted |

**Probable root cause of the PR #20 incident:** either (a) no PR review
requirement was set, so an auto-merge or direct push succeeded, or (b)
`enforce_admins` was off, allowing an admin to merge without satisfying review
rules.

---

## Recommended configuration

Apply all of the following together. Run this once as the repo Owner:

```bash
gh api \
  --method PUT \
  repos/BenjaminWaye/border-empires/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "build",
      "test",
      "typecheck"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismissal_restrictions": {},
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false
}
JSON
```

**Important:** `required_status_checks.contexts` must match the exact job
names in `.github/workflows/`. Run `gh api repos/BenjaminWaye/border-empires/commits/main/check-runs --jq '[.check_runs[].name]'` to list the current check names on `main` and substitute the correct values.

---

## Impact on existing CI workflows

Before applying protection:

1. **`nightly-load-harness.yml`** auto-commits load results via
   `git push origin HEAD:main`. With `enforce_admins: true` and PR required,
   this will fail unless either:
   - A `GH_PAT` secret with `contents:write` + branch-protection bypass is
     added (the workflow already falls back to `secrets.GH_PAT || github.token`
     so only the secret needs adding), OR
   - The commit step pushes to a `load-results/*` branch and opens a PR
     instead of pushing directly to `main`.
   
   **Recommendation:** Add a `GH_PAT` secret (see Task 2.5 in the pre-Phase-6
   punch list). This is the minimal change — no workflow edit required.

2. **`nightly-pg-backup.yml`** does not push to `main`. Not affected.

3. **Agent/Claude sessions** that commit and push to `main` will need the
   session to operate through a PR workflow or use a deploy key. Plan
   accordingly before enabling protection on a session that has in-flight work.

---

## Suggested fix (one-paragraph summary)

Enable branch protection on `main` with at least one required PR review,
`dismiss_stale_reviews`, `enforce_admins: true` (no admin bypass), and
force-push disabled. Add a `GH_PAT` repo secret scoped to `contents:write` so
the nightly load-harness auto-commit continues to work. Apply via the `gh api
--method PUT` command above. Do **not** apply protection changes during an
active agent session that is pushing commits directly to `main` — coordinate
the cutover window with the agent first.

---

*This document is informational. No protection changes have been applied.
Benjamin should review and apply the configuration above at a time that does
not interrupt active CI runs or agent sessions.*
