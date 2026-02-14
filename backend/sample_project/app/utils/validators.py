"""
Input validators — used by route handlers before touching the DB.
"""

import re


def validate_email(email: str) -> bool:
    """Basic email format check."""
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return bool(re.match(pattern, email))


def validate_username(username: str) -> tuple[bool, str]:
    """Username rules: 3‑30 chars, alphanumeric + underscores."""
    if len(username) < 3:
        return False, "Username must be at least 3 characters"
    if len(username) > 30:
        return False, "Username must be at most 30 characters"
    if not re.match(r"^[a-zA-Z0-9_]+$", username):
        return False, "Username may only contain letters, digits, and underscores"
    return True, ""


def validate_password(password: str) -> tuple[bool, str]:
    """Password rules: min 6 chars, at least one digit."""
    if len(password) < 6:
        return False, "Password must be at least 6 characters"
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one digit"
    return True, ""


def validate_price(price) -> tuple[bool, str]:
    """Price must be a positive number."""
    try:
        p = float(price)
    except (ValueError, TypeError):
        return False, "Price must be a number"
    if p <= 0:
        return False, "Price must be positive"
    return True, ""


def validate_quantity(qty) -> tuple[bool, str]:
    """Quantity must be a positive integer."""
    try:
        q = int(qty)
    except (ValueError, TypeError):
        return False, "Quantity must be an integer"
    if q < 1:
        return False, "Quantity must be at least 1"
    return True, ""
