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
