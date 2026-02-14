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
