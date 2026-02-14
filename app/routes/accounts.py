from flask import Blueprint, request, jsonify, current_app
from app.db import get_db
from app.crypto import encrypt, decrypt

bp = Blueprint("accounts", __name__, url_prefix="/api/accounts")


@bp.route("", methods=["GET"])
def list_accounts():
    db = get_db()
    rows = db.execute("SELECT id, name, cloudflare_token IS NOT NULL as has_cloudflare, created_at FROM accounts").fetchall()
    return jsonify([dict(id=r["id"], name=r["name"], has_cloudflare=bool(r["has_cloudflare"]), created_at=r["created_at"]) for r in rows])


@bp.route("", methods=["POST"])
def create_account():
    data = request.get_json()
    if not data or not data.get("name") or not data.get("api_key"):
        return jsonify({"error": "name and api_key are required"}), 400

    secret = current_app.config["SECRET_KEY"]
    encrypted_key = encrypt(data["api_key"], secret)
    encrypted_cf = encrypt(data["cloudflare_token"], secret) if data.get("cloudflare_token") else None

    db = get_db()
    cursor = db.execute(
        "INSERT INTO accounts (name, api_key, cloudflare_token) VALUES (?, ?, ?)",
        (data["name"], encrypted_key, encrypted_cf),
    )
    db.commit()
    return jsonify({"id": cursor.lastrowid, "name": data["name"]}), 201


@bp.route("/<int:account_id>", methods=["PATCH"])
def update_account(account_id):
    data = request.get_json()
    secret = current_app.config["SECRET_KEY"]
    db = get_db()

    if "cloudflare_token" in data:
        encrypted = encrypt(data["cloudflare_token"], secret) if data["cloudflare_token"] else None
        db.execute("UPDATE accounts SET cloudflare_token = ? WHERE id = ?", (encrypted, account_id))

    if "api_key" in data:
        db.execute("UPDATE accounts SET api_key = ? WHERE id = ?", (encrypt(data["api_key"], secret), account_id))

    db.commit()
    return jsonify({"ok": True})


@bp.route("/<int:account_id>", methods=["DELETE"])
def delete_account(account_id):
    db = get_db()
    db.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    db.commit()
    return jsonify({"ok": True})
