from flask import Blueprint, request, jsonify, current_app
from app.db import get_db
from app.crypto import decrypt, encrypt
from app.purelymail import PurelymailClient
from app.passwords import generate_password

bp = Blueprint("users", __name__, url_prefix="/api/users")

WEBMAIL_URL = "https://purelymail.com/webmail"

MAIL_SETTINGS = {
    "imap": {"server": "imap.purelymail.com", "port": 993, "security": "SSL/TLS"},
    "smtp": {"server": "smtp.purelymail.com", "port": 465, "security": "SSL/TLS"},
    "smtp_alt": {"server": "smtp.purelymail.com", "port": 587, "security": "STARTTLS"},
}


def _get_pm_client(account_id: int) -> PurelymailClient:
    db = get_db()
    row = db.execute("SELECT api_key FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not row:
        raise ValueError("Account not found")
    api_key = decrypt(row["api_key"], current_app.config["SECRET_KEY"])
    return PurelymailClient(api_key)


@bp.route("", methods=["POST"])
def create_users():
    data = request.get_json()
    account_id = data.get("account_id")
    domain_name = data.get("domain_name")
    usernames = data.get("usernames", [])

    if not account_id or not domain_name or not usernames:
        return jsonify({"error": "account_id, domain_name, and usernames are required"}), 400

    client = _get_pm_client(account_id)
    secret = current_app.config["SECRET_KEY"]
    db = get_db()

    # Get or create domain record
    domain_row = db.execute(
        "SELECT id FROM domains WHERE name = ? AND account_id = ?",
        (domain_name, account_id),
    ).fetchone()
    if domain_row:
        domain_id = domain_row["id"]
    else:
        cursor = db.execute(
            "INSERT INTO domains (name, account_id) VALUES (?, ?)",
            (domain_name, account_id),
        )
        db.commit()
        domain_id = cursor.lastrowid

    created = []
    for username in usernames:
        password = generate_password()
        email = f"{username}@{domain_name}"
        client.create_user(username, domain_name, password)

        db.execute(
            "INSERT INTO users (email, password, domain_id, account_id) VALUES (?, ?, ?, ?)",
            (email, encrypt(password, secret), domain_id, account_id),
        )
        created.append({
            "email": email,
            "password": password,
            "webmail_url": WEBMAIL_URL,
        })

    db.commit()
    return jsonify({"users": created, "mail_settings": MAIL_SETTINGS}), 201


@bp.route("", methods=["GET"])
def list_users():
    account_id = request.args.get("account_id", type=int)
    domain = request.args.get("domain")
    if not account_id:
        return jsonify({"error": "account_id is required"}), 400

    client = _get_pm_client(account_id)
    all_users = client.list_users()

    if domain:
        all_users = [u for u in all_users if u.endswith(f"@{domain}")]

        # Enrich with local DB data (passwords, timestamps) where available
        secret = current_app.config["SECRET_KEY"]
        db = get_db()
        rows = db.execute(
            """SELECT u.email, u.password, u.created_at
               FROM users u
               JOIN domains d ON u.domain_id = d.id
               WHERE d.name = ? AND u.account_id = ?""",
            (domain, account_id),
        ).fetchall()
        local_data = {
            row["email"]: {
                "password": decrypt(row["password"], secret),
                "created_at": row["created_at"],
            }
            for row in rows
        }

        result = []
        for email in all_users:
            entry = {"email": email}
            if email in local_data:
                entry["password"] = local_data[email]["password"]
                entry["created_at"] = local_data[email]["created_at"]
            result.append(entry)
        return jsonify(result)

    return jsonify(all_users)


@bp.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json()
    account_id = data.get("account_id")
    email = data.get("email")

    if not account_id or not email:
        return jsonify({"error": "account_id and email are required"}), 400

    client = _get_pm_client(account_id)
    new_password = generate_password()
    client.modify_user(email, new_password=new_password)

    # Update local DB if we have a record for this user
    secret = current_app.config["SECRET_KEY"]
    db = get_db()
    db.execute(
        "UPDATE users SET password = ? WHERE email = ? AND account_id = ?",
        (encrypt(new_password, secret), email, account_id),
    )
    db.commit()

    return jsonify({"email": email, "password": new_password})


@bp.route("/mail-settings", methods=["GET"])
def mail_settings():
    return jsonify(MAIL_SETTINGS)
