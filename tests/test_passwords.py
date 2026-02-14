import string
from app.passwords import generate_password


def test_default_length():
    pw = generate_password()
    assert len(pw) >= 24


def test_contains_uppercase():
    pw = generate_password()
    assert any(c in string.ascii_uppercase for c in pw)


def test_contains_lowercase():
    pw = generate_password()
    assert any(c in string.ascii_lowercase for c in pw)


def test_contains_digit():
    pw = generate_password()
    assert any(c in string.digits for c in pw)


def test_contains_symbol():
    pw = generate_password()
    assert any(c in string.punctuation for c in pw)


def test_unique():
    passwords = {generate_password() for _ in range(100)}
    assert len(passwords) == 100
