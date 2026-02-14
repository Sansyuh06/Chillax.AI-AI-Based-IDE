"""
ShopLegacy — main entry point.
A simple WSGI‑style app that routes requests to handlers.
(This is intentionally old‑school for demo purposes.)
"""

from app.routes.users import (
    handle_register, handle_login, handle_profile, handle_list_users,
)
from app.routes.products import (
    handle_list_products, handle_product_detail, handle_search,
    handle_create_product, handle_update_stock,
)
from app.routes.orders import (
    handle_checkout, handle_order_history, handle_order_detail,
    handle_cancel_order,
)
from app.database import get_connection
from config import DEBUG


ROUTES = {
    "POST /register": handle_register,
    "POST /login": handle_login,
    "GET /profile": handle_profile,
    "GET /users": handle_list_users,
    "GET /products": handle_list_products,
    "GET /products/search": handle_search,
    "POST /products": handle_create_product,
    "POST /checkout": handle_checkout,
    "GET /orders": handle_order_history,
}


def dispatch(method: str, path: str, data: dict = None, token: str = None):
    """
    Ghetto router — matches method + path to a handler.
    """
    key = f"{method.upper()} {path}"
    handler = ROUTES.get(key)
    if handler is None:
        return {"error": "Not found", "status": 404}

    # Inject the right args based on handler expectations
    import inspect
    sig = inspect.signature(handler)
    kwargs = {}
    if "data" in sig.parameters:
        kwargs["data"] = data or {}
    if "token" in sig.parameters:
        kwargs["token"] = token or ""
    if "category" in sig.parameters:
        kwargs["category"] = (data or {}).get("category")
    if "q" in sig.parameters:
        kwargs["q"] = (data or {}).get("q", "")

    return handler(**kwargs)


def main():
    """Dev entry point — run a few test requests."""
    if DEBUG:
        print("=== ShopLegacy dev mode ===")
    db = get_connection()

    # Seed a test product
    from app.database import execute, query
    if not query("SELECT id FROM products LIMIT 1"):
        execute(
            "INSERT INTO products (name, description, price, stock, category) "
            "VALUES (?, ?, ?, ?, ?)",
            ("Widget Pro", "A premium widget", 29.99, 100, "gadgets"),
        )
        execute(
            "INSERT INTO products (name, description, price, stock, category) "
            "VALUES (?, ?, ?, ?, ?)",
            ("Mega Cable", "10ft braided USB‑C", 12.50, 250, "accessories"),
        )
        print("Seeded sample products.")

    # Quick smoke test
    result = dispatch("POST", "/register", {
        "username": "alice", "email": "alice@example.com", "password": "pass123"
    })
    print("Register:", result)

    result = dispatch("POST", "/login", {
        "username": "alice", "password": "pass123"
    })
    print("Login:", result)


if __name__ == "__main__":
    main()
