# Mailamator Design

A self-hosted web app for automating Purelymail domain and user setup.

## Problem

Setting up mail on Purelymail requires tedious manual work: registering domains through the UI, copying 7 DNS records one at a time into Cloudflare, creating users individually, and keeping track of generated credentials. Mailamator automates this into a few clicks.

## Tech Stack

- **Backend:** Python / Flask
- **Database:** SQLite (single file, zero config)
- **Frontend:** Vanilla HTML/CSS/JS (no build step)
- **Deployment:** Docker / Docker Compose
- **License:** Open source

## Architecture

Flask serves both the REST API and static frontend files. No separate frontend server.

```
Browser (vanilla JS)
    │ REST API
Flask Backend
    ├── Purelymail API Client (thin wrapper, all POST + JSON + auth header)
    ├── Cloudflare API Client (optional, for automatic DNS record creation)
    ├── Password Generator (secrets module)
    ├── DNS Zone File Builder (BIND format for Cloudflare import)
    └── SQLite
```

## Data Model

SQLite stores:

- **accounts** — Purelymail accounts (name, encrypted API key, optional Cloudflare token)
- **domains** — History of added domains (name, account FK, creation date)
- **users** — History of created users (email, encrypted password, account FK, domain FK, creation date)

API keys and generated passwords are encrypted at rest using a master password (set on first launch or via environment variable).

## UI Pages

### Settings
- Add/remove Purelymail accounts (name + API key)
- Optionally add Cloudflare API token per account
- Active account switcher in top nav

### Domains
- List of domains (fetched live from Purelymail API) with DNS status indicators
- **Add Domain flow:**
  1. Enter domain name
  2. App registers it via API, fetches ownership code
  3. Displays all 7 required DNS records (MX, SPF, 3x DKIM, DMARC, ownership TXT)
  4. "Download for Cloudflare" button — BIND zone file
  5. "Push to Cloudflare" button — if Cloudflare API token configured
  6. "Check DNS" button — triggers recheckDns via API

### Users
- Domain picker dropdown (populated from Purelymail API)
- Existing users listed per domain
- **Add Users flow:**
  1. Enter usernames (local parts only: `alice`, `bob`)
  2. App creates each user with a generated strong password
  3. Results table: full email, password, Roundcube webmail link
  4. "Copy All" button for credentials
  5. Expandable "Mail Client Settings" section (IMAP/SMTP server details)
- All created users saved to local database for later lookup

### History
- Searchable log of all created domains and users with timestamps and credentials

## Purelymail API Integration

Base URL: `https://purelymail.com`
Auth: `Purelymail-Api-Token` header

Key endpoints used:
- `POST /api/v0/addDomain` — register domain
- `POST /api/v0/getOwnershipCode` — get DNS TXT verification value
- `POST /api/v0/listDomains` — list domains with DNS status
- `POST /api/v0/updateDomainSettings` — recheck DNS (recheckDns: true)
- `POST /api/v0/createUser` — create mailbox
- `POST /api/v0/listUser` — list all users
- `POST /api/v0/getUser` — get user details
- `POST /api/v0/deleteUser` — remove user
- `POST /api/v0/deleteDomain` — remove domain

## DNS Records

When a domain is added, the app generates these 7 records:

| Type  | Name                          | Value                                    |
|-------|-------------------------------|------------------------------------------|
| MX    | @                             | mailserver.purelymail.com (priority 50)  |
| TXT   | @                             | v=spf1 include:_spf.purelymail.com ~all  |
| TXT   | @                             | (ownership code from API)                |
| CNAME | purelymail1._domainkey        | (Purelymail DKIM key 1)                  |
| CNAME | purelymail2._domainkey        | (Purelymail DKIM key 2)                  |
| CNAME | purelymail3._domainkey        | (Purelymail DKIM key 3)                  |
| CNAME | _dmarc                        | (Purelymail DMARC record)               |

These are output as a BIND zone file for Cloudflare import, or pushed via Cloudflare API if configured.

## Security

- API keys and generated passwords encrypted at rest in SQLite
- Encryption key: master password set on first launch or via MAILAMATOR_SECRET env var
- No web UI authentication by default (designed for local/trusted network use)
- Optional basic auth via environment variable for exposed deployments
- Password generation: Python `secrets` module, 20+ chars, mixed case/numbers/symbols

## Docker

Single Dockerfile, multi-stage build. Docker Compose file with:
- One service (mailamator)
- SQLite volume mount for persistence
- Environment variables for configuration (secret, optional basic auth)
- Exposed on a configurable port
