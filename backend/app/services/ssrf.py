import asyncio
import ipaddress
import os
import socket
from urllib.parse import urlparse


class UnsafeTarget(Exception):
    pass


async def validate_target(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeTarget("Only http and https URLs are allowed")
    if not parsed.hostname:
        raise UnsafeTarget("URL has no host")

    # Dev escape hatch so you can replay to localhost. Never enable in production.
    if os.getenv("ALLOW_PRIVATE_TARGETS", "false").lower() == "true":
        return

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            parsed.hostname, port, type=socket.SOCK_STREAM
        )
    except socket.gaierror:
        raise UnsafeTarget("Could not resolve host")

    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if ip.version == 6 and ip.ipv4_mapped:
            ip = ip.ipv4_mapped  # ::ffff:127.0.0.1 style bypass
        if not ip.is_global:  # private, loopback, link-local, CGNAT, etc.
            raise UnsafeTarget("Target resolves to a non-public address")