"""
User routes — registration, login, profile.
"""

from app.auth import register_user, login_user, get_current_user
from app.database import query


def handle_register(data: dict) -> dict:
    """POST /register handler."""
    username = data.get("username", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")

    if not username or not email or not password:
        return {"error": "All fields are required", "status": 400}

    if len(password) < 6:
        return {"error": "Password too short", "status": 400}

    existing = query("SELECT id FROM users WHERE username = ?", (username,), one=True)
    if existing:
        return {"error": "Username already taken", "status": 409}

    uid = register_user(username, email, password)
    return {"user_id": uid, "message": "Account created", "status": 201}


def handle_login(data: dict) -> dict:
    """POST /login handler."""
    token = login_user(data.get("username", ""), data.get("password", ""))
    if token is None:
        return {"error": "Invalid credentials", "status": 401}
    return {"token": token, "status": 200}


def handle_profile(token: str) -> dict:
    """GET /profile handler."""
    user = get_current_user(token)
    if user is None:
        return {"error": "Unauthorized", "status": 401}
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "is_admin": bool(user["is_admin"]),
        "status": 200,
    }


def handle_list_users() -> dict:
    """GET /users — admin only (no check implemented yet!)."""
    users = query("SELECT id, username, email, is_admin FROM users")
    return {"users": users, "status": 200}
