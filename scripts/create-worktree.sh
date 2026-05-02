#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
worktrees_root="$repo_root/.codex-worktrees"
slug="${1:-}"
start_point="${2:-main}"

if [[ -z "$slug" ]]; then
  printf 'Usage: %s <slug-or-branch> [start-point]\n' "$(basename "$0")" >&2
  exit 1
fi

if [[ "$slug" == */* ]]; then
  branch="$slug"
  name="${slug##*/}"
else
  branch="agent/$slug"
  name="$slug"
fi

worktree_path="$worktrees_root/$name"

if [[ -e "$worktree_path" ]]; then
  printf 'Worktree path already exists: %s\n' "$worktree_path" >&2
  exit 1
fi

mkdir -p "$worktrees_root"

if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch"; then
  git -C "$repo_root" worktree add "$worktree_path" "$branch"
else
  git -C "$repo_root" worktree add -b "$branch" "$worktree_path" "$start_point"
fi

if ! pnpm --dir "$worktree_path" install --offline --frozen-lockfile; then
  pnpm --dir "$worktree_path" install --frozen-lockfile
fi

printf 'Created worktree %s on %s\n' "$worktree_path" "$branch"
