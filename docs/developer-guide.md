# Front Office Pro — Developer Guide

AI-powered banking assistant with hybrid search (dense + BM25 + ColBERT reranking), document ingestion from MinIO, and a React chat UI.

---

## Architecture

```
Browser (React SPA)
    │ HTTP/REST + SSE
    ▼
FastAPI Backend :8000
    │
    ├── LangGraph Agent :2024
    │       └── search_documents tool
    │               ├── Dense:  sentence-transformers/all-MiniLM-L6-v2 (384-dim)
    │               ├── Sparse: Qdrant/bm25
    │               └── Rerank: colbert-ir/colbertv2.0
    │
    ├── Qdrant :6333       (vector storage)
    ├── MongoDB :27017     (users, threads, messages)
    ├── Redis :6379        (cache)
    └── MinIO :9000/:9001  (document storage)

Ollama :11434 (host machine) — LLM inference
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript 5.6, Tailwind CSS 3, Vite 6 |
| Backend | FastAPI, Python 3.12, Uvicorn |
| Agent | LangGraph 1.1+, LangChain-Ollama |
| Embeddings | FastEmbed (ONNX): MiniLM-L6-v2, BM25, ColBERT |
| Vector DB | Qdrant (hybrid dense+sparse+rerank) |
| Database | MongoDB 7 (Motor async) |
| Cache | Redis 7 |
| Storage | MinIO (S3-compatible) |
| LLM | Ollama (local) |
| Package manager | uv (Python), npm (JS) |

---

## Prerequisites

- Python 3.12+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- [Ollama](https://ollama.com) — local LLM
- Docker (for infrastructure services)

---

## Quick Start (Docker Compose)

```bash
# 1. Copy environment file
cp .env.example .env   # edit values as needed

# 2. Start all services
docker compose up -d

# 3. Open the app
open http://localhost:3000
```

> **Default credentials:** `admin` / `admin123`

---

## Manual Setup

### 1. Start infrastructure

```bash
# Qdrant
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant:latest

# MongoDB
docker run -d --name mongo -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password123 \
  mongo:7

# Redis
docker run -d --name redis -p 6379:6379 redis:7-alpine

# MinIO
docker run -d --name minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

### 2. Pull Ollama model

```bash
ollama pull qwen3.5:397b-cloud
# or any other model — set OLLAMA_MODEL in .env
```

### 3. Configure environment

```env
MONGO_URL=mongodb://admin:password123@127.0.0.1:27017
MONGO_DB=front_office
REDIS_URL=redis://127.0.0.1:6379

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.5:397b-cloud

QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=documents

DENSE_MODEL=sentence-transformers/all-MiniLM-L6-v2
SPARSE_MODEL=Qdrant/bm25
LATE_INTERACTION_MODEL=colbert-ir/colbertv2.0

MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=documents
MINIO_SECURE=false
```

### 4. Install dependencies

```bash
uv sync          # Python
cd frontend && npm install && cd ..
```

### 5. Run services (4 terminals)

```bash
# Terminal 1 — LangGraph agent
uv run langgraph dev
# → http://localhost:2024

# Terminal 2 — FastAPI backend
uv run uvicorn src.api.main:app --reload --port 8000
# → http://localhost:8000

# Terminal 3 — Frontend
cd frontend && npm run dev
# → http://localhost:3000
```

---

## Document Ingestion

### Option A — Admin UI
1. Login as `admin` / `admin123`
2. Go to **Admin Panel → Knowledge Base**
3. Upload PDF / DOCX / TXT files
4. Click **Upload & Ingest**

### Option B — CLI

```bash
# Ingest documents from MinIO bucket
uv run python -m src.ingestion.ingest

# Force re-ingest all files
uv run python -m src.ingestion.ingest --force

# Use a different bucket
uv run python -m src.ingestion.ingest --bucket my-bucket
```

### Option C — API

```bash
curl -X POST http://localhost:8000/api/admin/ingest \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

> If Qdrant collection has a stale vector config, reset it:
> `curl -X DELETE http://localhost:6333/collections/documents`

---

## Key URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| LangGraph Agent | http://localhost:2024 |
| Qdrant Dashboard | http://localhost:6333/dashboard |
| MinIO Console | http://localhost:9001 |

---

## Project Structure

```
front-office-pro/
├── docker-compose.yml
├── Dockerfile                   # FastAPI + LangGraph
├── Dockerfile.langgraph
├── langgraph.json               # LangGraph graph config
├── pyproject.toml               # Python dependencies
├── src/
│   ├── agent/
│   │   └── graph.py             # LangGraph ReAct agent + hybrid search
│   ├── api/
│   │   ├── main.py              # FastAPI endpoints, auth, streaming
│   │   ├── database.py          # MongoDB client + indexes
│   │   └── auth.py              # JWT + bcrypt
│   └── ingestion/
│       └── ingest.py            # MinIO → chunk → embed → Qdrant
└── frontend/
    └── src/
        ├── pages/
        │   ├── Chat.tsx         # SSE streaming chat UI
        │   ├── Admin.tsx        # User + knowledge base management
        │   └── Login.tsx
        └── api.ts               # Typed HTTP client
```

---

## Embedding Models

| Role | Model | Dimensions |
|------|-------|-----------|
| Dense retrieval | `sentence-transformers/all-MiniLM-L6-v2` | 384 |
| Sparse retrieval | `Qdrant/bm25` | sparse |
| Reranking | `colbert-ir/colbertv2.0` | late-interaction |

Models download automatically via FastEmbed on first use (~500 MB total, cached in `model_cache` volume).

---

## Default Credentials

| Service | Username | Password |
|---------|---------|---------|
| App | `admin` | `admin123` |
| MinIO | `minioadmin` | `minioadmin` |
| MongoDB | `admin` | `password123` |

**Change `ADMIN_PASSWORD` in `.env` before any non-local deployment.**

---

## Frontend Commands

```bash
cd frontend
npm run dev      # dev server (port 3000)
npm run build    # production build → dist/
npm run lint     # eslint
```

---

## Rebuild After Code Changes

```bash
docker compose build fastapi langgraph-server
docker compose up -d fastapi langgraph-server
```

Frontend changes are hot-reloaded (volume mount).
