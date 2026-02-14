"""
General‑purpose helper functions used across the project.
"""

import re
import json
from datetime import datetime


def slugify(text: str) -> str:
    """Convert a string to a URL‑friendly slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"[\s_]+", "-", text)


def format_price(amount: float) -> str:
    """Display a price with $ and two decimals."""
    return f"${amount:,.2f}"


def parse_date(date_str: str) -> datetime | None:
    """Try several date formats and return a datetime, or None."""
    formats = ["%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y", "%m/%d/%Y"]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None


def paginate(items: list, page: int = 1, per_page: int = 20) -> dict:
    """Return a paginated slice of items with metadata."""
    start = (page - 1) * per_page
    end = start + per_page
    return {
        "items": items[start:end],
        "page": page,
        "per_page": per_page,
        "total": len(items),
        "pages": (len(items) + per_page - 1) // per_page,
    }


def safe_json_loads(raw: str, default=None):
    """Parse JSON without raising — returns default on failure."""
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default


def truncate(text: str, max_len: int = 200) -> str:
    """Truncate text with an ellipsis."""
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"
