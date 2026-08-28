# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Border Empires (the game
client, gateway, or simulation server), please report it privately rather
than opening a public GitHub issue.

- Use GitHub's [private vulnerability reporting](../../security/advisories/new)
  for this repository, if enabled, or
- Email **admin@borderempires.com** with a description of the issue, steps
  to reproduce, and any relevant logs or requests. Please do not include
  live-server credentials, admin tokens, or other players' personal data in
  your report.

We'll acknowledge reports as soon as we can and follow up once the issue is
triaged. Please give us a reasonable window to fix the issue before any
public disclosure.

## Scope

In scope: the code in this repository (`apps/`, `packages/`, deploy
configuration) and the deployed instances at `play.borderempires.com` and
`staging.borderempires.com`.

Out of scope: third-party services the game depends on (Fly.io, Vercel,
Firebase Auth, Resend) — please report issues in those directly to the
respective vendor.
