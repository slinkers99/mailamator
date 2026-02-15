from unittest.mock import patch, MagicMock


def _seed_account(client):
    resp = client.post("/api/accounts", json={"name": "test", "api_key": "pm_key"})
    return resp.get_json()["id"]


class TestListRoutingRules:
    @patch("app.routes.routing._get_pm_client")
    def test_list_all_rules(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_client.list_routing_rules.return_value = [
            {"id": 1, "domainName": "example.com", "matchUser": "info",
             "targetAddresses": ["bob@example.com"], "prefix": False, "catchall": False},
            {"id": 2, "domainName": "other.com", "matchUser": "",
             "targetAddresses": ["catch@other.com"], "prefix": False, "catchall": True},
        ]
        mock_get_client.return_value = mock_client

        resp = client.get(f"/api/routing?account_id={account_id}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 2

    @patch("app.routes.routing._get_pm_client")
    def test_list_rules_filtered_by_domain(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_client.list_routing_rules.return_value = [
            {"id": 1, "domainName": "example.com", "matchUser": "info",
             "targetAddresses": ["bob@example.com"], "prefix": False, "catchall": False},
            {"id": 2, "domainName": "other.com", "matchUser": "",
             "targetAddresses": ["catch@other.com"], "prefix": False, "catchall": True},
        ]
        mock_get_client.return_value = mock_client

        resp = client.get(f"/api/routing?account_id={account_id}&domain=example.com")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["domainName"] == "example.com"

    def test_list_rules_requires_account_id(self, client):
        resp = client.get("/api/routing")
        assert resp.status_code == 400


class TestCreateRoutingRule:
    @patch("app.routes.routing._get_pm_client")
    def test_create_exact_match_rule(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        resp = client.post("/api/routing", json={
            "account_id": account_id,
            "domain_name": "example.com",
            "match_user": "info",
            "target_addresses": ["bob@example.com"],
        })
        assert resp.status_code == 201
        mock_client.create_routing_rule.assert_called_once_with(
            domain_name="example.com",
            match_user="info",
            target_addresses=["bob@example.com"],
            prefix=False,
            catchall=False,
        )

    @patch("app.routes.routing._get_pm_client")
    def test_create_catchall_rule(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        resp = client.post("/api/routing", json={
            "account_id": account_id,
            "domain_name": "example.com",
            "match_user": "",
            "target_addresses": ["catchall@example.com"],
            "catchall": True,
        })
        assert resp.status_code == 201
        mock_client.create_routing_rule.assert_called_once_with(
            domain_name="example.com",
            match_user="",
            target_addresses=["catchall@example.com"],
            prefix=False,
            catchall=True,
        )

    @patch("app.routes.routing._get_pm_client")
    def test_create_prefix_rule(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        resp = client.post("/api/routing", json={
            "account_id": account_id,
            "domain_name": "example.com",
            "match_user": "support",
            "target_addresses": ["team@example.com"],
            "prefix": True,
        })
        assert resp.status_code == 201
        mock_client.create_routing_rule.assert_called_once_with(
            domain_name="example.com",
            match_user="support",
            target_addresses=["team@example.com"],
            prefix=True,
            catchall=False,
        )

    def test_create_rule_missing_fields(self, client):
        account_id = _seed_account(client)
        resp = client.post("/api/routing", json={
            "account_id": account_id,
            "domain_name": "example.com",
        })
        assert resp.status_code == 400


class TestDeleteRoutingRule:
    @patch("app.routes.routing._get_pm_client")
    def test_delete_rule(self, mock_get_client, client):
        account_id = _seed_account(client)
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        resp = client.delete(f"/api/routing/42?account_id={account_id}")
        assert resp.status_code == 200
        mock_client.delete_routing_rule.assert_called_once_with(42)

    def test_delete_rule_requires_account_id(self, client):
        resp = client.delete("/api/routing/42")
        assert resp.status_code == 400
