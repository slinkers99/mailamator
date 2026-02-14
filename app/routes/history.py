from flask import Blueprint, request, jsonify, current_app
from app.db import get_db
from app.crypto import decrypt

bp = Blueprint("history", __name__, url_prefix="/api/history")


@bp.route("", methods=["GET"])
def get_history():
    q = request.args.get("q", "")
    secret = current_app.config["SECRET_KEY"]
    db = get_db()

    if q:
        users = db.execute(
            """SELECT u.email, u.password, u.created_at, d.name as domain, a.name as account
               FROM users u
               JOIN domains d ON u.domain_id = d.id
               JOIN accounts a ON u.account_id = a.id
               WHERE u.email LIKE ?
               ORDER BY u.created_at DESC""",
            (f"%{q}%",),
        ).fetchall()
    else:
        users = db.execute(
            """SELECT u.email, u.password, u.created_at, d.name as domain, a.name as account
               FROM users u
               JOIN domains d ON u.domain_id = d.id
               JOIN accounts a ON u.account_id = a.id
               ORDER BY u.created_at DESC"""
        ).fetchall()

    domains = db.execute(
        """SELECT d.name, d.created_at, a.name as account
           FROM domains d
           JOIN accounts a ON d.account_id = a.id
           ORDER BY d.created_at DESC"""
    ).fetchall()

    return jsonify({
        "users": [
            {
                "email": row["email"],
                "password": decrypt(row["password"], secret),
                "domain": row["domain"],
                "account": row["account"],
                "created_at": row["created_at"],
            }
            for row in users
        ],
        "domains": [
            {
                "name": row["name"],
                "account": row["account"],
                "created_at": row["created_at"],
            }
            for row in domains
        ],
    })
