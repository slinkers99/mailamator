from flask import Blueprint, request, jsonify, current_app
from app.db import get_db
from app.crypto import decrypt
from app.purelymail import PurelymailClient, PurelymailError
from app.dns import DNS_RECORDS, build_zone_file
from app.cloudflare import CloudflareClient

bp = Blueprint("domains", __name__, url_prefix="/api/domains")


def _get_pm_client(account_id: int) -> PurelymailClient:
    db = get_db()
    row = db.execute("SELECT api_key FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not row:
        raise ValueError("Account not found")
    api_key = decrypt(row["api_key"], current_app.config["SECRET_KEY"])
    return PurelymailClient(api_key)


@bp.route("", methods=["GET"])
def list_domains():
    account_id = request.args.get("account_id", type=int)
    if not account_id:
        return jsonify({"error": "account_id is required"}), 400
    client = _get_pm_client(account_id)
    domains = client.list_domains()
    return jsonify(domains)


@bp.route("", methods=["POST"])
def add_domain():
    data = request.get_json()
    account_id = data.get("account_id")
    domain_name = data.get("domain_name")
    if not account_id or not domain_name:
        return jsonify({"error": "account_id and domain_name are required"}), 400

    client = _get_pm_client(account_id)

    # Try to add the domain; if it already exists on Purelymail, continue
    # so we can still return the DNS records the user needs.
    try:
        client.add_domain(domain_name)
    except PurelymailError:
        pass  # Domain may already exist — that's fine, proceed

    ownership_code = client.get_ownership_code()
    records = DNS_RECORDS(domain_name, ownership_code)
    zone_file = build_zone_file(domain_name, ownership_code)

    # Record locally (ignore if already tracked)
    db = get_db()
    existing = db.execute(
        "SELECT id FROM domains WHERE name = ? AND account_id = ?",
        (domain_name, account_id),
    ).fetchone()
    if not existing:
        db.execute(
            "INSERT INTO domains (name, account_id) VALUES (?, ?)",
            (domain_name, account_id),
        )
        db.commit()

    return jsonify({
        "domain": domain_name,
        "ownership_code": ownership_code,
        "dns_records": records,
        "zone_file": zone_file,
    }), 201


@bp.route("/check-dns", methods=["POST"])
def check_dns():
    data = request.get_json()
    account_id = data.get("account_id")
    domain_name = data.get("domain_name")
    if not account_id or not domain_name:
        return jsonify({"error": "account_id and domain_name are required"}), 400

    client = _get_pm_client(account_id)
    client.check_dns(domain_name)
    return jsonify({"ok": True, "message": "DNS recheck triggered"})


@bp.route("/push-cloudflare", methods=["POST"])
def push_to_cloudflare():
    data = request.get_json()
    account_id = data.get("account_id")
    domain_name = data.get("domain_name")
    ownership_code = data.get("ownership_code")

    if not account_id or not domain_name or not ownership_code:
        return jsonify({"error": "account_id, domain_name, and ownership_code are required"}), 400

    db = get_db()
    row = db.execute("SELECT cloudflare_token FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not row or not row["cloudflare_token"]:
        return jsonify({"error": "No Cloudflare token configured for this account"}), 400

    cf_token = decrypt(row["cloudflare_token"], current_app.config["SECRET_KEY"])
    cf = CloudflareClient(cf_token)
    records = DNS_RECORDS(domain_name, ownership_code)
    results = cf.push_records(domain_name, records)
    return jsonify({"results": results})
