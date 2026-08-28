# Contributing to Border Empires

Thanks for your interest in contributing. This project is developed largely
by AI coding agents against a strict set of operating rules — please read
`AGENTS.md` before opening a PR; it defines the conventions CI and reviewers
will hold your change to (file-size limits, branch/worktree discipline,
changelog requirements, testing expectations).

## Getting started

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

See `README.md` for the full local dev, worldgen-lab, and deploy workflows,
and `.env.example` for optional local environment variables (nothing is
required to run `pnpm dev`).

## Before opening a PR

Run the full local gate — there is no GitHub Actions CI on pull requests, so
this is the actual verification step:

```bash
pnpm ci:local
```

This runs the file-line gate, builds `@border-empires/shared`, lints, tests,
and builds each workspace package in order. A failing check here will fail
review.

Additional requirements:

- **Regression tests**: any bug fix needs a test that fails before the fix
  and passes after.
- **Changelog entries**: any user-visible gameplay, client, shared-rules, or
  server behavior change needs a new entry in
  `packages/client/src/client-changelog/client-changelog-data.ts`
  (`CLIENT_CHANGELOG_ENTRIES`), with `createdAt: Date.now()`. Append it
  anywhere in the array — entries are sorted by timestamp at render time.
- **File size**: new source files must stay at or under 500 lines; files
  already at or under 500 lines may not cross it; files already over 500
  may not grow. Extract a cohesive piece into its own file rather than
  compacting code to dodge the limit.
- **Strict typing**: no `Record<string, any>`, untyped dependency bags, or
  broad `unknown`/`any` casts for module wiring.

## Reporting bugs / requesting features

Open a GitHub issue with steps to reproduce (for bugs) or the problem you're
trying to solve (for feature requests). Please don't include personal data,
credentials, or live-server admin tokens in issue reports.

## Security issues

Do not open a public issue for a security vulnerability — see
`SECURITY.md` for how to report it privately.
