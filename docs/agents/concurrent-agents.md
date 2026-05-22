# Concurrent Agent Coordination

Many agents and humans edit, merge, push, and deploy this repo concurrently. Treat every shared resource as contended.

## Worktree lifecycle (post-merge cleanup)

- Treat worktree deletion as a cleanup step **only after** the work is safely merged or otherwise archived. Do not use stale-worktree cleanup as a token-saving tactic.
- Before deleting any worktree, create a recovery point for unmerged work (branch, tag, or bundle) and verify the target commit is reachable from a preserved ref.
- After a PR merge, the task is not complete until you verify the merge commit is reachable from `origin/main`, remove the merged worktree, delete the local feature branch, and delete the remote feature branch.
- If an automated merge command claims it deleted the branch or worktree, verify yourself with `git worktree list`, `git branch --list`, and `git branch -r --list` before reporting cleanup done.
- Never report "merged" or "done" for a branch-backed task until the post-merge cleanup verification has succeeded, or you explicitly tell the user which step is still pending.

## Branching and pushing

- Always `git fetch origin && git rebase origin/main` immediately before pushing your branch, even if you just rebased a moment ago.
- When pushing, use `git push --force-with-lease`, never plain `--force` or `-f`. `--force-with-lease` refuses if the remote moved since your last fetch.
- Set a unique committer identity per agent thread (`git config user.email "agent-<slug>@border-empires"`) so `git log --author=` can find lost commits later.
- Before any history-rewriting operation (`rebase`, `reset --hard`, branch deletion, `--force-with-lease` push), confirm the commits you might orphan are reachable from at least one preserved ref.
- Before deleting a merged feature branch, verify the feature tip is contained in `origin/main`, not just in the PR UI or another remote branch ref.

## Verifying your work survived

- After every commit: `git log -1 --stat` and confirm the listed files match what you just edited. Catches linters/autosaves/other agents reverting edits.
- After every rebase or pull: `git diff $(git merge-base HEAD origin/main)..HEAD --stat` and confirm your intended files are still in the diff. Do not skip — lost commits look exactly like a clean rebase.
- Before merging a PR, scan `git reflog | head -20` for unintentional `reset:` or `checkout:` lines. Recover from reflog if a commit went missing.
- After merging, re-check `git worktree list`, `git branch --list <branch>`, `git branch -r --list origin/<branch>`.

## Working-tree contention

- One worktree per agent. Never edit files in a directory another agent is also editing.
- If a file you just wrote is being modified back (a "linter or other agent reverted my change" signal), stop editing in that directory and confirm with the user. You are racing another writer.
- Do not edit `packages/client/src/client-changelog.ts` until your branch is ready to merge. Two agents both choosing the same `version` is a structural collision; the changelog should be the **last** file you touch on a branch.

## Merge conflicts

- After pulling latest `main`, if conflicts occur, do not hand-merge old and new code together.
- Treat conflicted files as stale integration points: read the updated `main` version first, then rewrite or reapply the intended feature work onto that updated file.
- Prefer replacing the conflicted implementation with a fresh version based on current `main` rather than trying to preserve both sides.
- After reapplying onto updated `main`, rerun relevant builds/tests before merging or deploying.

## Recovery patterns

- **Lost commit** (code disappeared after rebase/checkout): `git reflog` → find the SHA → `git branch recovered/<slug> <sha>` to pin it. Then cherry-pick onto a fresh branch off current `origin/main`.
- **Force-push collision** (your `--force-with-lease` rejected): `git fetch origin && git log origin/main` to see what landed, then rebase your branch on top and try again.
- **Two PRs both bumped the changelog to the same version**: rebase the second on top of the first, increment the version (`.4` → `.5`), and merge the entries together so neither fix is lost.
