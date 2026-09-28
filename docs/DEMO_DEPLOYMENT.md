# Demo deployment

The demo uses a dedicated Neon database, Render API, Resend sender, and Google
OAuth client. Never reuse local OAuth credentials or commit provider secrets.

## Render and Neon

1. Create an empty Neon PostgreSQL project and copy its pooled connection URL.
2. Create the Render service from `render.yaml`.
3. Set `DATABASE_URL` and every `sync: false` variable in Render secrets.
4. Set `FRONTEND_ORIGIN=https://app.<ROOT_DOMAIN>`.
5. Set `BACKEND_ORIGIN=https://api.<ROOT_DOMAIN>`.
6. Set `WEBAUTHN_RP_ID=app.<ROOT_DOMAIN>` and
   `WEBAUTHN_ORIGIN=https://app.<ROOT_DOMAIN>`.
7. Review every pending SQL migration before deployment. Render runs
   `npm run prisma:migrate:deploy` once as its pre-deploy command.

Never run `prisma migrate dev` against the demo database.

## Resend and DNS

1. Verify `<ROOT_DOMAIN>` in Resend and publish its SPF and DKIM records.
2. Set the Render SMTP variables from `.env.example` and use a verified
   `SMTP_FROM` address.
3. Point `api.<ROOT_DOMAIN>` to Render and verify HTTPS before configuring
   OAuth.

## Google OAuth

Create a separate Web application client for demo. Its only callback is:

```text
https://api.<ROOT_DOMAIN>/api/auth/google/callback
```

Keep JavaScript origins empty because OAuth begins at the backend. Configure
the callback only after both application domains resolve over HTTPS.

## Verification

Run the Playwright suite against the deployed frontend:

```bash
PLAYWRIGHT_BASE_URL=https://app.<ROOT_DOMAIN> npm run test:e2e
```

Then manually verify real Passkey registration/login, Google, OTP, Magic Link,
Recovery Codes, session revocation, and restoration. Inspect browser cookies
for `HttpOnly`, `Secure`, `SameSite=Lax`, host-only scope, and `Path=/`.

Render, Neon, Vercel, and Resend free tiers can sleep, cold-start, throttle, or
pause. The demo provides no SLA or guaranteed backups.
