# Dependency List for Security Review

## 1. Frontend (`frontend/package.json`)

### Runtime dependencies
| Package | Version | Purpose |
|---|---|---|
| react | ^18.3.1 | UI framework |
| react-dom | ^18.3.1 | React DOM renderer |
| react-router-dom | ^6.28.0 | Client-side routing |
| react-markdown | ^10.1.0 | Markdown rendering |
| remark-gfm | ^4.0.1 | GitHub Flavored Markdown support |
| @tailwindcss/typography | ^0.5.19 | Prose styling plugin |

### Dev dependencies (build-time only, not shipped)
| Package | Version | Purpose |
|---|---|---|
| vite | ^6.0.1 | Build tool / dev server |
| @vitejs/plugin-react | ^4.3.3 | React Fast Refresh for Vite |
| typescript | ^5.6.3 | Type checking |
| tailwindcss | ^3.4.15 | Utility CSS framework |
| postcss | ^8.4.49 | CSS processing |
| autoprefixer | ^10.4.20 | CSS vendor prefixes |
| @types/react | ^18.3.12 | TypeScript types |
| @types/react-dom | ^18.3.1 | TypeScript types |

---

## 2. Backend — FastAPI (`pyproject.toml`)

Both `Dockerfile` (FastAPI) and `Dockerfile.langgraph` (LangGraph) install from the same `pyproject.toml`.

| Package | Version | Purpose |
|---|---|---|
| fastapi | >=0.135.2 | Web framework |
| uvicorn[standard] | >=0.42.0 | ASGI server |
| httpx | >=0.28.1 | Async HTTP client |
| python-multipart | >=0.0.22 | File upload / form data |
| python-dotenv | >=1.2.2 | Environment variable loading |
| python-jose[cryptography] | >=3.5.0 | JWT token handling |
| bcrypt | >=5.0.0 | Password hashing |
| motor | >=3.7.1 | Async MongoDB driver |
| pymongo | >=4.0.0 | MongoDB driver |
| minio | >=7.2.0 | MinIO / S3 object storage client |
| qdrant-client | >=1.17.1 | Qdrant vector DB client |
| fastembed | >=0.4.0 | Local embedding model (ONNX) |
| pypdf | >=4.0.0 | PDF parsing |
| python-docx | >=1.1.0 | DOCX parsing |
| langchain-community | >=0.4.1 | LangChain integrations |
| langchain-ollama | >=1.0.1 | Ollama LLM integration |
| langgraph | >=1.1.3 | Agent orchestration framework |
| langgraph-cli[inmem] | >=0.4.19 | LangGraph dev server |

---

## 3. LangGraph Server (`Dockerfile.langgraph`)

Uses the same `pyproject.toml` dependencies as FastAPI above.

Additional package installed separately in `Dockerfile.langgraph`:

| Package | Version | Purpose |
|---|---|---|
| langgraph-cli[inmem] | latest | LangGraph server runtime |

---

## 4. System-level (installed via apt in Dockerfiles)

| Package | Purpose |
|---|---|
| libgomp1 | OpenMP runtime — required by ONNX Runtime (fastembed) |

---

## Notes for Security Team

- **JWT**: `python-jose[cryptography]` used for auth token signing/verification
- **Password hashing**: `bcrypt` (no MD5/SHA1)
- **SSL verification disabled** in both Python containers via `sitecustomize.py` patch — this is a workaround for the corporate proxy environment and should be reviewed
- **No direct database credentials** in code — loaded from `.env` via `python-dotenv`
- **LangGraph server** runs in `dev` mode (`langgraph dev`) — not hardened for production
