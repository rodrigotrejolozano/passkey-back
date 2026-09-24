---
name: backend-security-testing
description: Use when writing or reviewing passkey-back tests, rate limits, logging, session handling, recovery behavior, or security-sensitive database transactions.
---

# Backend Security Testing

Read `docs/BACKEND_IMPLEMENTATION.md` before changing test coverage or security behavior.

## Required test mindset

- Test rejection paths as deliberately as successful paths.
- Use deterministic fakes for `ChallengeStore`, `EmailProvider`, clock, random token generator, and Google/WebAuthn verification boundaries.
- Do not place real secrets, recovery codes, OTPs, OAuth credentials, or session tokens in fixtures, snapshots, or logs.
- Integration tests use an isolated PostgreSQL database and apply Prisma migrations before running.

## Invariants to preserve

- A challenge, email proof, OAuth transaction, and recovery code are one-time use.
- Revoked, idle-expired, and absolute-expired sessions are rejected immediately.
- Expired step-up does not invalidate the normal session but blocks sensitive actions.
- The last authentication method cannot be removed.
- Google `sub` and normalized recovery email are globally unique according to their separate constraints.
- Recovery sessions cannot access normal authenticated endpoints.
- Public recovery responses do not reveal whether an account exists.

## Review checklist

- Verify operations that count or delete authentication methods run atomically.
- Verify session identifiers rotate after relevant authentication changes.
- Verify structured logs use event names and safe identifiers only.
- Verify rate limiting is server-side and covers login, registration, recovery, and OTP routes.
- Add Playwright-facing API behavior only after unit and integration coverage establishes the backend contract.
