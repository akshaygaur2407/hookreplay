"""Tiny test receiver for HookReplay replays. Dev only.

Run from backend/:
    uvicorn receiver:app --app-dir ../scripts --port 9000
"""

import asyncio

from fastapi import FastAPI, Request, Response

app = FastAPI()


@app.api_route("/hook", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def hook(request: Request):
    body = await request.body()
    print(f"\n{request.method} /hook  ({len(body)} bytes)")
    print("body   :", body)
    print("headers:", dict(request.headers))
    return {"ok": True}


@app.api_route("/status/{code}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def status(code: int, request: Request):
    """Reply with any status code, to test how replay shows failures."""
    await request.body()
    return Response(content=f"you asked for {code}", status_code=code)


@app.api_route("/slow/{seconds}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def slow(seconds: float, request: Request):
    """Wait before replying, to test the replay timeout (it's 10 s)."""
    await request.body()
    await asyncio.sleep(seconds)
    return {"waited": seconds}
