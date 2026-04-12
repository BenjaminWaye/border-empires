# Release Notes Guardrail

- Any user-visible gameplay, client, shared-rules, or server behavior change must update `packages/client/src/client-changelog.ts` in the same branch.
- Every changelog update must bump the exported release `version` and keep the same structure: `title`, `summary`, and `entries` with `title`, `why`, and `changes`.
- Do not ship or merge a user-visible update if the changelog check fails.
