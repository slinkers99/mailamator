# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mailamator is a self-hosted web app that automates Purelymail domain and user setup. It provides a browser UI for registering domains, pushing DNS records to Cloudflare, creating mail users in bulk with generated passwords, and keeping a searchable credential history. Designed to run as a Docker container.

## Commands

```bash
# Run tests
python3 -m pytest tests/ -v

# Run a single test file
python3 -m pytest tests/test_purelymail.py -v

# Run a single test
python3 -m pytest tests/test_dns.py::test_zone_file_contains_mx_record -v

# Run locally (without Docker)
MAILAMATOR_SECRET=dev-secret MAILAMATOR_DB=./dev.db flask --app app.main run --debug

# Build and run with Docker
docker compose up --build

# Install dependencies (if running outside Docker)
pip install -r requirements.txt
pip install pytest
```

## Architecture

**Backend:** Python/Flask serving both a REST API and static frontend files from a single process. Gunicorn in production (Docker), Flask dev server locally.

**Frontend:** Vanilla HTML/CSS/JS single-page app in `static/`. No build step. Uses Pico CSS via CDN. All four pages (Settings, Domains, Users, History) are sections in one HTML file, shown/hidden by JS router.

**Database:** SQLite via Python stdlib `sqlite3`. Schema defined in `app/db.py:init_db()`. API keys and generated passwords are encrypted at rest using Fernet (from `cryptography` library) with a key derived from `MAILAMATOR_SECRET`.

**Key modules:**
- `app/purelymail.py` — Thin HTTP client wrapping Purelymail's REST API. All endpoints are `POST /api/v0/<action>` with JSON body and `Purelymail-Api-Token` header. Responses are nested: `{"type": "success", "result": {"domains": [...]}}`.
- `app/cloudflare.py` — Optional Cloudflare API client for pushing DNS records directly.
- `app/dns.py` — Generates the 7 required Purelymail DNS records and builds BIND zone files.
- `app/crypto.py` — Fernet encrypt/decrypt with SHA-256 key derivation from a secret string.
- `app/passwords.py` — Generates 24-char passwords using `secrets` module with guaranteed character class coverage.
- `app/routes/` — Flask blueprints: `accounts`, `domains`, `users`, `history`. Each prefixed under `/api/`.

**Domain add flow (3-step process):**
1. `POST /api/domains/prepare` — Takes account_id and domain_name. Fetches the account's ownership code from Purelymail, generates 7 DNS records and a BIND zone file. Does NOT register the domain yet.
2. User sets up DNS (downloads zone file or uses `POST /api/domains/push-cloudflare` to push records via Cloudflare API).
3. `POST /api/domains/register` — Calls Purelymail's `addDomain` to register the domain (requires DNS records to already exist). Saves to local DB on success.

**User creation flow:**
1. `POST /api/users` — Takes account_id, domain_name, and username list.
2. Generates a password per user via `passwords.generate_password()`.
3. Calls `createUser` on Purelymail's API for each.
4. Stores email + encrypted password in SQLite.
5. Returns plaintext passwords (one-time display) and mail client settings.

## Testing

Tests use pytest with Flask's test client. `tests/conftest.py` provides `app` and `client` fixtures that create a temporary SQLite database. External API calls (Purelymail, Cloudflare) are mocked using `unittest.mock.patch`. No real API keys needed to run tests.

## Environment Variables

| Variable | Purpose |
|---|---|
| `MAILAMATOR_SECRET` | Encryption key for API keys and passwords at rest |
| `MAILAMATOR_DB` | SQLite database file path (default: `/data/mailamator.db`) |
| `MAILAMATOR_PORT` | Docker-exposed port (default: `8080`) |
