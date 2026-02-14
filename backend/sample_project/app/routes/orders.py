"""
Order routes — checkout, order history, status updates.
"""

from app.database import query, execute
from app.auth import get_current_user
from app.routes.products import handle_update_stock
from app.models import Order, OrderItem


def handle_checkout(token: str, cart_items: list[dict]) -> dict:
    """
    POST /checkout
    cart_items: [{"product_id": 1, "quantity": 2}, ...]
    """
    user = get_current_user(token)
    if user is None:
        return {"error": "Unauthorized", "status": 401}

    if not cart_items:
        return {"error": "Cart is empty", "status": 400}

    # Validate products and calculate total
    total = 0.0
    validated_items = []
    for item in cart_items:
        product = query("SELECT * FROM products WHERE id = ?",
                        (item["product_id"],), one=True)
        if not product:
            return {"error": f"Product {item['product_id']} not found", "status": 404}
        if product["stock"] < item["quantity"]:
            return {"error": f"Insufficient stock for {product['name']}", "status": 400}
        line_total = product["price"] * item["quantity"]
        total += line_total
        validated_items.append({
            "product_id": product["id"],
            "quantity": item["quantity"],
            "unit_price": product["price"],
        })

    # Process payment (placeholder)
    payment_ok = _process_payment(user["id"], total)
    if not payment_ok:
        return {"error": "Payment failed", "status": 402}

    # Create order
    order_id = execute(
        "INSERT INTO orders (user_id, total, status) VALUES (?, ?, ?)",
        (user["id"], total, "confirmed"),
    )

    # Insert order items and decrement stock
    for vi in validated_items:
        execute(
            "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
            (order_id, vi["product_id"], vi["quantity"], vi["unit_price"]),
        )
        handle_update_stock(vi["product_id"], -vi["quantity"])

    _send_order_confirmation(user["email"], order_id, total)

    return {"order_id": order_id, "total": total, "status": 201}


def handle_order_history(token: str) -> dict:
    """GET /orders — current user's orders."""
    user = get_current_user(token)
    if user is None:
        return {"error": "Unauthorized", "status": 401}
    orders = query(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
        (user["id"],),
    )
    return {"orders": orders, "status": 200}


def handle_order_detail(token: str, order_id: int) -> dict:
    """GET /orders/<id>."""
    user = get_current_user(token)
    if user is None:
        return {"error": "Unauthorized", "status": 401}
    order = query("SELECT * FROM orders WHERE id = ? AND user_id = ?",
                  (order_id, user["id"]), one=True)
    if not order:
        return {"error": "Order not found", "status": 404}
    items = query("SELECT * FROM order_items WHERE order_id = ?", (order_id,))
    return {"order": order, "items": items, "status": 200}


def handle_cancel_order(token: str, order_id: int) -> dict:
    """POST /orders/<id>/cancel."""
    user = get_current_user(token)
    if user is None:
        return {"error": "Unauthorized", "status": 401}
    order = query("SELECT * FROM orders WHERE id = ? AND user_id = ?",
                  (order_id, user["id"]), one=True)
    if not order:
        return {"error": "Order not found", "status": 404}
    if order["status"] not in ("pending", "confirmed"):
        return {"error": "Cannot cancel order in this state", "status": 400}

    execute("UPDATE orders SET status = 'cancelled' WHERE id = ?", (order_id,))

    # Refund stock
    items = query("SELECT * FROM order_items WHERE order_id = ?", (order_id,))
    for item in items:
        handle_update_stock(item["product_id"], item["quantity"])

    return {"message": "Order cancelled", "status": 200}


# --------------- Helpers --------------------------------------------------

def _process_payment(user_id: int, amount: float) -> bool:
    """Placeholder payment processing — always succeeds in dev."""
    # TODO: call config.PAYMENT_GATEWAY_URL
    print(f"[PAYMENT] Charged ${amount:.2f} for user {user_id}")
    return True


def _send_order_confirmation(email: str, order_id: int, total: float):
    """Placeholder email notification."""
    print(f"[EMAIL] Order #{order_id} confirmed (${total:.2f}) for {email}")
