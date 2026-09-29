# Passkey Backend

API de autenticación sin contraseñas construida con NestJS, Prisma y PostgreSQL.
Implementa Passkeys con WebAuthn, Google OAuth, sesiones con cookies, CSRF,
recuperación de cuenta y verificación adicional para operaciones sensibles.

La interfaz que consume esta API está en el repositorio
[passkey-front](https://github.com/rodrigotrejolozano/passkey-front). El
frontend usa `NEXT_PUBLIC_API_ORIGIN` para apuntar a esta aplicación; por ello
ambos orígenes deben configurarse juntos.

## Qué permite aprender

- Creación y verificación de credenciales WebAuthn.
- Flujos OAuth de Google iniciados y validados exclusivamente en servidor.
- Cookies de sesión `HttpOnly`, `SameSite=Lax` y validación de CSRF.
- Protección de transacciones OAuth contra reutilización y contra otro navegador.
- Recuperación por correo, OTP, enlace mágico, códigos de respaldo y Google.
- Verificación adicional antes de cambiar métodos de acceso o sesiones.
- Persistencia con PostgreSQL y Prisma.

## Arquitectura y relación con el frontend

La API se publica bajo el prefijo `/api`. El frontend realiza las peticiones con
credenciales y no accede a PostgreSQL ni maneja secretos. La relación local es:

```text
passkey-front (http://localhost:3000)
        |
        | HTTP con cookies y CORS con credenciales
        v
passkey-back  (http://localhost:3001/api)
        |
        v
PostgreSQL + SMTP/Mailpit + Google OAuth
```

`FRONTEND_ORIGIN` debe coincidir exactamente con el origen del frontend. También
debe coincidir con `WEBAUTHN_ORIGIN`; `WEBAUTHN_RP_ID` es el dominio sin protocolo
ni puerto. Para rutas, traducciones y comportamiento del navegador, consulta el
[README del frontend](https://github.com/rodrigotrejolozano/passkey-front).

## Requisitos

- Node.js `>=24 <25`.
- npm `>=12 <13`.
- Docker y Docker Compose para PostgreSQL y Mailpit en desarrollo local.
- Una cuenta de Google OAuth si se probará Google real.

## Instalación local

```bash
git clone https://github.com/rodrigotrejolozano/passkey-back.git
cd passkey-back
npm install
cp .env.example .env
docker compose up -d
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

La API queda disponible en `http://localhost:3001/api`. Mailpit recibe los
correos locales en `http://localhost:8025`.

Inicia también el frontend siguiendo su README y conserva estos valores locales:

```dotenv
FRONTEND_ORIGIN=http://localhost:3000
BACKEND_ORIGIN=http://localhost:3001
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3000
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
```

## Variables de entorno

`.env.example` contiene todos los nombres requeridos. Los grupos principales
son:

- `DATABASE_URL`: conexión PostgreSQL.
- `SESSION_SECRET` y `CSRF_SECRET`: secretos largos, aleatorios y diferentes.
- `SMTP_*`: entrega local con Mailpit o proveedor SMTP real.
- `WEBAUTHN_*`: identidad de relying party, origen y TTL del reto.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REDIRECT_URI`: OAuth.
- `SESSION_*`, `STEP_UP_TTL_MINUTES` y `RECOVERY_SESSION_TIMEOUT_MINUTES`:
  caducidad de sesiones y flujos sensibles.

No subas `.env`, secretos OAuth, cadenas de conexión ni claves de sesión al
repositorio. En producción usa el gestor de secretos de la plataforma.

## Flujos de autenticación

### Passkeys

La API entrega retos de registro o autenticación. El frontend abre la interfaz
nativa del navegador y devuelve una respuesta firmada. El backend comprueba la
respuesta contra `WEBAUTHN_RP_ID` y `WEBAUTHN_ORIGIN`, guarda la credencial y
emite una sesión.

### Google OAuth

La API crea una transacción temporal con `state`, `nonce` y un vínculo con el
navegador. Tras el callback de Google consume la transacción, valida el token y
redirige a un destino seguro del frontend. El locale `es` o `en` se conserva en
una cookie temporal asociada a la transacción, sin añadirlo a destinos libres.

### Recuperación y verificación adicional

La recuperación verifica identidad antes de restaurar un método de acceso. Los
enlaces mágicos incluyen el idioma validado para regresar a la interfaz correcta.
Las rutas sensibles requieren sesión, CSRF y, cuando aplica, una verificación
adicional reciente mediante Passkey o Google.

## Comandos útiles

```bash
npm run dev                   # API en modo watch
npm run build                 # Generar cliente Prisma y compilar
npm start                     # Compilar y ejecutar dist/main.js
npm run typecheck             # Comprobar TypeScript
npm run lint                  # Ejecutar ESLint
npm test                      # Pruebas Jest
npm run prisma:generate       # Generar cliente Prisma
npm run prisma:migrate:deploy # Aplicar migraciones existentes
npm run prisma:validate       # Validar esquema Prisma
npm run format:check          # Comprobar formato
```

Usa `prisma migrate deploy` para entornos compartidos. No ejecutes `prisma
migrate dev` contra una base de datos de demostración o producción.

## Seguridad

- Helmet aplica cabeceras de seguridad.
- CORS acepta solo `FRONTEND_ORIGIN` y permite credenciales.
- Las respuestas de autenticación, seguridad, sesiones, step-up y recuperación
  se marcan como privadas y sin caché.
- La validación global elimina campos no permitidos y rechaza los desconocidos.
- Las cookies de sesión y las de OAuth son `HttpOnly`; en producción usan
  `Secure`.
- El rate limiting limita operaciones sensibles.

Estas medidas son una base didáctica. Antes de un uso productivo, realiza una
revisión de seguridad, rotación de secretos, monitorización y copias de respaldo.

## Despliegue

La guía de demostración para Render, Neon, SMTP/Resend y Google está en
[`docs/DEMO_DEPLOYMENT.md`](docs/DEMO_DEPLOYMENT.md). Revisa los dominios HTTPS,
CORS, el callback OAuth y los valores WebAuthn antes de habilitar usuarios reales.
