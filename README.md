# Mailamator

A self-hosted web app for automating [Purelymail](https://purelymail.com/) domain and user setup.

## Quick Start

```bash
docker compose up
```

Then open http://localhost:8080.

## Configuration

| Variable | Description | Default |
|---|---|---|
| `MAILAMATOR_SECRET` | Encryption key for stored API keys/passwords | `change-me-in-production` |
| `MAILAMATOR_PORT` | Port to expose | `8080` |
