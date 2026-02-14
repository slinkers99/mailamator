import base64
import hashlib
from cryptography.fernet import Fernet


def _derive_key(secret: str) -> bytes:
    key = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(key)


def encrypt(plaintext: str, secret: str) -> str:
    f = Fernet(_derive_key(secret))
    return f.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str, secret: str) -> str:
    f = Fernet(_derive_key(secret))
    return f.decrypt(ciphertext.encode()).decode()
