import secrets


def generate_slug() -> str:
    # ~16 chars, URL-safe, unguessable
    return secrets.token_urlsafe(12)
