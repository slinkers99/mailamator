from app.dns import build_zone_file, DNS_RECORDS


def test_zone_file_contains_mx_record():
    zone = build_zone_file("example.com", "ownership-code-123")
    assert "mailserver.purelymail.com." in zone
    assert "MX" in zone


def test_zone_file_contains_spf():
    zone = build_zone_file("example.com", "ownership-code-123")
    assert "v=spf1 include:_spf.purelymail.com ~all" in zone


def test_zone_file_contains_ownership_txt():
    zone = build_zone_file("example.com", "ownership-code-123")
    assert "ownership-code-123" in zone


def test_zone_file_contains_dkim_cnames():
    zone = build_zone_file("example.com", "ownership-code-123")
    assert "purelymail1._domainkey.example.com." in zone
    assert "key1.dkimroot.purelymail.com." in zone
    assert "purelymail2._domainkey.example.com." in zone
    assert "key2.dkimroot.purelymail.com." in zone
    assert "purelymail3._domainkey.example.com." in zone
    assert "key3.dkimroot.purelymail.com." in zone


def test_zone_file_contains_dmarc():
    zone = build_zone_file("example.com", "ownership-code-123")
    assert "_dmarc.example.com." in zone
    assert "dmarcroot.purelymail.com." in zone


def test_dns_records_returns_list():
    records = DNS_RECORDS("example.com", "own-123")
    assert len(records) == 7
    types = [r["type"] for r in records]
    assert types.count("CNAME") == 4
    assert types.count("TXT") == 2
    assert types.count("MX") == 1
