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
        result = self._post("listDomains")["result"]
        # API returns {"domains": [...]} nested inside result
        if isinstance(result, dict) and "domains" in result:
            return result["domains"]
        return result

    def add_domain(self, domain_name: str) -> None:
        self._post("addDomain", {"domainName": domain_name})

    def delete_domain(self, domain_name: str) -> None:
        self._post("deleteDomain", {"name": domain_name})

    def get_ownership_code(self) -> str:
        return self._post("getOwnershipCode")["result"]["code"]

    def check_dns(self, domain_name: str) -> None:
        self._post("updateDomainSettings", {"name": domain_name, "recheckDns": True})

    def list_users(self) -> list[str]:
        result = self._post("listUser")["result"]
        # API returns {"users": [...]} nested inside result
        if isinstance(result, dict) and "users" in result:
            return result["users"]
        return result

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

    def modify_user(self, user_name: str, **kwargs) -> None:
        body = {"userName": user_name}
        if "new_password" in kwargs:
            body["newPassword"] = kwargs["new_password"]
        self._post("modifyUser", body)

    def list_routing_rules(self) -> list[dict]:
        result = self._post("listRoutingRules")["result"]
        if isinstance(result, dict) and "rules" in result:
            return result["rules"]
        return result

    def create_routing_rule(self, domain_name: str, match_user: str,
                            target_addresses: list[str], prefix: bool = False,
                            catchall: bool = False) -> None:
        self._post("createRoutingRule", {
            "domainName": domain_name,
            "matchUser": match_user,
            "targetAddresses": target_addresses,
            "prefix": prefix,
            "catchall": catchall,
        })

    def delete_routing_rule(self, rule_id: int) -> None:
        self._post("deleteRoutingRule", {"routingRuleId": rule_id})
