# Implementacion del backend

## 1. Alcance

`passkey-back` es la API NestJS de la plataforma passwordless. Es responsable de verificar autenticacion, persistir el dominio, emitir y validar sesiones opacas, enviar correo por una abstraccion SMTP y aplicar todas las reglas de seguridad.

No renderiza UI, no contiene logica de negocio ajena a autenticacion y recovery, no usa Redis en V1 y no implementa passwords ni JWT.

Documentos de referencia obligatorios:

- `../PASSWORDLESS_IMPLEMENTATION_PLAN.md`
- `../DEPLOYMENT_AND_DEVELOPMENT_ARCHITECTURE.md`

## 2. Tecnologias

| Area          | Decision                                 |
| ------------- | ---------------------------------------- |
| Runtime       | Node.js LTS.                             |
| Framework     | NestJS con TypeScript.                   |
| ORM           | Prisma 7.                                |
| Base de datos | PostgreSQL.                              |
| WebAuthn      | `@simplewebauthn/server`.                |
| Google        | Validacion OIDC server-side.             |
| Email         | `EmailProvider` con implementacion SMTP. |
| Sesiones      | Cookies con tokens opacos server-side.   |
| Tests         | Jest/Vitest para unidades e integracion. |

## 3. Estructura de modulos

```text
src/
├── app/
├── config/
├── database/                 # Prisma client, transacciones y migraciones
├── users/                    # User y profile minimo
├── passkeys/                 # Registration y assertion WebAuthn
├── google/                   # OIDC, callback y linking
├── auth/                     # Flujos publicos y emision de sesiones
├── sessions/                 # Cookie, validacion, listado y revocacion
├── step-up/                  # Prueba reciente con passkey o Google
├── recovery/                 # Recovery email, codigos y recovery sessions
├── email/                    # EmailProvider, SMTP y templates
├── challenges/               # ChallengeStore PostgreSQL
├── rate-limit/
├── security/                 # Guards, CSRF, logging y errores publicos
└── common/                   # DTOs, clock, random source y utilidades puras
```

Los controllers solo validan DTOs, obtienen contexto HTTP y delegan. Las decisiones de dominio, mutaciones y transacciones se implementan en servicios.

## 4. Modelo Prisma

Entidades principales:

```text
User
PasskeyCredential
ExternalIdentity
RecoveryEmail
RecoveryCode
EmailChallenge
Session
RecoverySession
WebAuthnChallenge
OAuthTransaction
```

`OAuthTransaction` persiste `state`, `nonce`, tipo de operacion (`LOGIN_OR_SIGNUP`, `LINK`, `STEP_UP`, `RECOVERY_RESTORE`), usuario/sesion opcionales, `expiresAt` y `consumedAt`. Su state y nonce se generan aleatoriamente, se conservan solo mientras dure la transaccion y se consumen antes de aceptar el callback OIDC. TTL inicial: cinco minutos.

Restricciones obligatorias:

```text
PasskeyCredential.credentialId: unique
ExternalIdentity(provider, providerSubjectId): unique
ExternalIdentity(userId, provider): unique
RecoveryEmail.userId: unique
RecoveryEmail.normalizedEmail: unique
Session.tokenHash: unique
RecoverySession.tokenHash: unique
```

La regla de ultimo metodo de autenticacion no se resuelve con un indice. Para eliminar passkey o Google, una transaccion bloquea al usuario, cuenta passkeys y Google actualizados y rechaza la operacion si el resultado seria cero metodos.

## 5. Contrato HTTP

Prefijo global: `/api`. Todas las respuestas JSON usan una forma consistente:

```json
{ "data": {} }
```

Los errores publicos usan:

```json
{
  "error": {
    "code": "STEP_UP_REQUIRED",
    "message": "Verify it is you to continue."
  }
}
```

No se devuelve informacion que confirme si un email, usuario o identidad existe cuando el flujo es publico.

### Rutas publicas

| Metodo y ruta                                   | Funcion                                                 |
| ----------------------------------------------- | ------------------------------------------------------- |
| `POST /api/auth/passkey/registration/options`   | Crea challenge para registro inicial con `displayName`. |
| `POST /api/auth/passkey/registration/verify`    | Verifica registro, crea User, credencial y sesion.      |
| `POST /api/auth/passkey/authentication/options` | Crea challenge discoverable de login.                   |
| `POST /api/auth/passkey/authentication/verify`  | Verifica assertion y crea sesion.                       |
| `GET /api/auth/google/start`                    | Crea OAuthTransaction y redirige a Google.              |
| `GET /api/auth/google/callback`                 | Consume transaccion, valida OIDC y redirige a frontend. |
| `POST /api/auth/logout`                         | Revoca sesion actual y limpia cookie.                   |
| `GET /api/auth/me`                              | Devuelve usuario autenticado y estado basico.           |

### Step-up y metodos de inicio

| Metodo y ruta                         | Funcion                                                   |
| ------------------------------------- | --------------------------------------------------------- |
| `POST /api/step-up/passkey/options`   | Challenge de passkey ligado a sesion.                     |
| `POST /api/step-up/passkey/verify`    | Marca `stepUpExpiresAt`.                                  |
| `GET /api/step-up/google/start`       | OAuthTransaction ligada a sesion.                         |
| `GET /api/step-up/google/callback`    | Verifica Google y marca step-up.                          |
| `GET /api/security/passkeys`          | Lista passkeys.                                           |
| `POST /api/security/passkeys/options` | Challenge para agregar passkey; requiere step-up.         |
| `POST /api/security/passkeys/verify`  | Persiste passkey; requiere step-up.                       |
| `PATCH /api/security/passkeys/:id`    | Renombra passkey; requiere step-up.                       |
| `DELETE /api/security/passkeys/:id`   | Elimina passkey si queda metodo valido; requiere step-up. |
| `GET /api/security/google`            | Devuelve estado Google.                                   |
| `GET /api/security/google/connect`    | Inicia linking; requiere step-up.                         |
| `GET /api/security/google/callback`   | Vincula si el `sub` no es de otro User.                   |
| `DELETE /api/security/google`         | Desvincula si queda metodo valido; requiere step-up.      |

### Recovery y sesiones

| Metodo y ruta                                  | Funcion                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `GET /api/security/recovery`                   | Estado enmascarado de recovery.                                    |
| `POST /api/security/recovery-email/start`      | Crea challenge de verificacion OTP o Magic Link; requiere step-up. |
| `POST /api/security/recovery-email/verify-otp` | Consume OTP y guarda/cambia correo.                                |
| `GET /api/security/recovery-email/verify-link` | Consume Magic Link y guarda/cambia correo.                         |
| `DELETE /api/security/recovery-email`          | Elimina correo; requiere step-up.                                  |
| `POST /api/security/recovery-codes/generate`   | Genera codigos y los devuelve una vez; requiere step-up.           |
| `POST /api/security/recovery-codes/regenerate` | Invalida lote anterior y devuelve uno nuevo; requiere step-up.     |
| `POST /api/recovery/email/start`               | Solicitud publica OTP o Magic Link con respuesta neutra.           |
| `POST /api/recovery/email/verify-otp`          | Prueba email y emite RecoverySession.                              |
| `GET /api/recovery/email/verify-link`          | Prueba Magic Link y emite RecoverySession.                         |
| `POST /api/recovery/code/verify`               | Consume codigo y emite RecoverySession.                            |
| `POST /api/recovery/passkey/options`           | Challenge para restaurar con passkey usando RecoverySession.       |
| `POST /api/recovery/passkey/verify`            | Crea passkey y convierte RecoverySession en Session.               |
| `GET /api/recovery/google/start`               | Google de restauracion usando RecoverySession.                     |
| `GET /api/recovery/google/callback`            | Vincula Google y convierte RecoverySession en Session.             |
| `GET /api/sessions`                            | Lista sesiones activas.                                            |
| `DELETE /api/sessions/:id`                     | Revoca una sesion.                                                 |
| `POST /api/sessions/revoke-others`             | Revoca todas salvo la actual.                                      |
| `PATCH /api/profile`                           | Actualiza `displayName`.                                           |

Las rutas con retorno por navegador (`Google` y `Magic Link`) terminan redirigiendo a una ruta frontend segura que muestra exito o error generico. Los secretos de Magic Link no se incluyen en la URL final de frontend.

## 6. Sesiones y guards

`SessionGuard` obtiene la cookie host-only, calcula su hash y exige una fila no revocada, dentro de `idleExpiresAt` y `absoluteExpiresAt`. Si es valida, actualiza `lastSeenAt` y extiende idle sin superar absolute.

Valores iniciales:

```dotenv
SESSION_IDLE_TIMEOUT_HOURS=24
SESSION_ABSOLUTE_TIMEOUT_DAYS=30
STEP_UP_TTL_MINUTES=5
RECOVERY_TOKEN_TTL_MINUTES=5
```

`RecoverySessionGuard` se aplica solo a rutas `/api/recovery/*` de restauracion. Nunca satisface `SessionGuard`.

`StepUpGuard` requiere `SessionGuard` y `stepUpExpiresAt > now`. La expiracion de step-up devuelve `STEP_UP_REQUIRED`, no cierra la sesion.

## 7. WebAuthn y Google

- Registration inicial: challenge sin User persistido; la verificacion crea User, PasskeyCredential y Session en una transaccion.
- Login: assertion discoverable sin `allowCredentials`; el `credentialId` localiza la credencial y su User.
- Registration adicional: usa `excludeCredentials` de todas las passkeys activas del usuario.
- Cada verification valida challenge, origin, RP ID, user verification y firma mediante SimpleWebAuthn.
- Challenge se consume antes de verificar; fallo o exito lo inutilizan.
- Google valida issuer, audience, firma, expiracion, state y nonce. `sub` es la unica clave de identidad.

## 8. Recovery y email

Los dos mecanismos de correo son OTP y Magic Link. Ambos son de un solo uso, con TTL de cinco minutos y `EmailChallenge` con hash Argon2id. Se usan para verificar un recovery email autenticado y para recuperar acceso desde la pagina publica.

El OTP se verifica mediante POST con `challengeId` y codigo. El Magic Link contiene un identificador de challenge y secreto aleatorio; el backend lo consume, crea la cookie de recovery o aplica la verificacion y redirige sin exponer el secreto posteriormente.

Recovery codes tienen formato legible, se muestran una sola vez, se comparan contra hashes y se marcan `usedAt` atomica e inmediatamente. Regenerar invalida todo el lote anterior.

## 9. Seguridad operativa

- Rate limit server-side para login, registro, recovery y OTP: 10 intentos por 60 segundos en V1.
- CORS limitado al `FRONTEND_ORIGIN`, con credenciales habilitadas.
- CSRF obligatorio para mutaciones autenticadas con cookie.
- DTO validation, limites de payload y encabezados seguros en el borde HTTP.
- Logs estructurados con eventos definidos en el plan principal; usar IDs internos y resultados, nunca secretos.
- Rotar session ID tras cambios relevantes de autenticacion y al restaurar acceso.

## 10. Pruebas requeridas

Las pruebas unitarias cubren servicios, guards y errores. Las de integracion cubren Prisma/PostgreSQL, restricciones unicas y transacciones. Deben existir pruebas para todas las invariantes listadas en `PASSWORDLESS_IMPLEMENTATION_PLAN.md`, incluyendo ultimo metodo, no auto-link, un solo uso, expiracion, recovery session y revocacion inmediata.

Antes de avanzar a frontend integrado, backend debe ofrecer contratos estables y una coleccion de fixtures/fakes sin secretos reales.
