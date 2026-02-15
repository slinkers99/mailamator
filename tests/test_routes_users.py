from unittest.mock import patch, MagicMock


def _seed_account(client):
    resp = client.post("/api/accounts", json={"name": "test", "api_key": "pm_key"})
    return resp.get_json()["id"]


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
        mock_get_client.return_value = mock_client

        # Create users via the API (stored in local DB)
        client.post("/api/users", json={
            "account_id": account_id,
            "domain_name": "example.com",
            "usernames": ["alice", "bob"],
        })

        resp = client.get(f"/api/users?account_id={account_id}&domain=example.com")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 2
        emails = [u["email"] for u in data]
        assert "alice@example.com" in emails
        assert "bob@example.com" in emails
        assert "password" in data[0]
        assert "created_at" in data[0]


class TestMailSettings:
    def test_mail_settings(self, client):
        resp = client.get("/api/users/mail-settings")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["imap"]["server"] == "imap.purelymail.com"
        assert data["smtp"]["server"] == "smtp.purelymail.com"
