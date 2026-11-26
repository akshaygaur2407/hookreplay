from email.message import EmailMessage
from email.utils import formataddr

import aiosmtplib

from app import config


async def send_otp_email(to: str, code: str) -> None:
    if not config.SMTP_HOST:
        print(f"\n[DEV] OTP for {to}: {code}\n", flush=True)
        return

    msg = EmailMessage()
    msg["From"] = formataddr(("HookReplay", config.SMTP_FROM))
    msg["To"] = to
    msg["Subject"] = f"{code} is your HookReplay verification code"

    # Plain-text fallback
    text_content = f"""
Hi,

Use the verification code below to verify your HookReplay account.

Your verification code: {code}

This code expires in {config.OTP_TTL_MINUTES} minutes.

If you didn't request this code, you can safely ignore this email.

Thanks,
The HookReplay Team
"""

    # HTML email
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>HookReplay Verification</title>
    </head>
    <body style="
        margin: 0;
        padding: 40px 16px;
        background-color: #f4f5f7;
        font-family: Arial, Helvetica, sans-serif;
        color: #1f2937;
    ">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
                <td align="center">
                    <table role="presentation"
                           width="100%"
                           cellspacing="0"
                           cellpadding="0"
                           style="
                               max-width: 480px;
                               background: #ffffff;
                               border-radius: 12px;
                               overflow: hidden;
                               border: 1px solid #e5e7eb;
                           ">

                        <!-- Header -->
                        <tr>
                            <td style="
                                padding: 28px 32px;
                                background-color: #111827;
                                text-align: center;
                            ">
                                <h1 style="
                                    margin: 0;
                                    color: #ffffff;
                                    font-size: 24px;
                                    font-weight: 700;
                                    letter-spacing: -0.5px;
                                ">
                                    HookReplay
                                </h1>
                                <p style="
                                    margin: 8px 0 0;
                                    color: #9ca3af;
                                    font-size: 13px;
                                ">
                                    Webhook testing, simplified.
                                </p>
                            </td>
                        </tr>

                        <!-- Main Content -->
                        <tr>
                            <td style="padding: 36px 32px;">
                                <h2 style="
                                    margin: 0 0 12px;
                                    font-size: 21px;
                                    color: #111827;
                                ">
                                    Verify your email address
                                </h2>

                                <p style="
                                    margin: 0 0 28px;
                                    color: #6b7280;
                                    font-size: 14px;
                                    line-height: 1.7;
                                ">
                                    Thanks for signing up for HookReplay!
                                    Enter the verification code below to
                                    complete your email verification.
                                </p>

                                <!-- OTP -->
                                <div style="
                                    padding: 22px;
                                    background-color: #f9fafb;
                                    border: 1px solid #e5e7eb;
                                    border-radius: 10px;
                                    text-align: center;
                                ">
                                    <p style="
                                        margin: 0 0 12px;
                                        color: #6b7280;
                                        font-size: 12px;
                                        font-weight: 600;
                                        text-transform: uppercase;
                                        letter-spacing: 1.5px;
                                    ">
                                        Your verification code
                                    </p>

                                    <p style="
                                        margin: 0;
                                        color: #111827;
                                        font-size: 34px;
                                        font-weight: 700;
                                        letter-spacing: 8px;
                                        font-family: monospace;
                                    ">
                                        {code}
                                    </p>
                                </div>

                                <p style="
                                    margin: 22px 0 0;
                                    color: #6b7280;
                                    font-size: 13px;
                                    line-height: 1.6;
                                    text-align: center;
                                ">
                                    This code expires in
                                    <strong style="color: #111827;">
                                        {config.OTP_TTL_MINUTES} minutes
                                    </strong>.
                                </p>

                                <hr style="
                                    margin: 30px 0;
                                    border: none;
                                    border-top: 1px solid #e5e7eb;
                                ">

                                <p style="
                                    margin: 0;
                                    color: #9ca3af;
                                    font-size: 12px;
                                    line-height: 1.7;
                                ">
                                    If you didn't request this verification
                                    code, you can safely ignore this email.
                                    Someone may have entered your email
                                    address by mistake.
                                </p>
                            </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                            <td style="
                                padding: 20px 32px;
                                background-color: #f9fafb;
                                text-align: center;
                                border-top: 1px solid #e5e7eb;
                            ">
                                <p style="
                                    margin: 0;
                                    color: #9ca3af;
                                    font-size: 12px;
                                ">
                                    &copy; HookReplay. All rights reserved.
                                </p>
                                <p style="
                                    margin: 8px 0 0;
                                    color: #9ca3af;
                                    font-size: 11px;
                                ">
                                    This is an automated email.
                                    Please do not reply.
                                </p>
                            </td>
                        </tr>

                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    msg.set_content(text_content)
    msg.add_alternative(html_content, subtype="html")

    await aiosmtplib.send(
        msg,
        hostname=config.SMTP_HOST,
        port=config.SMTP_PORT,
        username=config.SMTP_USER,
        password=config.SMTP_PASSWORD,
        start_tls=True,
    )
