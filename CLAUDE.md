# Notes for Claude

@AGENTS.md

## PR review/fix tasks

`.github/workflows/ci.yml` runs lint, `check:file-lines`, build, and test on
every pull request (any base branch) and on pushes to `develop`/`main` — real
check runs do get created now. `develop` and `main` both have branch
protection requiring the `Lint, test, build` check to pass before merge. See
`docs/agents/deploys.md` for the full branch/deploy flow. When asked to
"review PR N", "review and fix PR N", or similar one-off review tasks:

- Do the review, push the fix commit, and post a summary comment. That's it.
- Do NOT call `subscribe_pr_activity` and do NOT schedule check-ins/wakeups
  (`send_later`, `ScheduleWakeup`, etc.) to wait for CI or watch the PR
  afterward — there's nothing to watch, and it wasn't asked for.
- Only subscribe to a PR / schedule follow-up checks when the user explicitly
  asks to "watch", "monitor", "babysit", or "autofix" a PR on an ongoing basis.
- If a PR is blocked on the required `Lint, test, build` check, do not treat
  that as a broken/nonfunctional gate — check whether CI actually ran and
  what it reported (`gh`/GitHub Actions UI) before assuming the check can
  never report. Never force-merge past a required check as a workaround.
