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


def test_update_account_name(client):
    resp = client.post("/api/accounts", json={"name": "old-name", "api_key": "pm_key"})
    account_id = resp.get_json()["id"]
    resp = client.patch(f"/api/accounts/{account_id}", json={"name": "new-name"})
    assert resp.status_code == 200
    resp = client.get("/api/accounts")
    names = [a["name"] for a in resp.get_json()]
    assert "new-name" in names
    assert "old-name" not in names


def test_create_account_missing_fields(client):
    resp = client.post("/api/accounts", json={"name": "no-key"})
    assert resp.status_code == 400
