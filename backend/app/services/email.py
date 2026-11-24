from email.message import EmailMessage

import aiosmtplib

from app import config


async def send_otp_email(to: str, code: str) -> None:
    if not config.SMTP_HOST:
        # Dev mode: no SMTP configured, print the code instead
        print(f"\n[DEV] OTP for {to}: {code}\n", flush=True)
        return

    msg = EmailMessage()
    msg["From"] = config.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = "Your HookReplay verification code"
    msg.set_content(
        f"Your verification code is {code}.\n\n"
        f"It expires in {config.OTP_TTL_MINUTES} minutes. "
        "If you didn't request this, you can ignore this email."
    )
    await aiosmtplib.send(
        msg,
        hostname=config.SMTP_HOST,
        port=config.SMTP_PORT,
        username=config.SMTP_USER,
        password=config.SMTP_PASSWORD,
        start_tls=True,
    )