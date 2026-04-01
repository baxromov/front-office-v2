# Front Office Pro

An AI-powered banking assistant with hybrid search (dense + BM25 + ColBERT reranking), document ingestion from MinIO, and a React chat UI.

## Architecture

```
React UI (port 3000)
    ↓
FastAPI Backend (port 8000)
    ↓
LangGraph Agent (port 2024)
    ↓
Hybrid Search Pipeline
  ├── Dense:  sentence-transformers/all-MiniLM-L6-v2
  ├── Sparse: Qdrant/bm25
  └── Rerank: colbert-ir/colbertv2.0
    ↓
Qdrant (port 6333) ←── MinIO (port 9000)
MongoDB (port 27017)
Redis  (port 6379)
```

## Prerequisites

- Python 3.12+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) — Python package manager
- [Ollama](https://ollama.com) — local LLM inference
- Docker — for Qdrant, MongoDB, Redis, MinIO

## 1. Start Infrastructure (Docker)

```bash
# Qdrant
docker run -d --name qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant:latest

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
  minio/minio:latest server /data --console-address ":9001"
```

## 2. Install Ollama Model

```bash
ollama pull qwen3.5:397b-cloud
```

> Change `OLLAMA_MODEL` in `.env` to any model available in your Ollama instance.

## 3. Configure Environment

Copy and edit the `.env` file in the project root:

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

## 4. Install Python Dependencies

```bash
uv sync
```

## 5. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

## 6. Run the Project

Open **4 terminals** and run each service:

### Terminal 1 — LangGraph Agent

```bash
uv run langgraph dev
```

Starts the agent server at `http://localhost:2024`.

### Terminal 2 — FastAPI Backend

```bash
uv run uvicorn src.api.main:app --reload --port 8000
```

API available at `http://localhost:8000`.

### Terminal 3 — Frontend

```bash
cd frontend
npm run dev
```

UI available at `http://localhost:3000`.

## 7. Upload Documents & Ingest

### Option A — Admin UI

1. Open `http://localhost:3000` and log in as `admin` / `admin123`
2. Go to **Admin Panel** → **Knowledge Base**
3. Drag & drop or select PDF / DOCX / TXT files
4. Click **Upload & Ingest**

### Option B — CLI

```bash
# Upload files manually to MinIO console at http://localhost:9001
# (login: minioadmin / minioadmin, create bucket "documents", upload files)

# Then run ingestion:
uv run python -m src.ingestion.ingest

# Force re-ingest all files:
uv run python -m src.ingestion.ingest --force

# Use a different bucket:
uv run python -m src.ingestion.ingest --bucket my-bucket
```

### Option C — API

```bash
curl -X POST http://localhost:8000/api/admin/ingest \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

> **Note:** If the Qdrant `documents` collection was previously created with a different vector config, delete it first:
> ```bash
> curl -X DELETE http://localhost:6333/collections/documents
> ```

## 8. Default Credentials

| Service   | Username     | Password      |
|-----------|-------------|---------------|
| App login | `admin`     | `admin123`    |
| MinIO     | `minioadmin`| `minioadmin`  |
| MongoDB   | `admin`     | `password123` |

Change `ADMIN_PASSWORD` in `.env` to set a custom admin password.

## Project Structure

```
front-office-pro/
├── .env                        # Environment variables
├── langgraph.json              # LangGraph graph config
├── pyproject.toml              # Python dependencies
├── src/
│   ├── agent/
│   │   └── graph.py            # LangGraph agent + hybrid search tool
│   ├── api/
│   │   ├── main.py             # FastAPI endpoints
│   │   ├── database.py         # MongoDB client
│   │   └── auth.py             # JWT authentication
│   └── ingestion/
│       └── ingest.py           # MinIO → Qdrant ingestion pipeline
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Chat.tsx        # Chat interface
│       │   ├── Admin.tsx       # Admin panel (users + knowledge base)
│       │   └── Login.tsx       # Login page
│       └── api.ts              # API client
└── data/                       # Local data directory (optional)
```

## Embedding Models

| Role              | Model                                    | Type             |
|-------------------|------------------------------------------|------------------|
| Dense retrieval   | `sentence-transformers/all-MiniLM-L6-v2` | 384-dim vectors  |
| Sparse retrieval  | `Qdrant/bm25`                            | Sparse (IDF)     |
| Reranking         | `colbert-ir/colbertv2.0`                 | Late interaction |

Models are downloaded automatically by FastEmbed on first use.


Вопросы по DaroMax:
1. Какая минимальная сумма для открытия вклада?
2. Можно ли пополнять вклад после открытия?
3. Выплачиваются ли проценты ежемесячно или только в конце срока?
4. Какая будет разница по доходу, если открыть вклад в сумах на 24 месяца с выплатой процентов ежемесячно и в конце срока?
5. Если я размещу более 10 000 USD на 12-24 месяца, какая ставка будет при ежемесячной выплате и насколько она отличается от ставки при выплате в конце срока?
 
Вопросы по Super Changan:
1. Какой минимальный первоначальный взнос нужен для автокредита?
2. На какой максимальный срок можно оформить кредит?
3. Можно ли погасить кредит досрочно без штрафов?
4. Как изменится процентная ставка, если увеличить первоначальный взнос с 25% до 50% при сроке кредита 36 месяцев?
5. В какой программе кредитования можно получить ставку 0% и при каких условиях (срок и первоначальный взнос)?
===============================================================================
