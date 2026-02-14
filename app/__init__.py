import os
from flask import Flask


def create_app():
    app = Flask(__name__, static_folder="../static", static_url_path="/static")
    app.config["SECRET_KEY"] = os.environ.get("MAILAMATOR_SECRET", "change-me-in-production")
    app.config["DATABASE"] = os.environ.get("MAILAMATOR_DB", "/data/mailamator.db")

    from app import db
    db.init_app(app)

    from app.routes import accounts, domains, users, history
    app.register_blueprint(accounts.bp)
    app.register_blueprint(domains.bp)
    app.register_blueprint(users.bp)
    app.register_blueprint(history.bp)

    @app.route("/")
    def index():
        return app.send_static_file("index.html")

    return app
