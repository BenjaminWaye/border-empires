#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
container_root="$(dirname "$repo_root")"
worktrees_root="$repo_root/.codex-worktrees"

mkdir -p "$worktrees_root"

git -C "$repo_root" worktree list --porcelain | awk '
BEGIN {
  path = ""
  branch = ""
  locked = 0
}
function flush() {
  if (path != "") {
    print path "\t" branch "\t" locked
  }
  path = ""
  branch = ""
  locked = 0
}
/^worktree / {
  flush()
  path = substr($0, 10)
  next
}
/^branch / {
  branch = substr($0, 8)
  next
}
/^locked/ {
  locked = 1
  next
}
/^$/ {
  flush()
}
END {
  flush()
}
' | while IFS=$'\t' read -r path branch locked; do
  [[ "$path" == "$repo_root" ]] && continue
  [[ "$locked" == "1" ]] && continue
  [[ "$path" == "$worktrees_root"/* ]] && continue
  [[ "$path" != "$container_root"/* ]] && continue

  base_name="$(basename "$path")"
  target_name="$base_name"

  if [[ "$target_name" == border-empires-* ]]; then
    target_name="${target_name#border-empires-}"
  elif [[ "$target_name" == wt-* ]]; then
    target_name="${target_name#wt-}"
  fi

  if [[ -n "$branch" ]]; then
    branch_name="${branch#refs/heads/}"
    branch_slug="${branch_name##*/}"
    if [[ -n "$branch_slug" ]]; then
      target_name="$branch_slug"
    fi
  fi

  target_name="${target_name//\//-}"
  target_path="$worktrees_root/$target_name"
  suffix=2
  while [[ -e "$target_path" ]]; do
    target_path="$worktrees_root/${target_name}-${suffix}"
    suffix=$((suffix + 1))
  done

  printf 'Moving %s -> %s\n' "$path" "$target_path"
  git -C "$repo_root" worktree move "$path" "$target_path"
done
