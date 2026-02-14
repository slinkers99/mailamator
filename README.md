# Mailamator

A self-hosted web app for automating [Purelymail](https://purelymail.com/) domain and user setup.

Mailamator eliminates the tedious manual process of setting up mail domains and users on Purelymail. Add a domain, get DNS records formatted for Cloudflare import, create users in bulk with generated passwords, and keep a searchable history of everything you've set up.

## Features

- **Domain setup** — Register domains with Purelymail and get all 7 required DNS records (MX, SPF, DKIM, DMARC, ownership) in one click
- **Cloudflare DNS export** — Download a BIND zone file to import into Cloudflare, or push records directly via the Cloudflare API
- **Bulk user creation** — Create multiple mail users at once with auto-generated strong passwords
- **Credential history** — Searchable log of all created domains and users with stored credentials
- **Multiple accounts** — Manage multiple Purelymail accounts from one interface
- **Self-hosted** — Runs as a Docker container on your own infrastructure

## Quick Start

```bash
git clone https://github.com/kgNatx/mailamator.git
cd mailamator
docker compose up
```

Open http://localhost:8080 and add your Purelymail account to get started.

## Configuration

Set these environment variables in your `.env` file or pass them to Docker:

| Variable | Description | Default |
|---|---|---|
| `MAILAMATOR_SECRET` | Encryption key for stored API keys and passwords | Required |
| `MAILAMATOR_PORT` | Port to expose the web UI | `8080` |
| `MAILAMATOR_DB` | Path to SQLite database file | `/data/mailamator.db` |

### Getting a Purelymail API Key

1. Log in to [Purelymail](https://purelymail.com/)
2. Go to Account Settings
3. Click "Refresh API Key"
4. Copy the key and add it in Mailamator's Settings page

### Cloudflare API Token (Optional)

To enable automatic DNS record creation:

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Create a token with **Zone:DNS:Edit** permission for your domains
3. Add the token in Mailamator's Settings page alongside your Purelymail account

## Development

### Prerequisites

- Python 3.12+
- pip

### Running locally

```bash
pip install -r requirements.txt
MAILAMATOR_SECRET=dev-secret MAILAMATOR_DB=./dev.db flask --app app.main run --debug
```

### Running tests

```bash
pip install pytest
pytest tests/ -v
```

## License

MIT
