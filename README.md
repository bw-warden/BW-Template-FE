# BW FrontEnd — Bitwarden Client Template Provisioner

Self-hosted app for Bitwarden Cloud that:

1. Creates nested client collections (`Clients/{Name}/Software` and `…/Hardware`)
2. Clones admin-managed **Templates** items into those collections as **new** vault items
3. Offers typeahead lookup of existing clients for later adds
4. Applies admin-configured Bitwarden **group** View/Edit access on new Software/Hardware collections

There is **no Bitwarden user login** in the app. Operators/admins use a local account. Bitwarden org + vault API credentials live only in encrypted server-side storage.

## Run with Docker

```bash
cp .env.example .env
# Set APP_SECRET to a long random string (32+ characters). Do not reuse the example value.

docker compose up -d --build
```

- App: http://localhost:3000
- Data (SQLite + Bitwarden CLI home + uploaded branding) persists in `./data` (gitignored)

Put a reverse proxy with HTTPS in front for anything beyond local use, and set `COOKIE_SECURE=true`.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `APP_SECRET` | Yes | Session cookie password + AES key for Bitwarden secrets (min 32 chars). Generate a unique value per deployment. |
| `CREDENTIALS_KEY` | No | Alias used if `APP_SECRET` is unset |
| `COOKIE_SECURE` | No | Set `true` when serving over HTTPS |
| `DATA_DIR` | No | Defaults to `/app/data` in Docker |

Never commit real `.env` files, `./data`, or Cloudflare tunnel credential JSON.

### Optional Cloudflare Tunnel

An example config lives at `cloudflared/config.example.yml`. Copy it, fill in your tunnel ID and hostname, mount your credentials JSON (never commit it), and run `cloudflared` yourself or via a compose overlay. Default `docker-compose.yml` runs only the app.

## First-load auth

1. Empty DB → **Create admin** (`/setup`) with email + password  
2. Setup locks once any user exists  
3. Thereafter every page/API requires session login (`/login`)  
4. **Settings → Branding**: optional organization logo for header / login / setup  
5. **Settings**: Bitwarden credentials; secrets are masked after save  
6. On login (when Bitwarden settings are ready), org **groups** are synced into SQLite in the background

## Bitwarden org setup (required)

Use an **Enterprise** Bitwarden Cloud org with **nested collections** enabled.

1. Create the groups you need in Bitwarden (for example Operators, Admins, or any custom groups)
2. Seed root collections (or let the app create them by name):
   - `Clients`
   - `Templates` (service account / admins only — do not grant broad operator access here)
3. Create an **Organization API key** (Public API) → Settings → Org Public API
4. Create a **service account** user with vault access to `Templates` and ability to create items in client Software/Hardware collections. Generate that user’s **personal API key** + master password → Settings → Vault service account
5. In **Settings → Default collection access**, refresh groups from Bitwarden and assign Bitwarden permissions per group for Software and Hardware (**Can view**, **Can view, except passwords**, **Can edit**, **Can manage**). Those presets apply when a **new** client’s nested collections are created

### Clone model

- Service account reads a Templates item server-side
- App creates a **new** item whose `collectionIds` are only the target Software or Hardware collection
- The Templates cipher is never shared into client collections
- Groups access clones via their Software/Hardware collection permissions; they never need Templates access

## Product flows

1. **Provision** (`/`): Client typeahead → select/create → multi-select templates → Software/Hardware → confirm → result  
2. **Clients** (`/clients`, admin): list client collections and edit live Software/Hardware group permissions  
3. **Templates** (`/templates`): create/delete template field shapes in the Templates collection  
4. **Users** (`/users`): manage local admin/member accounts  
5. **Settings** (`/settings`): branding logo, region, org id, API keys, default Software/Hardware group access, Refresh groups, Test connection

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
- Bitwarden Public API for groups / collection access  
- Bitwarden CLI (`bw`) in the Docker image for vault unlock / item create  

## Out of scope

Bitwarden SSO / vault user login, multi-operator invite UX, production multi-tenant hosting, free personal vaults without an org.
