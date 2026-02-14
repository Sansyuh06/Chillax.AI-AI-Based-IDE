"""
Data models — plain classes, no ORM (legacy style).
"""

from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime


@dataclass
class User:
    id: int = 0
    username: str = ""
    email: str = ""
    password_hash: str = ""
    is_admin: bool = False
    created_at: Optional[datetime] = None

    def is_privileged(self):
        return self.is_admin

    def display_name(self):
        return self.username or self.email.split("@")[0]


@dataclass
class Product:
    id: int = 0
    name: str = ""
    description: str = ""
    price: float = 0.0
    stock: int = 0
    category: str = ""

    def is_available(self):
        return self.stock > 0

    def apply_discount(self, pct: float):
        """Return discounted price (does NOT mutate self)."""
        return round(self.price * (1 - pct / 100), 2)


@dataclass
class OrderItem:
    product_id: int = 0
    quantity: int = 1
    unit_price: float = 0.0

    @property
    def subtotal(self):
        return self.quantity * self.unit_price


@dataclass
class Order:
    id: int = 0
    user_id: int = 0
    items: List[OrderItem] = field(default_factory=list)
    status: str = "pending"
    created_at: Optional[datetime] = None

    @property
    def total(self):
        return sum(item.subtotal for item in self.items)

    def add_item(self, product: Product, qty: int):
        self.items.append(OrderItem(
            product_id=product.id,
            quantity=qty,
            unit_price=product.price,
        ))
