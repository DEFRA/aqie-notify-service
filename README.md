# aqie-notify-service

Backend service for the **Defra Air-Quality Information & Engagement (AQIE)** subscription system. Handles phone-number verification (OTP), email-address verification (link), generic transactional notifications via GOV.UK Notify, and inbound SMS-reply processing (STOP / unsubscribe).

Built on Hapi.js, MongoDB, and the Defra CDP Node template.

## Documentation

| Doc                                                    | What's in it                                                                                        |
| :----------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| [docs/API_SPECIFICATION.md](docs/API_SPECIFICATION.md) | Every HTTP endpoint exposed by this service — request/response shapes, validation rules, schemas    |
| [docs/SMS_REPLY_CRON.md](docs/SMS_REPLY_CRON.md)       | Architecture, data flow, configuration and operations for the inbound-SMS poller (STOP/unsubscribe) |
| [docs/LOGGING.md](docs/LOGGING.md)                     | Catalogue of every log event, masking rules, grep recipes, alerting recommendations                 |

## Table of Contents

- [What this service does](#what-this-service-does)
- [Endpoints at a glance](#endpoints-at-a-glance)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Mock / automation mode](#mock--automation-mode)
- [Project structure](#project-structure)
- [npm scripts](#npm-scripts)
- [Testing](#testing)
- [Docker](#docker)
- [Development helpers](#development-helpers)
  - [MongoDB locks](#mongodb-locks)
  - [Proxy](#proxy)
- [Updating dependencies](#updating-dependencies)
- [Formatting](#formatting)
- [Dependabot / SonarCloud](#dependabot--sonarcloud)
- [Licence](#licence)

## What this service does

```
┌────────────┐    OTP / link request   ┌────────────────────────┐    SMS / email    ┌──────────────┐
│ Frontend   │ ──────────────────────▶ │  aqie-notify-service   │ ────────────────▶ │  GOV.UK      │
│ / Backend  │ ◀────── token ──────── │  (this service)        │ ◀────── replies ─ │  Notify      │
└────────────┘                         └──────┬─────────────────┘                   └──────────────┘
                                              │   ▲
                            audit & dedup     │   │   cron polls every 1 min
                                              ▼   │   for inbound SMS replies
                                       ┌────────────────┐
                                       │   MongoDB      │
                                       └────────────────┘
                                              │
                                              ▼   DELETE /opt-out-sms-alert (STOP processing)
                                       ┌────────────────┐
                                       │ alert-back-end │  (separate service)
                                       └────────────────┘
```

Capabilities:

- **OTP issue + verify** for phone-number subscriptions (5-digit OTP, 15-min expiry, single-use).
- **Email verification link issue + verify** for email subscriptions (UUID-v4 token, 15-min expiry).
- **Generic notification dispatch** via GOV.UK Notify (SMS or email) with audit trail.
- **Inbound SMS reply processing**: poll Notify on a 1-minute cron, detect `STOP`, unsubscribe via the alert-backend, send a confirmation SMS.
- **Mock mode** (`USE_MOCK=true`) for end-to-end automation in non-prod environments — fixed OTP value, verification token returned in API response. Blocked at startup in `prod` and `ext-test`.

## Endpoints at a glance

| Method | Path                              | Purpose                               |
| :----- | :-------------------------------- | :------------------------------------ |
| POST   | `/subscribe/generate-otp`         | Issue OTP via SMS                     |
| POST   | `/subscribe/validate-otp`         | Verify an OTP                         |
| POST   | `/subscribe/generate-link`        | Issue email verification link         |
| GET    | `/subscribe/validate-link/{uuid}` | Verify an email link                  |
| POST   | `/send-notification`              | Send a generic SMS / email            |
| GET    | `/process-sms-replies`            | Manual trigger for the SMS-reply cron |
| GET    | `/health`                         | Health check                          |

Full request/response shapes → [docs/API_SPECIFICATION.md](docs/API_SPECIFICATION.md).

## Requirements

- **Node.js** `>= 22.16.0` (see `engines` in [package.json](./package.json))
- **MongoDB** (local Docker Compose works fine — see [Docker](#docker))
- **GOV.UK Notify** API key — use a _test_ or _team_ key locally

If you use [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use
```

## Quick start

```bash
# 1. Install deps
npm install

# 2. Copy & edit env (or export the vars listed below)
cp .env.example .env       # if .env.example exists; otherwise create .env

# 3. Run MongoDB + Localstack (and this service if you want)
docker compose up -d mongodb

# 4. Run the service in dev mode
npm run dev
```

The server listens on `PORT` (default 3001). Hit `http://localhost:3001/health` to verify.

## Environment variables

| Variable                                          | Description                                              | Default                      |
| :------------------------------------------------ | :------------------------------------------------------- | :--------------------------- |
| `PORT`                                            | HTTP port                                                | `3001`                       |
| `MONGO_URI`                                       | MongoDB connection URI                                   | `mongodb://127.0.0.1:27017/` |
| `MONGO_DATABASE`                                  | MongoDB database name                                    | `aqie-notify-service`        |
| `NOTIFY_API_KEY`                                  | GOV.UK Notify API key                                    | (test default)               |
| `NOTIFY_SMS_VERIFY_OTP_TEMPLATE_ID`               | SMS template id for OTPs                                 | (test default)               |
| `NOTIFY_EMAIL_VERIFY_LINK_TEMPLATE_ID`            | Email template id for verification links                 | (test default)               |
| `NOTIFY_OTP_PERSONALISATION_KEY`                  | Placeholder name in the OTP SMS template                 | `code`                       |
| `NOTIFY_TIMEOUT_MS`                               | Notify HTTP timeout                                      | `15000`                      |
| `NOTIFY_SMS_REPLY_POLL_ENABLED`                   | Enable the inbound-SMS cron                              | `true`                       |
| `NOTIFY_SMS_REPLY_POLL_INTERVAL_MINUTES`          | Cron interval                                            | `1`                          |
| `NOTIFY_SMS_UNSUBSCRIBE_CONFIRMATION_TEMPLATE_ID` | Template id for unsubscribe confirmation SMS             | (test default)               |
| `ALERT_BACKEND_URL`                               | Alert-backend service URL (for STOP processing)          | `http://localhost:3001`      |
| `ALERT_FRONTEND_BASE_URL`                         | Base URL used to build verification links sent in emails | (CDP test URL)               |
| `USE_MOCK`                                        | Enable automation mode (see below)                       | `false`                      |
| `CDP_ENVIRONMENT`                                 | Environment name — controls the `USE_MOCK` guard         | `local`                      |

All env vars are declared in [src/config.js](src/config.js). The service uses [convict](https://github.com/mozilla/node-convict) with `allowed: 'strict'`, so unknown keys will fail validation.

## Mock / automation mode

For end-to-end / UI automation that cannot read SMS or email inboxes, set `USE_MOCK=true`:

- `/subscribe/generate-otp` still sends the real SMS via Notify, but stores the fixed OTP `12345` in the database — automation can then call `/subscribe/validate-otp` with `12345`. **The real OTP received by SMS will not validate** — only `12345` is accepted.
- `/subscribe/generate-link` returns `verificationToken: <uuid>` in the response body so automation can call `/subscribe/validate-link/{uuid}` without parsing the email.
- Both OTPs and email links expire after **3 hours** (instead of 15 minutes) so slower automation runs don't time out mid-flow.

`USE_MOCK=true` is **rejected at startup** in `prod` and `ext-test` — the service refuses to boot. Full details: [docs/API_SPECIFICATION.md → Mock / Automation Mode](docs/API_SPECIFICATION.md#mock--automation-mode).

## Project structure

```
src/
├── config.js                            # convict env-var schema and startup guards
├── index.js                             # Hapi server bootstrap
├── plugins/
│   └── sms-reply-cron.js                # 1-min cron polling Notify for inbound SMS
├── common/
│   └── helpers/                         # logging, masking, OTP generation, phone validation
└── subscribe/
    ├── routes/                          # Hapi route definitions + Joi schemas
    │   ├── generate-otp.route.js
    │   ├── validate-otp.route.js
    │   ├── generate-link.route.js
    │   ├── validate-link.route.js
    │   ├── send-notification.route.js
    │   └── process-sms-replies.route.js
    ├── controllers/                     # Request handlers
    │   ├── otp.controller.js
    │   ├── email-verification.controller.js
    │   ├── validate-link.controller.js
    │   ├── notification.controller.js
    │   └── sms-reply.controller.js
    └── services/                        # Business logic & data access
        ├── otp.service.js
        ├── email-verification.service.js
        ├── notify-service.js            # GOV.UK Notify SDK wrapper
        ├── user-contact-service.js      # OTP storage
        ├── user-notification-detail.service.js  # /send-notification audit trail
        └── sms-reply.service.js         # Inbound SMS reply handling
```

MongoDB collections used: `user-contact-details`, `user-email-verification-details`, `user-notification-details`, `sms_replies`. Schemas in [docs/API_SPECIFICATION.md → Database Schemas](docs/API_SPECIFICATION.md#database-schemas).

## npm scripts

| Script                            | What it does                                                     |
| :-------------------------------- | :--------------------------------------------------------------- |
| `npm run dev`                     | Start in development mode with nodemon (`NODE_ENV=development`)  |
| `npm run dev:debug`               | Same as `dev` but with `--inspect-brk` for debugging             |
| `npm start`                       | Start in production mode (`NODE_ENV=production`)                 |
| `npm test`                        | Run vitest (with coverage) in UTC                                |
| `npm run test:watch`              | Vitest in watch mode                                             |
| `npm run lint` / `lint:fix`       | ESLint                                                           |
| `npm run format` / `format:check` | Prettier on `.cjs,.js,.json,.md`                                 |
| `npm run build`                   | Babel-transpile `src/` to `.server/` (production build artifact) |

The pre-commit hook (`git:pre-commit-hook`) runs `format:check`, `lint`, and `test`.

## Testing

```bash
npm test               # one-shot, with coverage
npm run test:watch     # watch mode
```

Tests are colocated with sources (`*.test.js` next to the file under test). The test runner is [vitest](https://vitest.dev/); `TZ=UTC` is forced so date-based assertions are deterministic.

To run a single file:

```bash
npx vitest run src/subscribe/services/otp.service.test.js
```

## Docker

### Development image

```bash
docker build --target development --no-cache --tag aqie-notify-service:development .
docker run -e PORT=3001 -p 3001:3001 aqie-notify-service:development
```

### Production image

```bash
docker build --no-cache --tag aqie-notify-service .
docker run -e PORT=3001 -p 3001:3001 aqie-notify-service
```

### Docker Compose

A local stack is included with:

- Localstack (S3, SQS)
- Redis
- MongoDB
- This service
- (Commented out) frontend example

```bash
docker compose up --build -d
```

## Development helpers

### MongoDB locks

If you need a write lock for Mongo, acquire it via `server.locker` or `request.locker`:

```javascript
async function doStuff(server) {
  const lock = await server.locker.lock('unique-resource-name')

  if (!lock) {
    // Lock unavailable
    return
  }

  try {
    // do stuff
  } finally {
    await lock.free()
  }
}
```

Keep critical sections small and atomic.

The `await using` form is also supported (though it confuses some coverage tools):

```javascript
async function doStuff(server) {
  await using lock = await server.locker.lock('unique-resource-name')
  if (!lock) return
  // do stuff — lock auto-released
}
```

Helpers in [src/helpers/mongo-lock.js](src/helpers/mongo-lock.js).

### Proxy

The service installs a global undici `ProxyAgent` dispatcher on startup, so `import { fetch } from 'undici'` will route through the forward proxy automatically.

If you use a different HTTP client, set the dispatcher explicitly:

```javascript
import { ProxyAgent } from 'undici'

await fetch(url, {
  dispatcher: new ProxyAgent({
    uri: proxyUrl,
    keepAliveTimeout: 10,
    keepAliveMaxTimeout: 10
  })
})
```

## Updating dependencies

```bash
npx npm-check-updates --interactive --format group
```

## Formatting

The repo uses Prettier. If you hit line-ending issues on Windows:

```bash
git config --global core.autocrlf false
```

## Dependabot / SonarCloud

- Example Dependabot config at `.github/example.dependabot.yml` — rename to `dependabot.yml` to enable.
- SonarCloud setup instructions: see [sonar-project.properties](./sonar-project.properties).

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable information providers in the public sector to license the use and re-use of their information under a common open licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
