"""Send signed test webhooks to a HookReplay capture URL."""
import argparse
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request

PAYLOAD = {"id": "evt_test_123", "event": "payment.captured", "amount": 49900, "currency": "INR"}


def compact(obj) -> bytes:
    return json.dumps(obj, separators=(",", ":")).encode()


def sign(provider: str, secret: str, body: bytes, ts: int) -> dict:
    key = secret.encode()
    if provider == "razorpay":
        return {
            "X-Razorpay-Signature": hmac.new(key, body, hashlib.sha256).hexdigest(),
            "X-Razorpay-Event-Id": "evt_test_123",
        }
    if provider == "github":
        digest = hmac.new(key, body, hashlib.sha256).hexdigest()
        return {"X-Hub-Signature-256": f"sha256={digest}", "X-GitHub-Event": "ping"}
    signed = f"{ts}.".encode() + body
    digest = hmac.new(key, signed, hashlib.sha256).hexdigest()
    return {"Stripe-Signature": f"t={ts},v1={digest}"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("provider", choices=["razorpay", "stripe", "github"])
    ap.add_argument("--secret", default="whsec_test_secret")
    ap.add_argument(
        "--case",
        default="valid",
        choices=["valid", "wrong-secret", "tampered", "reserialized", "old"],
    )
    args = ap.parse_args()

    now = int(time.time())
    signed_body = compact(PAYLOAD)
    sent_body = signed_body
    secret = args.secret
    ts = now

    if args.case == "wrong-secret":
        secret = args.secret + "x"
    elif args.case == "tampered":
        sent_body = compact({**PAYLOAD, "amount": 1})  # changed after signing
    elif args.case == "reserialized":
        sent_body = json.dumps(PAYLOAD, indent=2).encode()  # signed compact, sent pretty
    elif args.case == "old":
        ts = now - 3600

    headers = sign(args.provider, secret, signed_body, ts)
    req = urllib.request.Request(
        args.url,
        data=sent_body,
        method="POST",
        headers={"Content-Type": "application/json", **headers},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(resp.status, resp.read().decode())
    except urllib.error.HTTPError as e:
        print(e.code, e.read().decode())


if __name__ == "__main__":
    main()