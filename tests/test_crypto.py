from app.crypto import encrypt, decrypt


def test_round_trip():
    secret = "test-secret-key"
    plaintext = "pm_api_key_abc123"
    encrypted = encrypt(plaintext, secret)
    assert encrypted != plaintext
    assert decrypt(encrypted, secret) == plaintext


def test_different_secrets_produce_different_ciphertext():
    plaintext = "pm_api_key_abc123"
    enc1 = encrypt(plaintext, "secret-one")
    enc2 = encrypt(plaintext, "secret-two")
    assert enc1 != enc2


def test_wrong_secret_fails():
    import pytest
    encrypted = encrypt("data", "right-key")
    with pytest.raises(Exception):
        decrypt(encrypted, "wrong-key")
