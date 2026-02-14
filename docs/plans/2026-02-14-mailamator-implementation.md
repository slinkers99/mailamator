# Mailamator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a self-hosted web app that automates Purelymail domain/user setup with Cloudflare DNS export.

**Architecture:** Flask serves a REST API and static frontend. SQLite stores accounts, domain history, and user credentials. A thin Purelymail API client handles all backend communication. Vanilla HTML/CSS/JS frontend with no build step.

**Tech Stack:** Python 3.12, Flask, SQLite (via sqlite3 stdlib), httpx, cryptography (Fernet), Docker

---

### Task 1: Project Scaffolding

**Files:**
- Create: `requirements.txt`
- Create: `app/__init__.py`
- Create: `app/main.py`
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.gitignore`
- Create: `README.md`

**Step 1: Create .gitignore**

```gitignore
__pycache__/
*.pyc
*.pyo
.env
*.db
.venv/
dist/
*.egg-info/
```

**Step 2: Create requirements.txt**

```
flask==3.1.*
httpx==0.28.*
cryptography==44.*
gunicorn==23.*
```

**Step 3: Create the Flask app factory**

Create `app/__init__.py`:
```python
import os
from flask import Flask


def create_app():
    app = Flask(__name__, static_folder="../static", static_url_path="/static")
    app.config["SECRET_KEY"] = os.environ.get("MAILAMATOR_SECRET", "change-me-in-production")
    app.config["DATABASE"] = os.environ.get("MAILAMATOR_DB", "/data/mailamator.db")

    from app import db
    db.init_app(app)

    from app.routes import accounts, domains, users, history
    app.register_blueprint(accounts.bp)
    app.register_blueprint(domains.bp)
    app.register_blueprint(users.bp)
    app.register_blueprint(history.bp)

    @app.route("/")
    def index():
        return app.send_static_file("index.html")

    return app
```

Create `app/main.py`:
```python
from app import create_app

app = create_app()
```

**Step 4: Create Dockerfile**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["gunicorn", "-b", "0.0.0.0:8080", "app.main:app"]
```

**Step 5: Create docker-compose.yml**

```yaml
services:
  mailamator:
    build: .
    ports:
      - "${MAILAMATOR_PORT:-8080}:8080"
    volumes:
      - mailamator-data:/data
    environment:
      - MAILAMATOR_SECRET=${MAILAMATOR_SECRET:-change-me-in-production}
      - MAILAMATOR_DB=/data/mailamator.db

volumes:
  mailamator-data:
```

**Step 6: Create placeholder static/index.html**

Create `static/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mailamator</title>
</head>
<body>
    <h1>Mailamator</h1>
    <p>Setup in progress.</p>
</body>
</html>
```

**Step 7: Create README.md**

```markdown
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
```

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with Flask, Docker, and Compose"
```

---

### Task 2: Database Layer

**Files:**
- Create: `app/db.py`
- Create: `app/crypto.py`
- Create: `tests/test_db.py`
- Create: `tests/test_crypto.py`
- Create: `tests/conftest.py`

**Step 1: Write failing tests for crypto module**

Create `tests/conftest.py`:
```python
import os
import tempfile
import pytest
from app import create_app


@pytest.fixture
def app():
    db_fd, db_path = tempfile.mkstemp()
    app = create_app()
    app.config["DATABASE"] = db_path
    app.config["SECRET_KEY"] = "test-secret-key"
    app.config["TESTING"] = True

    with app.app_context():
        from app.db import init_db
        init_db()

    yield app

    os.close(db_fd)
    os.unlink(db_path)


@pytest.fixture
def client(app):
    return app.test_client()
```

Create `tests/test_crypto.py`:
```python
from app.crypto import encrypt, decrypt


def test_round_trip():
    secret = "test-secret-key"
    plaintext = "pm_api_key_abc123"
    encrypted = encrypt(plaintext, secret)
    assert encrypted != plaintext
    assert decrypt(encrypted, secret) == plaintext


def test_different_secrets_produce_different_ciphertext():
    plaintext = "pm_api_key_abc123"
    enc1 = encrypt(plaintext, "secret-one")
    enc2 = encrypt(plaintext, "secret-two")
    assert enc1 != enc2


def test_wrong_secret_fails():
    import pytest
    encrypted = encrypt("data", "right-key")
    with pytest.raises(Exception):
        decrypt(encrypted, "wrong-key")
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_crypto.py -v`
Expected: FAIL — module not found

**Step 3: Implement crypto module**

Create `app/crypto.py`:
```python
import base64
import hashlib
from cryptography.fernet import Fernet


def _derive_key(secret: str) -> bytes:
    key = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(key)


def encrypt(plaintext: str, secret: str) -> str:
    f = Fernet(_derive_key(secret))
    return f.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str, secret: str) -> str:
    f = Fernet(_derive_key(secret))
    return f.decrypt(ciphertext.encode()).decode()
```

**Step 4: Run crypto tests**

Run: `pytest tests/test_crypto.py -v`
Expected: PASS

**Step 5: Write failing tests for database**

Create `tests/test_db.py`:
```python
from app.db import get_db, init_db


def test_init_creates_tables(app):
    with app.app_context():
        db = get_db()
        tables = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        table_names = {row["name"] for row in tables}
        assert "accounts" in table_names
        assert "domains" in table_names
        assert "users" in table_names


def test_accounts_crud(app):
    with app.app_context():
        db = get_db()
        db.execute(
            "INSERT INTO accounts (name, api_key) VALUES (?, ?)",
            ("test", "encrypted_key"),
        )
        db.commit()
        row = db.execute("SELECT * FROM accounts WHERE name = ?", ("test",)).fetchone()
        assert row["name"] == "test"
        assert row["api_key"] == "encrypted_key"
```

**Step 6: Run tests to verify they fail**

Run: `pytest tests/test_db.py -v`
Expected: FAIL

**Step 7: Implement database module**

Create `app/db.py`:
```python
import sqlite3
from flask import g, current_app


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            api_key TEXT NOT NULL,
            cloudflare_token TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS domains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            account_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            password TEXT NOT NULL,
            domain_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (domain_id) REFERENCES domains(id),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
    """)
    db.commit()


def init_app(app):
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()
```

**Step 8: Run all tests**

Run: `pytest tests/ -v`
Expected: PASS

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: database layer with encryption and SQLite schema"
```

---

### Task 3: Purelymail API Client

**Files:**
- Create: `app/purelymail.py`
- Create: `tests/test_purelymail.py`

**Step 1: Write failing tests with mocked HTTP**

Create `tests/test_purelymail.py`:
```python
import pytest
from unittest.mock import patch, MagicMock
from app.purelymail import PurelymailClient


@pytest.fixture
def client():
    return PurelymailClient(api_key="test-key")


def _mock_response(json_data, status_code=200):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    resp.raise_for_status = MagicMock()
    return resp


class TestListDomains:
    @patch("app.purelymail.httpx.post")
    def test_returns_domains(self, mock_post, client):
        mock_post.return_value = _mock_response({
            "type": "success",
            "result": [
                {"name": "example.com", "dnsSummary": {"valid": True}}
            ]
        })
        domains = client.list_domains()
        assert len(domains) == 1
        assert domains[0]["name"] == "example.com"

    @patch("app.purelymail.httpx.post")
    def test_sends_auth_header(self, mock_post, client):
        mock_post.return_value = _mock_response({"type": "success", "result": []})
        client.list_domains()
        call_kwargs = mock_post.call_args
        assert call_kwargs.kwargs["headers"]["Purelymail-Api-Token"] == "test-key"


class TestAddDomain:
    @patch("app.purelymail.httpx.post")
    def test_add_domain(self, mock_post, client):
        mock_post.return_value = _mock_response({"type": "success"})
        client.add_domain("example.com")
        body = mock_post.call_args.kwargs["json"]
        assert body["domainName"] == "example.com"


class TestCreateUser:
    @patch("app.purelymail.httpx.post")
    def test_create_user(self, mock_post, client):
        mock_post.return_value = _mock_response({"type": "success"})
        client.create_user("alice", "example.com", "strongpass123")
        body = mock_post.call_args.kwargs["json"]
        assert body["userName"] == "alice"
        assert body["domainName"] == "example.com"
        assert body["password"] == "strongpass123"


class TestGetOwnershipCode:
    @patch("app.purelymail.httpx.post")
    def test_returns_code(self, mock_post, client):
        mock_post.return_value = _mock_response({
            "type": "success",
            "result": {"code": "purelymail-ownership-abc123"}
        })
        code = client.get_ownership_code()
        assert code == "purelymail-ownership-abc123"


class TestApiError:
    @patch("app.purelymail.httpx.post")
    def test_raises_on_error_response(self, mock_post, client):
        mock_post.return_value = _mock_response({
            "type": "error",
            "code": "INVALID_DOMAIN",
            "message": "Domain not valid"
        })
        with pytest.raises(Exception, match="Domain not valid"):
            client.add_domain("bad")
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_purelymail.py -v`
Expected: FAIL — module not found

**Step 3: Implement Purelymail client**

Create `app/purelymail.py`:
```python
import httpx

BASE_URL = "https://purelymail.com"


class PurelymailError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


class PurelymailClient:
    def __init__(self, api_key: str):
        self.api_key = api_key

    def _post(self, endpoint: str, body: dict | None = None) -> dict:
        resp = httpx.post(
            f"{BASE_URL}/api/v0/{endpoint}",
            json=body or {},
            headers={"Purelymail-Api-Token": self.api_key},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("type") == "error":
            raise PurelymailError(data.get("code", "UNKNOWN"), data.get("message", "Unknown error"))
        return data

    def list_domains(self) -> list[dict]:
        return self._post("listDomains")["result"]

    def add_domain(self, domain_name: str) -> None:
        self._post("addDomain", {"domainName": domain_name})

    def delete_domain(self, domain_name: str) -> None:
        self._post("deleteDomain", {"name": domain_name})

    def get_ownership_code(self) -> str:
        return self._post("getOwnershipCode")["result"]["code"]

    def check_dns(self, domain_name: str) -> None:
        self._post("updateDomainSettings", {"name": domain_name, "recheckDns": True})

    def list_users(self) -> list[str]:
        return self._post("listUser")["result"]

    def create_user(self, user_name: str, domain_name: str, password: str) -> None:
        self._post("createUser", {
            "userName": user_name,
            "domainName": domain_name,
            "password": password,
        })

    def get_user(self, user_name: str) -> dict:
        return self._post("getUser", {"userName": user_name})["result"]

    def delete_user(self, user_name: str) -> None:
        self._post("deleteUser", {"userName": user_name})
```

**Step 4: Run tests**

Run: `pytest tests/test_purelymail.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: Purelymail API client with tests"
```

---

### Task 4: DNS Zone File Builder

**Files:**
- Create: `app/dns.py`
- Create: `tests/test_dns.py`

**Step 1: Write failing tests**

Create `tests/test_dns.py`:
```python
from app.dns import build_zone_file, DNS_RECORDS


def test_zone_file_contains_mx_record():
    zone = build_zone_file("example.com", "ownership-code-123")
    assert "mailserver.purelymail.com." in zone
    assert "MX" in zone


def test_zone_file_contains_spf():
    zone = build_zone_file("example.com", "ownership-code-123")
    assert "v=spf1 include:_spf.purelymail.com ~all" in zone


def test_zone_file_contains_ownership_txt():
    zone = build_zone_file("example.com", "ownership-code-123")
    assert "ownership-code-123" in zone


def test_zone_file_contains_dkim_cnames():
    zone = build_zone_file("example.com", "ownership-code-123")
    assert "purelymail1._domainkey.example.com." in zone
    assert "key1.dkimroot.purelymail.com." in zone
    assert "purelymail2._domainkey.example.com." in zone
    assert "key2.dkimroot.purelymail.com." in zone
    assert "purelymail3._domainkey.example.com." in zone
    assert "key3.dkimroot.purelymail.com." in zone


def test_zone_file_contains_dmarc():
    zone = build_zone_file("example.com", "ownership-code-123")
    assert "_dmarc.example.com." in zone
    assert "dmarcroot.purelymail.com." in zone


def test_dns_records_returns_list():
    records = DNS_RECORDS("example.com", "own-123")
    assert len(records) == 7
    types = [r["type"] for r in records]
    assert types.count("CNAME") == 4
    assert types.count("TXT") == 2
    assert types.count("MX") == 1
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_dns.py -v`
Expected: FAIL

**Step 3: Implement DNS module**

Create `app/dns.py`:
```python
def DNS_RECORDS(domain: str, ownership_code: str) -> list[dict]:
    return [
        {"type": "MX", "name": f"{domain}.", "value": "mailserver.purelymail.com.", "priority": 50},
        {"type": "TXT", "name": f"{domain}.", "value": f"v=spf1 include:_spf.purelymail.com ~all"},
        {"type": "TXT", "name": f"{domain}.", "value": ownership_code},
        {"type": "CNAME", "name": f"purelymail1._domainkey.{domain}.", "value": "key1.dkimroot.purelymail.com."},
        {"type": "CNAME", "name": f"purelymail2._domainkey.{domain}.", "value": "key2.dkimroot.purelymail.com."},
        {"type": "CNAME", "name": f"purelymail3._domainkey.{domain}.", "value": "key3.dkimroot.purelymail.com."},
        {"type": "CNAME", "name": f"_dmarc.{domain}.", "value": "dmarcroot.purelymail.com."},
    ]


def build_zone_file(domain: str, ownership_code: str) -> str:
    records = DNS_RECORDS(domain, ownership_code)
    lines = [f"; Purelymail DNS records for {domain}", f"; Import this file into Cloudflare via DNS > Records > Import", ""]
    for r in records:
        if r["type"] == "MX":
            lines.append(f'{r["name"]}\tIN\tMX\t{r["priority"]}\t{r["value"]}')
        elif r["type"] == "TXT":
            lines.append(f'{r["name"]}\tIN\tTXT\t"{r["value"]}"')
        elif r["type"] == "CNAME":
            lines.append(f'{r["name"]}\tIN\tCNAME\t{r["value"]}')
    lines.append("")
    return "\n".join(lines)
```

**Step 4: Run tests**

Run: `pytest tests/test_dns.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: DNS zone file builder for Cloudflare import"
```

---

### Task 5: Password Generator

**Files:**
- Create: `app/passwords.py`
- Create: `tests/test_passwords.py`

**Step 1: Write failing tests**

Create `tests/test_passwords.py`:
```python
import string
from app.passwords import generate_password


def test_default_length():
    pw = generate_password()
    assert len(pw) >= 24


def test_contains_uppercase():
    pw = generate_password()
    assert any(c in string.ascii_uppercase for c in pw)


def test_contains_lowercase():
    pw = generate_password()
    assert any(c in string.ascii_lowercase for c in pw)


def test_contains_digit():
    pw = generate_password()
    assert any(c in string.digits for c in pw)


def test_contains_symbol():
    pw = generate_password()
    assert any(c in string.punctuation for c in pw)


def test_unique():
    passwords = {generate_password() for _ in range(100)}
    assert len(passwords) == 100
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_passwords.py -v`
Expected: FAIL

**Step 3: Implement password generator**

Create `app/passwords.py`:
```python
import secrets
import string

ALPHABET = string.ascii_letters + string.digits + string.punctuation


def generate_password(length: int = 24) -> str:
    while True:
        password = "".join(secrets.choice(ALPHABET) for _ in range(length))
        if (
            any(c in string.ascii_uppercase for c in password)
            and any(c in string.ascii_lowercase for c in password)
            and any(c in string.digits for c in password)
            and any(c in string.punctuation for c in password)
        ):
            return password
```

**Step 4: Run tests**

Run: `pytest tests/test_passwords.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: cryptographically strong password generator"
```

---

### Task 6: Accounts API Routes

**Files:**
- Create: `app/routes/__init__.py` (empty)
- Create: `app/routes/accounts.py`
- Create: `tests/test_routes_accounts.py`

**Step 1: Write failing tests**

Create `tests/test_routes_accounts.py`:
```python
import json


def test_create_account(client):
    resp = client.post("/api/accounts", json={"name": "personal", "api_key": "pm_key_123"})
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["name"] == "personal"
    assert "id" in data
    assert "api_key" not in data  # should not return the key


def test_list_accounts(client):
    client.post("/api/accounts", json={"name": "work", "api_key": "pm_key_456"})
    resp = client.get("/api/accounts")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) >= 1
    assert data[0]["name"] == "work"
    assert "api_key" not in data[0]


def test_delete_account(client):
    resp = client.post("/api/accounts", json={"name": "temp", "api_key": "pm_key_789"})
    account_id = resp.get_json()["id"]
    resp = client.delete(f"/api/accounts/{account_id}")
    assert resp.status_code == 200
    resp = client.get("/api/accounts")
    names = [a["name"] for a in resp.get_json()]
    assert "temp" not in names


def test_update_account_cloudflare_token(client):
    resp = client.post("/api/accounts", json={"name": "cf", "api_key": "pm_key"})
    account_id = resp.get_json()["id"]
    resp = client.patch(f"/api/accounts/{account_id}", json={"cloudflare_token": "cf_token_123"})
    assert resp.status_code == 200


def test_create_account_missing_fields(client):
    resp = client.post("/api/accounts", json={"name": "no-key"})
    assert resp.status_code == 400
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_routes_accounts.py -v`
Expected: FAIL

**Step 3: Implement accounts routes**

Create `app/routes/__init__.py` (empty file).

Create `app/routes/accounts.py`:
```python
from flask import Blueprint, request, jsonify, current_app
from app.db import get_db
from app.crypto import encrypt, decrypt

bp = Blueprint("accounts", __name__, url_prefix="/api/accounts")


@bp.route("", methods=["GET"])
def list_accounts():
    db = get_db()
    rows = db.execute("SELECT id, name, cloudflare_token IS NOT NULL as has_cloudflare, created_at FROM accounts").fetchall()
    return jsonify([dict(id=r["id"], name=r["name"], has_cloudflare=bool(r["has_cloudflare"]), created_at=r["created_at"]) for r in rows])


@bp.route("", methods=["POST"])
def create_account():
    data = request.get_json()
    if not data or not data.get("name") or not data.get("api_key"):
        return jsonify({"error": "name and api_key are required"}), 400

    secret = current_app.config["SECRET_KEY"]
    encrypted_key = encrypt(data["api_key"], secret)
    encrypted_cf = encrypt(data["cloudflare_token"], secret) if data.get("cloudflare_token") else None

    db = get_db()
    cursor = db.execute(
        "INSERT INTO accounts (name, api_key, cloudflare_token) VALUES (?, ?, ?)",
        (data["name"], encrypted_key, encrypted_cf),
    )
    db.commit()
    return jsonify({"id": cursor.lastrowid, "name": data["name"]}), 201


@bp.route("/<int:account_id>", methods=["PATCH"])
def update_account(account_id):
    data = request.get_json()
    secret = current_app.config["SECRET_KEY"]
    db = get_db()

    if "cloudflare_token" in data:
        encrypted = encrypt(data["cloudflare_token"], secret) if data["cloudflare_token"] else None
        db.execute("UPDATE accounts SET cloudflare_token = ? WHERE id = ?", (encrypted, account_id))

    if "api_key" in data:
        db.execute("UPDATE accounts SET api_key = ? WHERE id = ?", (encrypt(data["api_key"], secret), account_id))

    db.commit()
    return jsonify({"ok": True})


@bp.route("/<int:account_id>", methods=["DELETE"])
def delete_account(account_id):
    db = get_db()
    db.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    db.commit()
    return jsonify({"ok": True})
```

**Step 4: Run tests**

Run: `pytest tests/test_routes_accounts.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: accounts CRUD API routes"
```

---

### Task 7: Domains API Routes

**Files:**
- Create: `app/routes/domains.py`
- Create: `tests/test_routes_domains.py`

**Step 1: Write failing tests**

Create `tests/test_routes_domains.py`:
```python
from unittest.mock import patch, MagicMock
import json


def _seed_account(client):
    resp = client.post("/api/accounts", json={"name": "test", "api_key": "pm_key"})
    return resp.get_json()["id"]


class TestListDomains:
    @patch("app.routes.domains._get_pm_client")
    def test_list_domains(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_client.list_domains.return_value = [
            {"name": "example.com", "dnsSummary": {"valid": True}}
        ]
        mock_get_client.return_value = mock_client

        resp = client.get(f"/api/domains?account_id={account_id}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["name"] == "example.com"


class TestAddDomain:
    @patch("app.routes.domains._get_pm_client")
    def test_add_domain(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_client.get_ownership_code.return_value = "own-abc123"
        mock_get_client.return_value = mock_client

        resp = client.post("/api/domains", json={
            "account_id": account_id,
            "domain_name": "newdomain.com"
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["domain"] == "newdomain.com"
        assert len(data["dns_records"]) == 7
        assert "zone_file" in data
        mock_client.add_domain.assert_called_once_with("newdomain.com")


class TestCheckDns:
    @patch("app.routes.domains._get_pm_client")
    def test_check_dns(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        resp = client.post("/api/domains/check-dns", json={
            "account_id": account_id,
            "domain_name": "example.com"
        })
        assert resp.status_code == 200
        mock_client.check_dns.assert_called_once_with("example.com")
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_routes_domains.py -v`
Expected: FAIL

**Step 3: Implement domains routes**

Create `app/routes/domains.py`:
```python
from flask import Blueprint, request, jsonify, current_app
from app.db import get_db
from app.crypto import decrypt
from app.purelymail import PurelymailClient
from app.dns import DNS_RECORDS, build_zone_file

bp = Blueprint("domains", __name__, url_prefix="/api/domains")


def _get_pm_client(account_id: int) -> PurelymailClient:
    db = get_db()
    row = db.execute("SELECT api_key FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not row:
        raise ValueError("Account not found")
    api_key = decrypt(row["api_key"], current_app.config["SECRET_KEY"])
    return PurelymailClient(api_key)


@bp.route("", methods=["GET"])
def list_domains():
    account_id = request.args.get("account_id", type=int)
    if not account_id:
        return jsonify({"error": "account_id is required"}), 400
    client = _get_pm_client(account_id)
    domains = client.list_domains()
    return jsonify(domains)


@bp.route("", methods=["POST"])
def add_domain():
    data = request.get_json()
    account_id = data.get("account_id")
    domain_name = data.get("domain_name")
    if not account_id or not domain_name:
        return jsonify({"error": "account_id and domain_name are required"}), 400

    client = _get_pm_client(account_id)
    client.add_domain(domain_name)
    ownership_code = client.get_ownership_code()
    records = DNS_RECORDS(domain_name, ownership_code)
    zone_file = build_zone_file(domain_name, ownership_code)

    db = get_db()
    db.execute(
        "INSERT INTO domains (name, account_id) VALUES (?, ?)",
        (domain_name, account_id),
    )
    db.commit()

    return jsonify({
        "domain": domain_name,
        "ownership_code": ownership_code,
        "dns_records": records,
        "zone_file": zone_file,
    }), 201


@bp.route("/check-dns", methods=["POST"])
def check_dns():
    data = request.get_json()
    account_id = data.get("account_id")
    domain_name = data.get("domain_name")
    if not account_id or not domain_name:
        return jsonify({"error": "account_id and domain_name are required"}), 400

    client = _get_pm_client(account_id)
    client.check_dns(domain_name)
    return jsonify({"ok": True, "message": "DNS recheck triggered"})
```

**Step 4: Run tests**

Run: `pytest tests/test_routes_domains.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: domains API routes with DNS zone file generation"
```

---

### Task 8: Users API Routes

**Files:**
- Create: `app/routes/users.py`
- Create: `tests/test_routes_users.py`

**Step 1: Write failing tests**

Create `tests/test_routes_users.py`:
```python
from unittest.mock import patch, MagicMock


def _seed_account(client):
    resp = client.post("/api/accounts", json={"name": "test", "api_key": "pm_key"})
    return resp.get_json()["id"]


def _seed_domain(client, account_id):
    from app.db import get_db
    from flask import g
    # Directly insert to avoid mocking Purelymail for domain creation
    with client.application.app_context():
        db = get_db()
        cursor = db.execute(
            "INSERT INTO domains (name, account_id) VALUES (?, ?)",
            ("example.com", account_id),
        )
        db.commit()
        return cursor.lastrowid


class TestCreateUsers:
    @patch("app.routes.users._get_pm_client")
    def test_create_single_user(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        resp = client.post("/api/users", json={
            "account_id": account_id,
            "domain_name": "example.com",
            "usernames": ["alice"],
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert len(data["users"]) == 1
        assert data["users"][0]["email"] == "alice@example.com"
        assert "password" in data["users"][0]
        assert "webmail_url" in data["users"][0]
        mock_client.create_user.assert_called_once()

    @patch("app.routes.users._get_pm_client")
    def test_create_multiple_users(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        resp = client.post("/api/users", json={
            "account_id": account_id,
            "domain_name": "example.com",
            "usernames": ["alice", "bob", "carol"],
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert len(data["users"]) == 3
        assert mock_client.create_user.call_count == 3


class TestListUsers:
    @patch("app.routes.users._get_pm_client")
    def test_list_users_for_domain(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_client.list_users.return_value = [
            "alice@example.com", "bob@example.com", "other@different.com"
        ]
        mock_get_client.return_value = mock_client

        resp = client.get(f"/api/users?account_id={account_id}&domain=example.com")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 2  # filtered to example.com only


class TestMailSettings:
    def test_mail_settings(self, client):
        resp = client.get("/api/users/mail-settings")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["imap"]["server"] == "imap.purelymail.com"
        assert data["smtp"]["server"] == "smtp.purelymail.com"
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_routes_users.py -v`
Expected: FAIL

**Step 3: Implement users routes**

Create `app/routes/users.py`:
```python
from flask import Blueprint, request, jsonify, current_app
from app.db import get_db
from app.crypto import decrypt, encrypt
from app.purelymail import PurelymailClient
from app.passwords import generate_password

bp = Blueprint("users", __name__, url_prefix="/api/users")

WEBMAIL_URL = "https://purelymail.com/webmail"

MAIL_SETTINGS = {
    "imap": {"server": "imap.purelymail.com", "port": 993, "security": "SSL/TLS"},
    "smtp": {"server": "smtp.purelymail.com", "port": 465, "security": "SSL/TLS"},
    "smtp_alt": {"server": "smtp.purelymail.com", "port": 587, "security": "STARTTLS"},
}


def _get_pm_client(account_id: int) -> PurelymailClient:
    db = get_db()
    row = db.execute("SELECT api_key FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not row:
        raise ValueError("Account not found")
    api_key = decrypt(row["api_key"], current_app.config["SECRET_KEY"])
    return PurelymailClient(api_key)


@bp.route("", methods=["POST"])
def create_users():
    data = request.get_json()
    account_id = data.get("account_id")
    domain_name = data.get("domain_name")
    usernames = data.get("usernames", [])

    if not account_id or not domain_name or not usernames:
        return jsonify({"error": "account_id, domain_name, and usernames are required"}), 400

    client = _get_pm_client(account_id)
    secret = current_app.config["SECRET_KEY"]
    db = get_db()

    # Get or create domain record
    domain_row = db.execute(
        "SELECT id FROM domains WHERE name = ? AND account_id = ?",
        (domain_name, account_id),
    ).fetchone()
    if domain_row:
        domain_id = domain_row["id"]
    else:
        cursor = db.execute(
            "INSERT INTO domains (name, account_id) VALUES (?, ?)",
            (domain_name, account_id),
        )
        db.commit()
        domain_id = cursor.lastrowid

    created = []
    for username in usernames:
        password = generate_password()
        email = f"{username}@{domain_name}"
        client.create_user(username, domain_name, password)

        db.execute(
            "INSERT INTO users (email, password, domain_id, account_id) VALUES (?, ?, ?, ?)",
            (email, encrypt(password, secret), domain_id, account_id),
        )
        created.append({
            "email": email,
            "password": password,
            "webmail_url": WEBMAIL_URL,
        })

    db.commit()
    return jsonify({"users": created, "mail_settings": MAIL_SETTINGS}), 201


@bp.route("", methods=["GET"])
def list_users():
    account_id = request.args.get("account_id", type=int)
    domain = request.args.get("domain")
    if not account_id:
        return jsonify({"error": "account_id is required"}), 400

    client = _get_pm_client(account_id)
    all_users = client.list_users()

    if domain:
        all_users = [u for u in all_users if u.endswith(f"@{domain}")]

    return jsonify(all_users)


@bp.route("/mail-settings", methods=["GET"])
def mail_settings():
    return jsonify(MAIL_SETTINGS)
```

**Step 4: Run tests**

Run: `pytest tests/test_routes_users.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: users API routes with password generation and mail settings"
```

---

### Task 9: History API Routes

**Files:**
- Create: `app/routes/history.py`
- Create: `tests/test_routes_history.py`

**Step 1: Write failing tests**

Create `tests/test_routes_history.py`:
```python
from unittest.mock import patch, MagicMock


def _seed_data(client):
    resp = client.post("/api/accounts", json={"name": "test", "api_key": "pm_key"})
    account_id = resp.get_json()["id"]

    with patch("app.routes.users._get_pm_client") as mock:
        mock.return_value = MagicMock()
        client.post("/api/users", json={
            "account_id": account_id,
            "domain_name": "example.com",
            "usernames": ["alice", "bob"],
        })
    return account_id


def test_history_returns_users(client):
    _seed_data(client)
    resp = client.get("/api/history")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["users"]) == 2


def test_history_search(client):
    _seed_data(client)
    resp = client.get("/api/history?q=alice")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["users"]) == 1
    assert "alice" in data["users"][0]["email"]


def test_history_includes_passwords(client):
    _seed_data(client)
    resp = client.get("/api/history")
    data = resp.get_json()
    for user in data["users"]:
        assert "password" in user
        assert len(user["password"]) > 0
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_routes_history.py -v`
Expected: FAIL

**Step 3: Implement history routes**

Create `app/routes/history.py`:
```python
from flask import Blueprint, request, jsonify, current_app
from app.db import get_db
from app.crypto import decrypt

bp = Blueprint("history", __name__, url_prefix="/api/history")


@bp.route("", methods=["GET"])
def get_history():
    q = request.args.get("q", "")
    secret = current_app.config["SECRET_KEY"]
    db = get_db()

    if q:
        users = db.execute(
            """SELECT u.email, u.password, u.created_at, d.name as domain, a.name as account
               FROM users u
               JOIN domains d ON u.domain_id = d.id
               JOIN accounts a ON u.account_id = a.id
               WHERE u.email LIKE ?
               ORDER BY u.created_at DESC""",
            (f"%{q}%",),
        ).fetchall()
    else:
        users = db.execute(
            """SELECT u.email, u.password, u.created_at, d.name as domain, a.name as account
               FROM users u
               JOIN domains d ON u.domain_id = d.id
               JOIN accounts a ON u.account_id = a.id
               ORDER BY u.created_at DESC"""
        ).fetchall()

    domains = db.execute(
        """SELECT d.name, d.created_at, a.name as account
           FROM domains d
           JOIN accounts a ON d.account_id = a.id
           ORDER BY d.created_at DESC"""
    ).fetchall()

    return jsonify({
        "users": [
            {
                "email": row["email"],
                "password": decrypt(row["password"], secret),
                "domain": row["domain"],
                "account": row["account"],
                "created_at": row["created_at"],
            }
            for row in users
        ],
        "domains": [
            {
                "name": row["name"],
                "account": row["account"],
                "created_at": row["created_at"],
            }
            for row in domains
        ],
    })
```

**Step 4: Run tests**

Run: `pytest tests/test_routes_history.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: history API with search and decrypted password lookup"
```

---

### Task 10: Frontend — Layout and Settings Page

**Files:**
- Create: `static/index.html`
- Create: `static/style.css`
- Create: `static/app.js`

This task builds the HTML shell and Settings page. The frontend is vanilla JS with no build step. Uses a simple CSS framework (Pico CSS via CDN) for clean default styling.

**Step 1: Implement the HTML shell**

Create `static/index.html` — single page app with nav tabs for Settings, Domains, Users, History. Each "page" is a `<section>` that gets shown/hidden.

Key elements:
- Top nav with account switcher dropdown and page tabs
- Settings section: form to add accounts (name, API key, optional Cloudflare token), list of existing accounts with delete buttons
- Domains section: placeholder
- Users section: placeholder
- History section: placeholder

**Step 2: Implement style.css**

Minimal custom CSS on top of Pico CSS. Mainly layout tweaks: nav styling, card layouts, status indicators (green/red dots for DNS), copy buttons.

**Step 3: Implement app.js**

JavaScript module with:
- `api` object: thin wrapper around `fetch()` for all API calls
- `router`: shows/hides sections based on nav clicks
- `settings`: renders account list, handles add/delete forms
- `accountSwitcher`: populates the dropdown, stores active account ID

**Step 4: Test manually**

Run: `docker compose up --build`
Open: http://localhost:8080
Verify: Can add an account, see it in the list, delete it, switch between nav tabs.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: frontend shell with settings page"
```

---

### Task 11: Frontend — Domains Page

**Files:**
- Modify: `static/app.js`
- Modify: `static/index.html`

**Step 1: Add domains section to index.html**

- Domain list with DNS status indicators (green check / red X)
- "Add Domain" form: single text input + submit button
- Results panel: shows DNS records table, "Download Zone File" button, "Push to Cloudflare" button (if Cloudflare configured), "Check DNS" button

**Step 2: Add domains module to app.js**

- `domains.load()`: calls `GET /api/domains?account_id=N`, renders list
- `domains.add()`: calls `POST /api/domains`, shows results with DNS records
- `domains.downloadZone()`: triggers file download of the zone file text
- `domains.checkDns()`: calls `POST /api/domains/check-dns`, refreshes status

**Step 3: Test manually**

This requires a real Purelymail API key to test the add flow. For local testing without a key, verify the UI renders correctly and API calls are made (check Network tab).

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: frontend domains page with DNS export"
```

---

### Task 12: Frontend — Users Page

**Files:**
- Modify: `static/app.js`
- Modify: `static/index.html`

**Step 1: Add users section to index.html**

- Domain picker dropdown (populated from API)
- Existing users list for selected domain
- "Add Users" form: textarea for usernames (one per line)
- Results panel: table with email, password, webmail link
- "Copy All" button (copies credentials to clipboard)
- Expandable "Mail Client Settings" section

**Step 2: Add users module to app.js**

- `users.loadDomains()`: populates domain dropdown
- `users.loadUsers()`: calls `GET /api/users?account_id=N&domain=D`
- `users.create()`: calls `POST /api/users`, renders results table
- `users.copyAll()`: formats credentials and copies to clipboard
- `users.toggleMailSettings()`: shows/hides IMAP/SMTP details

**Step 3: Test manually**

Verify: domain dropdown populates, can enter usernames, results display correctly.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: frontend users page with bulk creation"
```

---

### Task 13: Frontend — History Page

**Files:**
- Modify: `static/app.js`
- Modify: `static/index.html`

**Step 1: Add history section to index.html**

- Search input at top
- Two tables: domains created, users created
- Each user row shows email, password (with show/hide toggle), domain, account, date

**Step 2: Add history module to app.js**

- `history.load()`: calls `GET /api/history`, renders tables
- `history.search()`: calls `GET /api/history?q=term`, debounced on keyup
- Password toggle: click to reveal/hide

**Step 3: Test manually**

Verify: history shows previously created items, search filters correctly.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: frontend history page with search"
```

---

### Task 14: Cloudflare DNS Push (Optional Feature)

**Files:**
- Create: `app/cloudflare.py`
- Create: `tests/test_cloudflare.py`
- Modify: `app/routes/domains.py`

**Step 1: Write failing tests**

Create `tests/test_cloudflare.py`:
```python
from unittest.mock import patch, MagicMock
from app.cloudflare import CloudflareClient


@pytest.fixture
def cf_client():
    return CloudflareClient(api_token="cf_token_123")


class TestGetZoneId:
    @patch("app.cloudflare.httpx.get")
    def test_finds_zone(self, mock_get, cf_client):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: {"result": [{"id": "zone123", "name": "example.com"}], "success": True}
        )
        zone_id = cf_client.get_zone_id("example.com")
        assert zone_id == "zone123"


class TestCreateRecords:
    @patch("app.cloudflare.httpx.post")
    @patch("app.cloudflare.httpx.get")
    def test_creates_dns_record(self, mock_get, mock_post, cf_client):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: {"result": [{"id": "zone123", "name": "example.com"}], "success": True}
        )
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"success": True}
        )
        results = cf_client.push_records("example.com", [
            {"type": "MX", "name": "example.com.", "value": "mailserver.purelymail.com.", "priority": 50}
        ])
        assert len(results) == 1
        assert results[0]["success"]
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_cloudflare.py -v`
Expected: FAIL

**Step 3: Implement Cloudflare client**

Create `app/cloudflare.py`:
```python
import httpx

CF_API = "https://api.cloudflare.com/client/v4"


class CloudflareClient:
    def __init__(self, api_token: str):
        self.headers = {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}

    def get_zone_id(self, domain: str) -> str:
        resp = httpx.get(f"{CF_API}/zones", params={"name": domain}, headers=self.headers, timeout=30)
        resp.raise_for_status()
        zones = resp.json()["result"]
        if not zones:
            raise ValueError(f"Zone not found for {domain}")
        return zones[0]["id"]

    def push_records(self, domain: str, records: list[dict]) -> list[dict]:
        zone_id = self.get_zone_id(domain)
        results = []
        for record in records:
            body = {
                "type": record["type"],
                "name": record["name"].rstrip("."),
                "content": record["value"].rstrip("."),
            }
            if record.get("priority"):
                body["priority"] = record["priority"]
            resp = httpx.post(
                f"{CF_API}/zones/{zone_id}/dns_records",
                json=body,
                headers=self.headers,
                timeout=30,
            )
            data = resp.json()
            results.append({"record": record["name"], "success": data.get("success", False), "errors": data.get("errors", [])})
        return results
```

**Step 4: Add push endpoint to domains routes**

Add to `app/routes/domains.py`:
```python
@bp.route("/push-cloudflare", methods=["POST"])
def push_to_cloudflare():
    data = request.get_json()
    account_id = data.get("account_id")
    domain_name = data.get("domain_name")
    ownership_code = data.get("ownership_code")

    db = get_db()
    row = db.execute("SELECT cloudflare_token FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not row or not row["cloudflare_token"]:
        return jsonify({"error": "No Cloudflare token configured"}), 400

    cf_token = decrypt(row["cloudflare_token"], current_app.config["SECRET_KEY"])
    cf = CloudflareClient(cf_token)
    records = DNS_RECORDS(domain_name, ownership_code)
    results = cf.push_records(domain_name, records)
    return jsonify({"results": results})
```

**Step 5: Run tests**

Run: `pytest tests/ -v`
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: Cloudflare DNS push integration"
```

---

### Task 15: Docker Polish and Final Integration

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `README.md`

**Step 1: Finalize Dockerfile**

Add a healthcheck, non-root user, and proper layer caching:
```dockerfile
FROM python:3.12-slim

RUN useradd -m -r mailamator
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chown -R mailamator:mailamator /app
USER mailamator

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/')" || exit 1

CMD ["gunicorn", "-b", "0.0.0.0:8080", "app.main:app"]
```

**Step 2: Finalize docker-compose.yml**

Add restart policy, healthcheck dependency:
```yaml
services:
  mailamator:
    build: .
    restart: unless-stopped
    ports:
      - "${MAILAMATOR_PORT:-8080}:8080"
    volumes:
      - mailamator-data:/data
    environment:
      - MAILAMATOR_SECRET=${MAILAMATOR_SECRET}
      - MAILAMATOR_DB=/data/mailamator.db

volumes:
  mailamator-data:
```

**Step 3: Finalize README.md**

Complete the README with:
- Project description and screenshot placeholder
- Quick start instructions
- Configuration reference
- How to get a Purelymail API key
- How to get a Cloudflare API token (optional)
- Contributing section
- License

**Step 4: Run full test suite**

Run: `pytest tests/ -v`
Expected: All tests PASS

**Step 5: Build and smoke test Docker image**

Run: `docker compose up --build`
Verify: App loads, can add account, add domain, create users.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: Docker polish, README, and final integration"
```

---

### Task 16: Push to GitHub

**Step 1: Push all commits**

```bash
git push -u origin main
```

**Step 2: Verify on GitHub**

Check that the repo at github.com/kgNatx/mailamator shows all files and README renders correctly.
