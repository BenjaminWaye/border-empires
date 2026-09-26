# Concurrent Agent Coordination

Status: canonical runbook

Many agents and humans edit, merge, push, and deploy this repo concurrently. Treat every shared resource as contended.

## Worktree lifecycle (post-merge cleanup)

- Treat worktree deletion as a cleanup step **only after** the work is safely merged or otherwise archived. Do not use stale-worktree cleanup as a token-saving tactic.
- Before deleting any worktree, create a recovery point for unmerged work (branch, tag, or bundle) and verify the target commit is reachable from a preserved ref.
- After a normal feature PR merge, the task is not complete until you verify the merge commit is reachable from `origin/develop`, remove the merged worktree, delete the local feature branch, and delete the remote feature branch. For an explicitly requested hotfix PR to `main`, use `origin/main` instead.
- If an automated merge command claims it deleted the branch or worktree, verify yourself with `git worktree list`, `git branch --list`, and `git branch -r --list` before reporting cleanup done.
- Never report "merged" or "done" for a branch-backed task until the post-merge cleanup verification has succeeded, or you explicitly tell the user which step is still pending.

## Branching and pushing

- For normal feature work, always `git fetch origin && git rebase origin/develop` immediately before pushing your branch, even if you just rebased a moment ago. Substitute `origin/main` only for an explicitly requested hotfix PR to `main`.
- When pushing, use `git push --force-with-lease`, never plain `--force` or `-f`. `--force-with-lease` refuses if the remote moved since your last fetch.
- Set a unique committer identity per agent thread (`git config user.email "agent-<slug>@border-empires"`) so `git log --author=` can find lost commits later.
- Before any history-rewriting operation (`rebase`, `reset --hard`, branch deletion, `--force-with-lease` push), confirm the commits you might orphan are reachable from at least one preserved ref.
- Before deleting a merged feature branch, verify the feature tip is contained in the branch that accepted the PR (`origin/develop` for normal work), not just in the PR UI or another remote branch ref.

## Verifying your work survived

- After every commit: `git log -1 --stat` and confirm the listed files match what you just edited. Catches linters/autosaves/other agents reverting edits.
- After every normal-work rebase or pull: `git diff $(git merge-base HEAD origin/develop)..HEAD --stat` and confirm your intended files are still in the diff. Do not skip — lost commits look exactly like a clean rebase. For an explicit `main` hotfix, substitute `origin/main`.
- Before merging a PR, scan `git reflog | head -20` for unintentional `reset:` or `checkout:` lines. Recover from reflog if a commit went missing.
- After merging, re-check `git worktree list`, `git branch --list <branch>`, `git branch -r --list origin/<branch>`.

## Working-tree contention

- One worktree per agent. Never edit files in a directory another agent is also editing.
- If a file you just wrote is being modified back (a "linter or other agent reverted my change" signal), stop editing in that directory and confirm with the user. You are racing another writer.
- `packages/client/src/client-changelog/client-changelog-data.ts` is append-only and timestamp-sorted, so two agents adding entries in parallel no longer collide on list position or a shared `version` field. It's still fine to add your entry any time during the branch, including early.

## Merge conflicts

- After pulling the latest target branch (`develop` for normal feature work), if conflicts occur, do not hand-merge old and new code together.
- Treat conflicted files as stale integration points: read the updated target-branch version first, then rewrite or reapply the intended feature work onto that updated file.
- Prefer replacing the conflicted implementation with a fresh version based on the current target branch rather than trying to preserve both sides.
- After reapplying onto the updated target branch, rerun relevant builds/tests before merging or deploying.

## Recovery patterns

- **Lost commit** (code disappeared after rebase/checkout): `git reflog` → find the SHA → `git branch recovered/<slug> <sha>` to pin it. Then cherry-pick onto a fresh branch off the current target branch (`origin/develop` for normal feature work).
- **Force-push collision** (your `--force-with-lease` rejected): `git fetch origin && git log origin/develop` to see what landed, then rebase your branch on top and try again. Use `origin/main` only for an explicit hotfix.
- **Concurrent changelog entries**: entries are timestamp-sorted and have no shared version. Rebase the second branch, retain both entries, and resolve only a real textual conflict.
