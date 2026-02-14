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
            "result": {"domains": [
                {"name": "example.com", "dnsSummary": {"passesMx": True, "passesSpf": True, "passesDkim": True, "passesDmarc": True}}
            ]}
        })
        domains = client.list_domains()
        assert len(domains) == 1
        assert domains[0]["name"] == "example.com"

    @patch("app.purelymail.httpx.post")
    def test_sends_auth_header(self, mock_post, client):
        mock_post.return_value = _mock_response({"type": "success", "result": {"domains": []}})
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
