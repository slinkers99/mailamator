from flask import Blueprint, request, jsonify, current_app
from app.db import get_db
from app.crypto import decrypt
from app.purelymail import PurelymailClient

bp = Blueprint("routing", __name__, url_prefix="/api/routing")


def _get_pm_client(account_id: int) -> PurelymailClient:
    db = get_db()
    row = db.execute("SELECT api_key FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not row:
        raise ValueError("Account not found")
    api_key = decrypt(row["api_key"], current_app.config["SECRET_KEY"])
    return PurelymailClient(api_key)


@bp.route("", methods=["GET"])
def list_rules():
    account_id = request.args.get("account_id", type=int)
    domain = request.args.get("domain")
    if not account_id:
        return jsonify({"error": "account_id is required"}), 400

    client = _get_pm_client(account_id)
    rules = client.list_routing_rules()

    if domain:
        rules = [r for r in rules if r.get("domainName") == domain]

    return jsonify(rules)


@bp.route("", methods=["POST"])
def create_rule():
    data = request.get_json()
    account_id = data.get("account_id")
    domain_name = data.get("domain_name")
    match_user = data.get("match_user", "")
    target_addresses = data.get("target_addresses", [])
    prefix = data.get("prefix", False)
    catchall = data.get("catchall", False)

    if not account_id or not domain_name or not target_addresses:
        return jsonify({"error": "account_id, domain_name, and target_addresses are required"}), 400

    client = _get_pm_client(account_id)
    client.create_routing_rule(
        domain_name=domain_name,
        match_user=match_user,
        target_addresses=target_addresses,
        prefix=prefix,
        catchall=catchall,
    )

    return jsonify({"message": "Routing rule created."}), 201


@bp.route("/<int:rule_id>", methods=["DELETE"])
def delete_rule(rule_id):
    account_id = request.args.get("account_id", type=int)
    if not account_id:
        return jsonify({"error": "account_id is required"}), 400

    client = _get_pm_client(account_id)
    client.delete_routing_rule(rule_id)

    return jsonify({"message": "Routing rule deleted."})
