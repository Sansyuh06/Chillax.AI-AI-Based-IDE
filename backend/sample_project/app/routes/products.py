"""
Product routes — listing, detail, search, admin CRUD.
"""

from app.database import query, execute
from app.models import Product


def handle_list_products(category: str = None) -> dict:
    """GET /products — optionally filter by category."""
    if category:
        rows = query("SELECT * FROM products WHERE category = ?", (category,))
    else:
        rows = query("SELECT * FROM products")
    return {"products": rows, "status": 200}


def handle_product_detail(product_id: int) -> dict:
    """GET /products/<id>."""
    row = query("SELECT * FROM products WHERE id = ?", (product_id,), one=True)
    if not row:
        return {"error": "Product not found", "status": 404}
    return {"product": row, "status": 200}


def handle_search(q: str) -> dict:
    """GET /products/search?q=... — simple LIKE search."""
    rows = query(
        "SELECT * FROM products WHERE name LIKE ? OR description LIKE ?",
        (f"%{q}%", f"%{q}%"),
    )
    return {"results": rows, "count": len(rows), "status": 200}


def handle_create_product(data: dict) -> dict:
    """POST /products — admin creates a product."""
    name = data.get("name", "").strip()
    price = float(data.get("price", 0))
    if not name or price <= 0:
        return {"error": "Invalid product data", "status": 400}
    pid = execute(
        "INSERT INTO products (name, description, price, stock, category) VALUES (?, ?, ?, ?, ?)",
        (name, data.get("description", ""), price,
         int(data.get("stock", 0)), data.get("category", "")),
    )
    return {"product_id": pid, "status": 201}


def handle_update_stock(product_id: int, delta: int) -> dict:
    """PATCH /products/<id>/stock — adjust stock level."""
    product = query("SELECT * FROM products WHERE id = ?", (product_id,), one=True)
    if not product:
        return {"error": "Product not found", "status": 404}
    new_stock = product["stock"] + delta
    if new_stock < 0:
        return {"error": "Insufficient stock", "status": 400}
    execute("UPDATE products SET stock = ? WHERE id = ?", (new_stock, product_id))
    return {"product_id": product_id, "new_stock": new_stock, "status": 200}
