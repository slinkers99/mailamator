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


class TestPrepareDomain:
    @patch("app.routes.domains._get_pm_client")
    def test_prepare_returns_dns_records(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_client.get_ownership_code.return_value = "own-abc123"
        mock_get_client.return_value = mock_client

        resp = client.post("/api/domains/prepare", json={
            "account_id": account_id,
            "domain_name": "newdomain.com"
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["domain"] == "newdomain.com"
        assert len(data["dns_records"]) == 7
        assert "zone_file" in data
        # Should NOT call add_domain
        mock_client.add_domain.assert_not_called()


class TestRegisterDomain:
    @patch("app.routes.domains._get_pm_client")
    def test_register_calls_add_domain(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        resp = client.post("/api/domains/register", json={
            "account_id": account_id,
            "domain_name": "newdomain.com"
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
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
