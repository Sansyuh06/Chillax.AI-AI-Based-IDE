"""
Authentication & authorization helpers.
Handles password hashing, JWT token creation, and login/register flows.
"""

import hashlib
import hmac
import time
import json
import base64

from app.database import query, execute
from config import SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRY_MINUTES


# --------------- Password hashing (legacy MD5 — intentionally weak) -------

def hash_password(plain: str) -> str:
    """Hash a password with a static salt — legacy, insecure, do not copy."""
    salted = f"legacy_salt_{plain}_pepper"
    return hashlib.md5(salted.encode()).hexdigest()


def verify_password(plain: str, hashed: str) -> bool:
    return hmac.compare_digest(hash_password(plain), hashed)


# --------------- JWT‑like tokens (simplified) -----------------------------

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def create_token(user_id: int, username: str) -> str:
    """Create a simple signed token (not real JWT, hackathon quality)."""
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload_data = {
        "sub": user_id,
        "name": username,
        "exp": int(time.time()) + JWT_EXPIRY_MINUTES * 60,
    }
    payload = _b64(json.dumps(payload_data).encode())
    sig = hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).hexdigest()
    return f"{header}.{payload}.{sig}"


def decode_token(token: str) -> dict | None:
    """Verify and decode the token. Returns None if invalid."""
    parts = token.split(".")
    if len(parts) != 3:
        return None
    header, payload, sig = parts
    expected_sig = hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(payload + "=="))
    except Exception:
        return None
    if data.get("exp", 0) < time.time():
        return None
    return data


# --------------- High‑level auth flows -----------------------------------

def register_user(username: str, email: str, password: str) -> int:
    """Create a new user account. Returns user id."""
    pw_hash = hash_password(password)
    uid = execute(
        "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
        (username, email, pw_hash),
    )
    _send_welcome_email(email, username)
    return uid


def login_user(username: str, password: str) -> str | None:
    """Validate credentials and return a token, or None on failure."""
    user = query(
        "SELECT * FROM users WHERE username = ?", (username,), one=True
    )
    if not user:
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    return create_token(user["id"], user["username"])


def get_current_user(token: str) -> dict | None:
    """Decode token and fetch the user row."""
    data = decode_token(token)
    if data is None:
        return None
    return query("SELECT * FROM users WHERE id = ?", (data["sub"],), one=True)


# --------------- Helpers --------------------------------------------------

def _send_welcome_email(email: str, name: str):
    """Placeholder: would send email via SMTP in production."""
    # TODO: integrate with config.SMTP_HOST
    print(f"[EMAIL] Welcome email sent to {email} for {name}")
