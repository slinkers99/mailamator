from app.db import get_db, init_db


def test_init_creates_tables(app):
    with app.app_context():
        db = get_db()
        tables = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        table_names = {row["name"] for row in tables}
        assert "accounts" in table_names
        assert "domains" in table_names
        assert "users" in table_names


def test_accounts_crud(app):
    with app.app_context():
        db = get_db()
        db.execute(
            "INSERT INTO accounts (name, api_key) VALUES (?, ?)",
            ("test", "encrypted_key"),
        )
        db.commit()
        row = db.execute("SELECT * FROM accounts WHERE name = ?", ("test",)).fetchone()
        assert row["name"] == "test"
        assert row["api_key"] == "encrypted_key"
