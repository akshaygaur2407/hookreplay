import os

from dotenv import load_dotenv

load_dotenv()

AUTH_SECRET = os.getenv("AUTH_SECRET", "dev-only-change-me")
COOKIE_NAME = "hr_session"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
SESSION_DAYS = 7

OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_SECONDS = 60

FRONTEND_ORIGINS = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM", "HookReplay <no-reply@hookreplay.local>")

CLEANUP_ENABLED = os.getenv("CLEANUP_ENABLED", "true").lower() == "true"
CLEANUP_INTERVAL_MINUTES = int(os.getenv("CLEANUP_INTERVAL_MINUTES", "60"))
ENDPOINT_GRACE_DAYS = int(os.getenv("ENDPOINT_GRACE_DAYS", "7"))