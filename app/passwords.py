import secrets
import string

ALPHABET = string.ascii_letters + string.digits + string.punctuation


def generate_password(length: int = 24) -> str:
    while True:
        password = "".join(secrets.choice(ALPHABET) for _ in range(length))
        if (
            any(c in string.ascii_uppercase for c in password)
            and any(c in string.ascii_lowercase for c in password)
            and any(c in string.digits for c in password)
            and any(c in string.punctuation for c in password)
        ):
            return password
