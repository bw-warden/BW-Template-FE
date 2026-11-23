# Welcome to BW FrontEnd!

Here you will find a self-hosted **Bitwarden client template provisioner** you can run in your own Docker environment and network. It is meant as a jumping-off point for provisioning nested client collections and cloning admin-managed Templates into Software/Hardware collections using the [Bitwarden CLI](https://bitwarden.com/help/cli/) and [APIs](https://bitwarden.com/help/bitwarden-apis/).

***Important things to note:***

- BW FrontEnd is a **self-hosted example / framework**. Review and adapt it for your org before relying on it in production
- There is **no Bitwarden user login** in the app. Operators use a local admin/member account; Bitwarden org + vault credentials are stored encrypted server-side
- Requires a Bitwarden **Enterprise** Cloud org with **nested collections** enabled
- Run it with Docker on your own host or internal network. How you expose it (LAN only, reverse proxy, HTTPS, etc.) is up to your organization
- Never commit real `.env` files or `./data` — generate a unique `APP_SECRET` (32+ characters) per deployment

*Additional documentation to help you get started:*<br>
[Password Manager CLI Guide](https://bitwarden.com/help/cli/)<br>
[Vault Management API Reference](https://bitwarden.com/help/vault-management-api/)<br>
[Bitwarden Public API Reference](https://bitwarden.com/help/api/)<br>
[Guide to using Postman to access the Bitwarden API](https://community.bitwarden.com/t/guide-to-using-postman-to-access-the-bitwarden-api/56475)<br>
[Nested collections](https://bitwarden.com/help/nested-collections/)

## What it does

1. Creates nested client collections (`Clients/{Name}/Software` and `…/Hardware`)
2. Clones admin-managed **Templates** items into those collections as **new** vault items (Templates are never shared into client collections)
3. Offers typeahead lookup of existing clients for later adds
4. Applies admin-configured Bitwarden **group** View/Edit access on new Software/Hardware collections
5. Lets an admin upload an optional organization logo (**Settings → Branding**) for header / login / setup; the Bitwarden footer logo remains

## Getting started (Docker)

**Requirements:** Docker and Docker Compose on the host where you want to run the app.

1. Clone this repository and enter the project directory
2. Copy the env template and set a strong secret:

```bash
cp .env.example .env
```

Edit `.env` and set `APP_SECRET` to a long random string (32+ characters). Do not reuse the example value.

3. Build and start:

```bash
docker compose up -d --build
```

4. Open http://localhost:3000 (or `http://<host>:3000` on your network)
5. Complete **Create admin** on first load (`/setup`), then configure Bitwarden under **Settings**

Data (SQLite + Bitwarden CLI home + uploaded branding) persists in `./data` on the host (gitignored). Stop with `docker compose down`; data remains unless you delete `./data`.

If you terminate TLS in front of the app (recommended for anything beyond local use), set `COOKIE_SECURE=true` in `.env` and recreate the container.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `APP_SECRET` | Yes | Session cookie password + AES key for Bitwarden secrets (min 32 chars). Generate a unique value per deployment. |
| `CREDENTIALS_KEY` | No | Alias used if `APP_SECRET` is unset |
| `COOKIE_SECURE` | No | Set `true` when serving over HTTPS |
| `DATA_DIR` | No | Defaults to `/app/data` in Docker |

## First-load setup

1. Empty DB → **Create admin** (`/setup`) with email + password
2. Setup locks once any user exists
3. Thereafter every page/API requires session login (`/login`)
4. **Settings → Branding**: optional organization logo
5. **Settings**: region, org id, Organization API key, vault service account API key + master password, default Software/Hardware group access, Refresh groups, Test connection
6. On login (when Bitwarden settings are ready), org **groups** are synced into SQLite in the background

## Bitwarden org prerequisites

1. Create the groups you need in Bitwarden (for example Operators, Admins, or any custom groups)
2. Seed root collections (or let the app create them by name):
   - `Clients`
   - `Templates` (service account / admins only — do not grant broad operator access here)
3. Create an **Organization API key** (Public API)
4. Create a **service account** user with vault access to `Templates` and ability to create items in client Software/Hardware collections. Generate that user’s **personal API key** + master password
5. In **Settings → Default collection access**, refresh groups and assign permissions per group for Software and Hardware. Those presets apply when a **new** client’s nested collections are created

## Product flows

1. **Provision** (`/`): Client typeahead → select/create → multi-select templates → Software/Hardware → confirm → result
2. **Clients** (`/clients`, admin): list client collections and edit live Software/Hardware group permissions
3. **Templates** (`/templates`): create/delete template field shapes in the Templates collection
4. **Users** (`/users`): manage local admin/member accounts
5. **Settings** (`/settings`): branding logo + Bitwarden connection

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

## Disclaimer

Please note that this project is experimental and not officially supported by Bitwarden. It is provided "as is" with no guarantees. Review security, networking, and credential handling carefully before deploying in your environment.
