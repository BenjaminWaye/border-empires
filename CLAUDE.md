# Notes for Claude

## PR review/fix tasks

This repo does not have CI wired up to run on pull requests (no check runs get
created). When asked to "review PR N", "review and fix PR N", or similar
one-off review tasks:

- Do the review, push the fix commit, and post a summary comment. That's it.
- Do NOT call `subscribe_pr_activity` and do NOT schedule check-ins/wakeups
  (`send_later`, `ScheduleWakeup`, etc.) to wait for CI or watch the PR
  afterward — there's nothing to watch, and it wasn't asked for.
- Only subscribe to a PR / schedule follow-up checks when the user explicitly
  asks to "watch", "monitor", "babysit", or "autofix" a PR on an ongoing basis.
