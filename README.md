# Welcome to BW-Template-FE!

Here you will find a self-hosted **Bitwarden client template provisioner** you can run in your own Docker environment and network. It is meant as a jumping-off point for provisioning nested client Shared Folders and cloning admin-managed Templates into Software/Hardware Shared Folders using the [Bitwarden CLI](https://bitwarden.com/help/cli/) and [APIs](https://bitwarden.com/help/bitwarden-apis/). (Bitwarden’s UI calls these Shared Folders; the API still uses the collections resource.)

***Important things to note:***

- BW-Template-FE is a **self-hosted example / framework**. Review and adapt it for your org before relying on it in production
- There is **no Bitwarden user login** in the app. Operators use a local admin/member account; Bitwarden org + vault credentials are stored encrypted server-side
- Requires a Bitwarden **Enterprise** Cloud org with **nested Shared Folders** enabled
- Run it with Docker on your own host or internal network. How you expose it (LAN only, reverse proxy, HTTPS, etc.) is up to your organization
- Never commit real `.env` files or `./data` — generate a unique `APP_SECRET` (32+ characters) and `REDIS_PASSWORD` per deployment. Do not copy someone else’s `./data` or `.env` into a fork

*Additional documentation to help you get started:*<br>
[Password Manager CLI Guide](https://bitwarden.com/help/cli/)<br>
[Vault Management API Reference](https://bitwarden.com/help/vault-management-api/)<br>
[Bitwarden Public API Reference](https://bitwarden.com/help/api/)<br>
[Guide to using Postman to access the Bitwarden API](https://community.bitwarden.com/t/guide-to-using-postman-to-access-the-bitwarden-api/56475)<br>
[Nested collections](https://bitwarden.com/help/nested-collections/) (Shared Folders in the Bitwarden UI)

## What it does

1. Creates nested client Shared Folders (`Clients/{Name}/Software` and `…/Hardware`)
2. Clones admin-managed **Templates** items into those Shared Folders as **new** vault items (Templates are never shared into client Shared Folders)
3. Offers typeahead lookup of existing clients for later adds
4. Applies admin-configured Bitwarden **group** View/Edit access on new Software/Hardware Shared Folders
5. Lets an admin upload an optional organization logo (**Settings → Branding**) for header / login / setup; the Bitwarden footer logo remains

## Getting started (Docker)

**Requirements:** Docker and Docker Compose on the host where you want to run the app.

This repo ships **blank**: no users, no Bitwarden API keys, no org data. Fork or clone, then:

1. Clone (or use as a GitHub template) and enter the project directory
2. Copy the env template and set strong secrets:

```bash
cp .env.example .env
```

Edit `.env` and set `APP_SECRET` and `REDIS_PASSWORD` to long random strings (32+ characters for `APP_SECRET`). Do not reuse the example values.

3. Build and start (Compose runs **`app` + `redis`**):

```bash
docker compose up -d --build
```

4. Open http://localhost:3000 (or `http://<host>:3000` on your network)
5. Complete **Create admin** on first load (`/setup`) — that account is the first (and initially only) admin
6. Configure Bitwarden under **Settings** (org API key, vault service account, groups). Keys are entered in the UI and stored encrypted in SQLite — never committed

### Redis (Compose)

Compose starts a Redis 7 service on the internal Docker network only (port **not** published to the host). The app receives `REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379`.

| What Redis stores | What stays in SQLite |
|---|---|
| Shared cache: AES-256-GCM–encrypted org API OAuth tokens + groups snapshot | Local users, AES-encrypted Bitwarden settings, durable groups copy |

If Redis is unavailable, the app **fails open**: in-memory token cache + SQLite groups. Users and Bitwarden secrets are never written to Redis as plaintext.

### Data and reset

Runtime data (SQLite + Bitwarden CLI home + uploaded branding) persists in `./data` on the host (gitignored). Stop with `docker compose down`; data remains unless you delete `./data`.

To return to a blank first-run (re-opens `/setup`):

```bash
docker compose down
# Windows: Remove-Item -Recurse -Force .\data
rm -rf ./data
docker compose up -d --build
```

If you terminate TLS in front of the app (recommended for anything beyond local use), set `COOKIE_SECURE=true` in `.env` and recreate the container.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `APP_SECRET` | Yes | Session cookie password + AES key for Bitwarden secrets and Redis-cached org tokens (min 32 chars). Generate a unique value per deployment. |
| `CREDENTIALS_KEY` | No | Alias used if `APP_SECRET` is unset |
| `COOKIE_SECURE` | No | Set `true` when serving over HTTPS |
| `DATA_DIR` | No | Defaults to `/app/data` in Docker |
| `REDIS_PASSWORD` | Yes (Compose) | Password for the Compose `redis` service; required — Compose injects `REDIS_URL` from it |
| `REDIS_URL` | No (local) | Optional full Redis URL for `npm run dev`. Leave unset to skip Redis and use in-memory token cache + SQLite groups only |

## First-load setup

1. Empty DB → **Create admin** (`/setup`) with email + password (first user is always admin)
2. Setup locks once any user exists
3. Thereafter every page/API requires session login (`/login`)
4. **Settings → Branding**: optional organization logo
5. **Settings**: region, org id, Organization API key, vault service account API key + master password, default Software/Hardware group access, Refresh groups, Test connection
6. On login (when Bitwarden settings are ready), org **groups** are synced into SQLite in the background (and into Redis when configured)

## Bitwarden org prerequisites

1. Create the groups you need in Bitwarden (for example Operators, Admins, or any custom groups)
2. Seed root Shared Folders (or let the app create them by name):
   - `Clients`
   - `Templates` (service account / admins only — do not grant broad operator access here)
3. Create an **Organization API key** (Public API)
4. Create a **service account** user with vault access to `Templates` and ability to create items in client Software/Hardware Shared Folders. Generate that user’s **personal API key** + master password
5. In **Settings → Default Shared Folder access**, refresh groups and assign permissions per group for Software and Hardware. Those presets apply when a **new** client’s nested Shared Folders are created

## Product flows

1. **Provision** (`/`): Client typeahead → select/create → multi-select templates → Software/Hardware → confirm → result
2. **Clients** (`/clients`, admin): list client Shared Folders and edit live Software/Hardware group permissions
3. **Templates** (`/templates`): create/delete template field shapes in the Templates Shared Folder
4. **Users** (`/users`): manage local admin/member accounts
5. **Settings** (`/settings`): branding logo + Bitwarden connection

## Local development (optional)

```bash
cp .env.example .env
npm install
# install Bitwarden CLI (`bw`) on PATH
npm run dev
```

Set `APP_SECRET` in `.env`. Redis is optional for local dev: leave `REDIS_URL` unset unless you run Redis yourself (Compose already wires Redis for Docker).

## Stack

Feel free to swap pieces that fit your environment; the notes below reflect what this repo ships with today.

| Layer | Choice | Notes |
|---|---|---|
| App framework | **Next.js 15** (App Router) | `output: "standalone"` for Docker; API routes under `src/app/api` |
| Language | **TypeScript 5** | Strict project via `tsconfig.json` |
| UI | **React 19** + **Tailwind CSS 4** | Server/client components; PostCSS via `@tailwindcss/postcss` |
| Validation | **Zod 4** | Request bodies and settings payloads |
| Local DB | **SQLite** via `better-sqlite3` | File at `$DATA_DIR/app.db` (WAL mode); users, AES-encrypted settings, durable groups cache |
| Shared cache | **Redis 7** (`ioredis`) | Compose service (internal only); AES-encrypted org API OAuth tokens + groups snapshot; fail-open to memory/SQLite |
| Sessions | **iron-session** | Cookie `bw_template_fe_session`; sealed with `APP_SECRET` |
| Password hashing | **bcrypt** | Local admin/member accounts only (not Bitwarden login) |
| Secrets at rest | **AES-256-GCM** (Node `crypto`) | Bitwarden API keys / master password in SQLite; org OAuth tokens in Redis use the same key |
| Bitwarden org API | **Public API** (HTTP) | Groups, Shared Folder (collection) create + access |
| Bitwarden vault | **CLI `bw`** | Unlock + item create; image pins `cli-v2025.12.1` |
| Runtime | **Node.js 22** | Docker base: `node:22-bookworm-slim` |
| Packaging | **Docker Compose** | `app` + `redis`, port `3000`, volume `./data` |
| Optional edge | Bring your own | Terminate TLS / tunnel (e.g. cloudflared) in front of the app if you want it |

**Out of scope / not in this stack:** Bitwarden user SSO in the UI, a separate Postgres/MySQL store, Redis as primary DB (cache only), or a reverse proxy baked into Compose (bring your own).

## Security notes

- **Bitwarden API keys and vault master password** are encrypted at rest in SQLite with AES-256-GCM (key derived from `APP_SECRET`). Settings APIs never return secret values — only a “configured” flag.
- **Org API OAuth tokens** cached in Redis are AES-256-GCM encrypted with the same key (not plaintext). Groups cache is non-secret metadata only.
- **Sessions** are httpOnly iron-session cookies (8h TTL). Set `COOKIE_SECURE=true` behind HTTPS.
- **`bw` CLI children** receive a minimal environment (no `APP_SECRET` / `REDIS_URL`). Treat `$DATA_DIR/bw-home` as sensitive.
- **Login and first-time setup** are rate-limited per IP (and email). API errors to the browser are generic; details stay in server logs.
- Generate unique `APP_SECRET` and `REDIS_PASSWORD` per deployment; never reuse `.env.example` placeholders.

## Disclaimer

Please note that this project is experimental and not officially supported by Bitwarden. It is provided "as is" with no guarantees. Review security, networking, and credential handling carefully before deploying in your environment.
