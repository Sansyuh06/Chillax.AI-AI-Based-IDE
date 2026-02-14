"""
Application configuration — loaded once at startup.
"""

import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./shop.db")
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_MINUTES = 60

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.example.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "noreply@example.com")

PAYMENT_GATEWAY_URL = os.getenv("PAYMENT_GW", "https://pay.example.com/api/v1")
PAYMENT_API_KEY = os.getenv("PAYMENT_KEY", "pk_test_dummy")

DEBUG = os.getenv("DEBUG", "1") == "1"
