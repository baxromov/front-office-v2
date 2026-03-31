import os
import httpx
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from minio import Minio
from minio.error import S3Error

from src.api.database import init_db, get_db
from src.api.auth import async_hash_password, async_verify_password, create_token, decode_token

load_dotenv()

LANGGRAPH_URL = os.getenv("LANGGRAPH_URL", "http://localhost:2024")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:397b-cloud")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "documents")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"


def get_minio() -> Minio:
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=MINIO_SECURE,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    db = get_db()
    if not await db.users.find_one({"username": "admin"}):
        await db.users.insert_one({
            "username": "admin",
            "password_hash": await async_hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "created_at": datetime.now(timezone.utc),
        })
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bearer = HTTPBearer()


def _user_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "username": doc["username"],
        "role": doc["role"],
        "created_at": doc.get("created_at", "").isoformat() if doc.get("created_at") else "",
    }


async def current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    db = get_db()
    doc = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not doc:
        raise HTTPException(status_code=401, detail="User not found")
    return _user_out(doc)


async def admin_user(user=Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin required")
    return user


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    db = get_db()
    doc = await db.users.find_one({"username": req.username})
    if not doc or not await async_verify_password(req.password, doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token({"sub": str(doc["_id"]), "username": doc["username"], "role": doc["role"]})
    return {"token": token, "user": _user_out(doc)}


@app.get("/api/auth/me")
async def me(user=Depends(current_user)):
    return user


# ── Admin ─────────────────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"


@app.get("/api/admin/users")
async def list_users(user=Depends(admin_user)):
    db = get_db()
    docs = await db.users.find({}, {"password_hash": 0}).sort("created_at", 1).to_list(None)
    return [_user_out(d) for d in docs]


@app.post("/api/admin/users", status_code=201)
async def create_user(req: CreateUserRequest, user=Depends(admin_user)):
    db = get_db()
    if await db.users.find_one({"username": req.username}):
        raise HTTPException(status_code=400, detail="Username already exists")
    result = await db.users.insert_one({
        "username": req.username,
        "password_hash": await async_hash_password(req.password),
        "role": req.role,
        "created_at": datetime.now(timezone.utc),
    })
    doc = await db.users.find_one({"_id": result.inserted_id})
    return _user_out(doc)


@app.delete("/api/admin/users/{user_id}", status_code=204)
async def delete_user(user_id: str, user=Depends(admin_user)):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db = get_db()
    await db.users.delete_one({"_id": ObjectId(user_id)})


class IngestRequest(BaseModel):
    bucket: str | None = None
    force: bool = False


@app.post("/api/admin/ingest")
async def trigger_ingest(req: IngestRequest, user=Depends(admin_user)):
    import asyncio
    from src.ingestion.ingest import run_ingestion
    db = get_db()
    settings_doc = await db.settings.find_one({"_id": "global"}) or {}
    chunk_size = int(settings_doc.get("chunk_size", 800))
    chunk_overlap = int(settings_doc.get("chunk_overlap", 150))
    result = await asyncio.to_thread(
        run_ingestion,
        bucket=req.bucket,
        force=req.force,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
    return result


@app.post("/api/admin/upload")
async def upload_files(files: list[UploadFile] = File(...), user=Depends(admin_user)):
    minio = get_minio()
    if not minio.bucket_exists(MINIO_BUCKET):
        minio.make_bucket(MINIO_BUCKET)

    uploaded = []
    errors = []
    for file in files:
        try:
            data = await file.read()
            import io
            minio.put_object(
                MINIO_BUCKET,
                file.filename,
                io.BytesIO(data),
                length=len(data),
                content_type=file.content_type or "application/octet-stream",
            )
            uploaded.append(file.filename)
        except S3Error as e:
            errors.append({"file": file.filename, "error": str(e)})

    return {"uploaded": uploaded, "errors": errors}


# ── Threads ───────────────────────────────────────────────────────────────────

@app.post("/api/threads")
async def create_thread(user=Depends(current_user)):
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{LANGGRAPH_URL}/threads", json={})
        resp.raise_for_status()
        data = resp.json()
    thread_id = data["thread_id"]
    db = get_db()
    await db.threads.insert_one({
        "_id": thread_id,
        "user_id": user["id"],
        "title": "New chat",
        "created_at": datetime.now(timezone.utc),
    })
    return {"thread_id": thread_id, "title": "New chat"}


@app.get("/api/threads")
async def list_threads(user=Depends(current_user)):
    db = get_db()
    docs = await db.threads.find({"user_id": user["id"]}).sort("created_at", -1).to_list(None)
    return [{"id": d["_id"], "title": d["title"], "created_at": d["created_at"].isoformat()} for d in docs]


@app.delete("/api/threads/{thread_id}", status_code=204)
async def delete_thread(thread_id: str, user=Depends(current_user)):
    db = get_db()
    await db.threads.delete_one({"_id": thread_id, "user_id": user["id"]})


@app.patch("/api/threads/{thread_id}/title")
async def update_title(thread_id: str, body: dict, user=Depends(current_user)):
    db = get_db()
    await db.threads.update_one(
        {"_id": thread_id, "user_id": user["id"]},
        {"$set": {"title": body.get("title", "New chat")}}
    )
    return {"ok": True}


@app.get("/api/threads/{thread_id}/messages")
async def get_messages(thread_id: str, user=Depends(current_user)):
    db = get_db()
    if not await db.threads.find_one({"_id": thread_id, "user_id": user["id"]}):
        raise HTTPException(status_code=404)
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{LANGGRAPH_URL}/threads/{thread_id}/state")
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        state = resp.json()
    messages = state.get("values", {}).get("messages", [])
    return [m for m in messages if m.get("type") in ("human", "ai") and m.get("content")]


@app.get("/api/threads/{thread_id}/sources")
async def get_sources(thread_id: str, user=Depends(current_user)):
    import re
    db = get_db()
    if not await db.threads.find_one({"_id": thread_id, "user_id": user["id"]}):
        raise HTTPException(status_code=404)
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{LANGGRAPH_URL}/threads/{thread_id}/state")
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        state = resp.json()
    messages = state.get("values", {}).get("messages", [])
    sources = []
    seen = set()
    for m in messages:
        if m.get("type") == "tool":
            content = m.get("content", "")
            for match in re.finditer(r'\[Source:\s*([^\]]+)\]', content):
                raw = match.group(1).strip()
                # Extract just the filename (after last /)
                filename = raw.split("/")[-1]
                if filename not in seen:
                    seen.add(filename)
                    sources.append(filename)
    return sources


@app.post("/api/threads/{thread_id}/stream")
async def stream_message(thread_id: str, body: dict, user=Depends(current_user)):
    db = get_db()
    if not await db.threads.find_one({"_id": thread_id, "user_id": user["id"]}):
        raise HTTPException(status_code=404)

    async def event_stream():
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                f"{LANGGRAPH_URL}/threads/{thread_id}/runs/stream",
                json={
                    "assistant_id": "agent",
                    "input": {"messages": [{"role": "user", "content": body["message"]}]},
                    "stream_mode": "messages",
                },
            ) as resp:
                async for line in resp.aiter_lines():
                    if line:
                        yield line + "\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ── Settings ──────────────────────────────────────────────────────────────────

class SettingsModel(BaseModel):
    temperature: float
    max_tokens: int
    chunk_size: int
    chunk_overlap: int
    top_k: int


@app.get("/api/settings")
async def get_settings(user=Depends(current_user)):
    db = get_db()
    doc = await db.settings.find_one({"_id": "global"}) or {}
    doc.pop("_id", None)
    return doc


@app.put("/api/settings")
async def update_settings(body: SettingsModel, user=Depends(admin_user)):
    db = get_db()
    await db.settings.update_one(
        {"_id": "global"},
        {"$set": body.model_dump()},
        upsert=True,
    )
    doc = await db.settings.find_one({"_id": "global"}) or {}
    doc.pop("_id", None)
    return doc


# ── Search ────────────────────────────────────────────────────────────────────

@app.post("/api/search")
async def search(body: dict, user=Depends(current_user)):
    import asyncio
    from src.agent.search import run_search

    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query required")

    db = get_db()
    settings_doc = await db.settings.find_one({"_id": "global"}) or {}
    top_k = int(body.get("top_k") or settings_doc.get("top_k", 5))

    try:
        chunks = await asyncio.to_thread(run_search, query, top_k)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"chunks": chunks}


@app.post("/api/search/answer")
async def search_answer(body: dict, user=Depends(current_user)):
    import json

    query = (body.get("query") or "").strip()
    chunks = body.get("chunks") or []
    if not query:
        raise HTTPException(status_code=400, detail="query required")

    db = get_db()
    settings_doc = await db.settings.find_one({"_id": "global"}) or {}
    temperature = float(settings_doc.get("temperature", 0.7))
    max_tokens = int(settings_doc.get("max_tokens", 1024))

    async def event_stream():
        try:
            context = "\n\n---\n\n".join(
                f"[Source: {c['source']}]\n{c['text']}" for c in chunks
            ) if chunks else "No relevant documents found."
            ollama_messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a helpful assistant. "
                        "Use the following retrieved document chunks to answer the user's question. "
                        "Answer in the same language the user used."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Context:\n{context}\n\nQuestion: {query}",
                },
            ]
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": OLLAMA_MODEL,
                        "messages": ollama_messages,
                        "stream": True,
                        "think": False,
                        "options": {
                            "temperature": temperature,
                            "num_predict": max_tokens,
                        },
                    },
                ) as resp:
                    if resp.status_code != 200:
                        err = await resp.aread()
                        raise Exception(f"Ollama error {resp.status_code}: {err.decode()}")
                    async for line in resp.aiter_lines():
                        if line:
                            try:
                                data = json.loads(line)
                                if data.get("message", {}).get("thinking"):
                                    continue
                                token = data.get("message", {}).get("content", "")
                                if token:
                                    yield f"event: llm_token\ndata: {json.dumps({'token': token})}\n\n"
                            except Exception:
                                pass
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
