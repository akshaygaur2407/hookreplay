from fastapi import FastAPI, Request

app = FastAPI()


@app.post("/hook")
async def hook(request: Request):
    body = await request.body()
    print("GOT:", body)
    return {"ok": True}