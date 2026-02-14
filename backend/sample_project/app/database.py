"""
Database helpers — wraps SQLite via raw SQL for "legacy" flavour.
"""

import sqlite3
from config import DATABASE_URL


_conn = None


def get_connection():
    """Return a shared DB connection (not thread‑safe, it's legacy!)."""
    global _conn
    if _conn is None:
        db_path = DATABASE_URL.replace("sqlite:///", "")
        _conn = sqlite3.connect(db_path, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _init_tables(_conn)
    return _conn


def _init_tables(conn):
    """Create tables if they don't exist yet."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            stock INTEGER DEFAULT 0,
            category TEXT
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            total REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER REFERENCES orders(id),
            product_id INTEGER REFERENCES products(id),
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL
        );
    """)
    conn.commit()


def query(sql, params=(), one=False):
    """Execute a SELECT and return rows as dicts."""
    conn = get_connection()
    cur = conn.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    return rows[0] if one and rows else rows


def execute(sql, params=()):
    """Execute an INSERT / UPDATE / DELETE and return lastrowid."""
    conn = get_connection()
    cur = conn.execute(sql, params)
    conn.commit()
    return cur.lastrowid
