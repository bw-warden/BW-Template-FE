# BW Konica — Bitwarden Client Template Provisioner (Test)

Test app for Bitwarden Cloud that:

1. Creates nested client collections (`Clients/{Name}/Software` and `…/Hardware`)
2. Clones admin-managed **Templates** items into those collections as **new** vault items
3. Offers typeahead lookup of existing clients for later adds

There is **no Bitwarden user login** in the app. Operators/admins use a local admin account. Bitwarden org + vault API credentials live only in encrypted server-side storage.

## Run on this machine (Docker)

Published on **port 3000** (`0.0.0.0:3000`) so LAN/external testers can reach it. Windows already allows inbound TCP 3000 on this host.

```bash
cp .env.example .env
# set APP_SECRET to a long random string (32+ characters)

docker compose up -d --build
```

- Local: http://localhost:3000  
- External testers: `http://<this-machine-LAN-or-public-IP>:3000`

Data (SQLite + Bitwarden CLI home) persists in `./data` (gitignored).

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `APP_SECRET` | Yes | Session cookie password + AES key for Bitwarden secrets (min 32 chars) |
| `CREDENTIALS_KEY` | No | Alias used if `APP_SECRET` is unset |
| `COOKIE_SECURE` | No | Set `true` only behind HTTPS |
| `DATA_DIR` | No | Defaults to `/app/data` in Docker |

Never commit real `.env` files.

## First-load auth

1. Empty DB → **Create admin** (`/setup`) with email + password  
2. Setup locks once any user exists  
3. Thereafter every page/API requires session login (`/login`)  
4. Settings stores Bitwarden credentials; secrets are masked after save

## Bitwarden org setup (required)

Use an **Enterprise** Bitwarden Cloud org with **nested collections** enabled.

1. Create groups: **Operators**, **Admins** (copy their group IDs into Settings)
2. Seed root collections (or let the app create them by name):
   - `Clients`
   - `Templates` (service account / admins only — **do not** grant Operators access)
3. Create an **Organization API key** (Public API) → Settings → Org Public API
4. Create a **service account** user with vault access to `Templates` and ability to create items in client Software/Hardware collections. Generate that user’s **personal API key** + master password → Settings → Vault service account
5. Operators should receive **Edit items** (not Manage) on Software/Hardware via the app when the Operators group ID is configured

### Clone model

- Service account reads a Templates item server-side
- App creates a **new** item whose `collectionIds` are only the target Software or Hardware collection
- The Templates cipher is never shared into client collections
- Operators edit clones via Edit on Software/Hardware; they never need Templates access

## Product flows

1. **Provision** (`/`): Client typeahead → select/create → multi-select templates → Software/Hardware → confirm → result  
2. **Templates** (`/templates`): create/delete template field shapes in the Templates collection  
3. **Settings** (`/settings`): region, org id, API keys, groups, Test connection

## Local development (optional)

```bash
cp .env.example .env
npm install
# install Bitwarden CLI (`bw`) on PATH
npm run dev
```

## Stack

- Next.js (App Router) + TypeScript + Tailwind  
- SQLite (`better-sqlite3`)  
- Bitwarden Public API for collections/access  
- Bitwarden CLI (`bw`) in the Docker image for vault unlock / item create  

## Out of scope

Bitwarden SSO / vault user login, multi-operator invite UX, production multi-tenant hosting, free personal vaults without an org.
