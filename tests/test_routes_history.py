from app.db import get_db
from app.crypto import encrypt


def _seed_data(client):
    with client.application.app_context():
        db = get_db()
        db.execute(
            "INSERT INTO accounts (name, api_key) VALUES (?, ?)",
            ("test", encrypt("pm_key", "test-secret-key")),
        )
        db.execute(
            "INSERT INTO domains (name, account_id) VALUES (?, ?)",
            ("example.com", 1),
        )
        db.execute(
            "INSERT INTO users (email, password, domain_id, account_id) VALUES (?, ?, ?, ?)",
            ("alice@example.com", encrypt("pass1", "test-secret-key"), 1, 1),
        )
        db.execute(
            "INSERT INTO users (email, password, domain_id, account_id) VALUES (?, ?, ?, ?)",
            ("bob@example.com", encrypt("pass2", "test-secret-key"), 1, 1),
        )
        db.commit()


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
