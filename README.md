<p align="center">
  <img src="mailamator-logo.svg" alt="Mailamator logo" width="120">
</p>

# Mailamator

A self-hosted web app for automating [Purelymail](https://purelymail.com/) domain and user setup.

Mailamator eliminates the manual process of setting up mail domains and users on Purelymail. Add a domain, get the exact DNS records you need, push them to Cloudflare with one click, register the domain, and bulk-create users with generated passwords — all from a single interface.

## Features

- **Guided domain setup** — 3-step workflow: get DNS records, set up DNS, register on Purelymail
- **Cloudflare integration** — Push DNS records directly via the Cloudflare API, or download a BIND zone file
- **Bulk user creation** — Create multiple mail users at once with auto-generated 24-character passwords
- **Credential history** — Searchable log of all created domains and users with stored credentials
- **Multiple accounts** — Manage multiple Purelymail accounts from one interface
- **Encrypted storage** — API keys and passwords are encrypted at rest with Fernet
- **Dark/light mode** — Automatic theme detection with manual toggle
- **Self-hosted** — Single Docker container, SQLite database, no external dependencies

## Quick Start

```bash
git clone https://github.com/kgNatx/mailamator.git
cd mailamator
echo "MAILAMATOR_SECRET=$(openssl rand -hex 32)" > .env
docker compose up -d
```

Open http://localhost:8080 and add your Purelymail account to get started.

## How It Works

### 1. Add an Account

Go to **Settings** and add your Purelymail API key. Optionally add a Cloudflare API token for automatic DNS record creation.

### 2. Add a Domain

On the **Domains** tab, enter your domain name and click **Get DNS Records**. Mailamator fetches your Purelymail ownership code and generates all 7 required DNS records (MX, SPF, DKIM, DMARC, ownership TXT, and routing records).

You can then:
- **Download a zone file** to import into any DNS provider
- **Push to Cloudflare** to create all records automatically (requires a Cloudflare token and your domain using Cloudflare nameservers)

Once DNS records are in place, click **Register on Purelymail** to complete the domain setup.

### 3. Create Users

On the **Users** tab, select a domain, enter usernames (one per line), and click **Create Users**. Each user gets a secure 24-character generated password. Credentials are displayed once and saved to the searchable history.

## Configuration

Create a `.env` file in the project root:

```env
MAILAMATOR_SECRET=your-secret-key-here
MAILAMATOR_PORT=8080
```

| Variable | Description | Default |
|---|---|---|
| `MAILAMATOR_SECRET` | Encryption key for stored API keys and passwords | **Required** |
| `MAILAMATOR_PORT` | Port to expose the web UI | `8080` |
| `MAILAMATOR_DB` | Path to SQLite database file (inside container) | `/data/mailamator.db` |

### Getting a Purelymail API Key

1. Log in to [Purelymail](https://purelymail.com/)
2. Go to **Account Settings**
3. Click **Refresh API Key**
4. Copy the key and add it in Mailamator's Settings page

### Cloudflare API Token (Optional)

To use the "Push to Cloudflare" feature, your domain must already be using Cloudflare's nameservers. Then:

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Create a token with **Zone:DNS:Edit** permission for your domains
3. Add the token alongside your Purelymail account in Mailamator's Settings page

### Deploying Behind a Reverse Proxy

A Traefik override file is included:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d
```

Edit `docker-compose.traefik.yml` to set your domain. For other reverse proxies (Nginx, Caddy), proxy to port 8080 on the container.

## Development

### Prerequisites

- Python 3.12+

### Running Locally

```bash
pip install -r requirements.txt
MAILAMATOR_SECRET=dev-secret MAILAMATOR_DB=./dev.db flask --app app.main run --debug
```

### Running Tests

```bash
pip install pytest
pytest tests/ -v
```

All external API calls are mocked — no real API keys needed to run tests.

## License

[MIT](LICENSE)
