def DNS_RECORDS(domain: str, ownership_code: str) -> list[dict]:
    return [
        {"type": "MX", "name": f"{domain}.", "value": "mailserver.purelymail.com.", "priority": 50},
        {"type": "TXT", "name": f"{domain}.", "value": f"v=spf1 include:_spf.purelymail.com ~all"},
        {"type": "TXT", "name": f"{domain}.", "value": ownership_code},
        {"type": "CNAME", "name": f"purelymail1._domainkey.{domain}.", "value": "key1.dkimroot.purelymail.com."},
        {"type": "CNAME", "name": f"purelymail2._domainkey.{domain}.", "value": "key2.dkimroot.purelymail.com."},
        {"type": "CNAME", "name": f"purelymail3._domainkey.{domain}.", "value": "key3.dkimroot.purelymail.com."},
        {"type": "CNAME", "name": f"_dmarc.{domain}.", "value": "dmarcroot.purelymail.com."},
    ]


def build_zone_file(domain: str, ownership_code: str) -> str:
    records = DNS_RECORDS(domain, ownership_code)
    lines = [f"; Purelymail DNS records for {domain}", f"; Import this file into Cloudflare via DNS > Records > Import", ""]
    for r in records:
        if r["type"] == "MX":
            lines.append(f'{r["name"]}\tIN\tMX\t{r["priority"]}\t{r["value"]}')
        elif r["type"] == "TXT":
            lines.append(f'{r["name"]}\tIN\tTXT\t"{r["value"]}"')
        elif r["type"] == "CNAME":
            lines.append(f'{r["name"]}\tIN\tCNAME\t{r["value"]}')
    lines.append("")
    return "\n".join(lines)
