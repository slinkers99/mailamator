import pytest
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

    @patch("app.cloudflare.httpx.get")
    def test_raises_on_missing_zone(self, mock_get, cf_client):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: {"result": [], "success": True}
        )
        with pytest.raises(ValueError, match="Zone not found"):
            cf_client.get_zone_id("nonexistent.com")


class TestPushRecords:
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

    @patch("app.cloudflare.httpx.post")
    @patch("app.cloudflare.httpx.get")
    def test_strips_trailing_dots(self, mock_get, mock_post, cf_client):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: {"result": [{"id": "zone123", "name": "example.com"}], "success": True}
        )
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"success": True}
        )
        cf_client.push_records("example.com", [
            {"type": "CNAME", "name": "_dmarc.example.com.", "value": "dmarcroot.purelymail.com."}
        ])
        call_body = mock_post.call_args.kwargs["json"]
        assert not call_body["name"].endswith(".")
        assert not call_body["content"].endswith(".")
