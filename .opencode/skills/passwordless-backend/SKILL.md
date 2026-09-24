---
name: passwordless-backend
description: Use when implementing or changing NestJS authentication, Prisma models, WebAuthn, Google OIDC, sessions, recovery, SMTP, or API endpoints in passkey-back.
---

# Passwordless Backend

Before editing, read `docs/BACKEND_IMPLEMENTATION.md`, `../PASSWORDLESS_IMPLEMENTATION_PLAN.md`, and `../DEPLOYMENT_AND_DEVELOPMENT_ARCHITECTURE.md`.

## Non-negotiable rules

- Implement only passwordless authentication. Never add password fields, password routes, or password recovery.
- Use opaque server-side sessions in secure cookies. Never add JWT access or refresh tokens.
- Use `@simplewebauthn/server` for WebAuthn verification. Never implement custom WebAuthn cryptography or persist private keys.
- Use Google `sub` as the identity key. Never link, merge, or search accounts by email.
- Keep `ExternalIdentity.providerEmail` and `RecoveryEmail` as separate concepts.
- PostgreSQL is the V1 persistence layer. Access temporary WebAuthn challenges only through `ChallengeStore`; do not add Redis.
- A persisted user must retain at least one authentication method. Enforce removal/linking rules in transactions with consistent locking.
- Recovery proof creates `RecoverySession`, never a full `Session`.
- Secrets are one-time and stored only as hashes where applicable. Never log tokens, OTPs, recovery codes, Google tokens, session tokens, challenges, or private keys.

## Implementation direction

- Keep Nest modules aligned with the document: `auth`, `passkeys`, `google`, `sessions`, `step-up`, `recovery`, `email`, `challenges`, `users`, and `security`.
- Keep controllers thin. Put domain decisions and transactions in services; isolate Prisma access in repositories where it makes ownership clearer.
- Validate all DTOs at the boundary. Return stable public errors that do not enumerate accounts or recovery emails.
- Consume a challenge, OTP, Magic Link, recovery code, or OAuth transaction before verifying its response so a failed attempt cannot replay it.
- Require a valid normal session and unexpired step-up for every sensitive operation named in the implementation document.
- Update passkey counters only after a verified assertion and treat counter anomalies as security events.
- Add focused unit/integration tests for every invariant and all state-changing flows.

## Delivery checks

Before completing a change, confirm it does not create a user without an authentication method, expose an authentication secret, bypass step-up, or auto-link by email. Run the relevant backend test and typecheck commands once they exist.
