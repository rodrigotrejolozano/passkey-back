---
name: commit-conventions
description: Use when preparing, reviewing, or creating Git commits in passkey-back, including commit messages, staging, and pre-commit verification.
---

# Commit Conventions

Use Conventional Commits:

```text
<type>(<scope>): <summary>
```

## Allowed types

- `feat`: new functionality.
- `fix`: behavior correction.
- `docs`: documentation only.
- `test`: test changes.
- `refactor`: code restructuring without behavior change.
- `chore`: tooling, dependencies, or configuration.
- `security`: security fix or hardening.

## Message rules

- Write messages in English, imperative mood, lowercase summary, and without a final period.
- Keep the summary concise and describe one cohesive change.
- Use a scope when it adds clarity. Preferred scopes: `auth`, `passkeys`, `google`, `recovery`, `sessions`, `api`, `infra`.

Examples:

```text
feat(passkeys): add discoverable credential registration
fix(recovery): consume otp before verification
docs(api): define recovery session endpoints
test(sessions): cover idle timeout rejection
```

## Before committing

1. Inspect `git status` and `git diff`.
2. Inspect recent commit style with `git log --oneline -10`.
3. Run relevant tests and typecheck when available.
4. Stage only intended files explicitly; never use `git add .`.
5. Confirm no `.env`, credentials, tokens, OTPs, recovery codes, or generated secrets are staged.

Do not amend commits, create empty commits, force-push, or bypass hooks unless the user explicitly asks.
