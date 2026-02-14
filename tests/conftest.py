import os
import tempfile
import pytest
from app import create_app


@pytest.fixture
def app():
    db_fd, db_path = tempfile.mkstemp()
    app = create_app(test_config={
        "DATABASE": db_path,
        "SECRET_KEY": "test-secret-key",
        "TESTING": True,
    })

    with app.app_context():
        from app.db import init_db
        init_db()

    yield app

    os.close(db_fd)
    os.unlink(db_path)


@pytest.fixture
def client(app):
    return app.test_client()
