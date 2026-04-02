# Dependency List for Security Review

---

## 1. Frontend (`frontend/package.json`)

### Runtime dependencies (shipped to browser)
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

## 2. Backend Python packages (`pyproject.toml`)

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
| fastembed | >=0.4.0 | Local embedding model runner (ONNX) |
| pypdf | >=4.0.0 | PDF parsing |
| python-docx | >=1.1.0 | DOCX parsing |
| langchain-community | >=0.4.1 | LangChain integrations |
| langchain-ollama | >=1.0.1 | Ollama LLM integration |
| langgraph | >=1.1.3 | Agent orchestration framework |
| langgraph-cli[inmem] | >=0.4.19 | LangGraph dev server |

### LangGraph-only extra
| Package | Version | Purpose |
|---|---|---|
| langgraph-cli[inmem] | latest | Installed separately in Dockerfile.langgraph before pyproject.toml |

---

## 3. Linux system packages (apt) — `python:3.12-slim` base

### Base image: `python:3.12-slim` (Debian Bookworm)
Already included in the base image, not explicitly installed:

| Package | Purpose |
|---|---|
| libc6 | GNU C Library — core Linux runtime |
| libgcc-s1 | GCC runtime library |
| libstdc++6 | C++ standard library |
| libssl3 | OpenSSL shared library |
| libcrypto (via libssl3) | Cryptographic primitives |
| zlib1g | zlib compression library |
| libexpat1 | XML parsing (used by Python) |
| libffi8 | Foreign function interface (used by Python ctypes/cffi) |
| libsqlite3-0 | SQLite (built into Python) |
| libncursesw6 | Terminal handling |
| libbz2-1.0 | bzip2 compression |
| liblzma5 | XZ/LZMA compression |
| libreadline8 | Readline (Python REPL) |
| libuuid1 | UUID generation |
| libtinfo6 | Terminal info database |

### Explicitly installed via `apt-get install` in both Dockerfiles:
| Package | Purpose | Required by |
|---|---|---|
| libgomp1 | GNU OpenMP runtime — shared memory parallelism | ONNX Runtime (fastembed) |

---

## 4. ML models downloaded at image build time (fastembed / HuggingFace Hub)

Both `Dockerfile` and `Dockerfile.langgraph` pre-download these models during `docker build` so the server needs no internet at runtime.

| Model | Type | Class | Approx. size |
|---|---|---|---|
| `sentence-transformers/all-MiniLM-L6-v2` | Dense embedding | `TextEmbedding` | ~90 MB |
| `Qdrant/bm25` | Sparse embedding | `SparseTextEmbedding` | ~5 MB |
| `colbert-ir/colbertv2.0` | Late interaction (re-ranking) | `LateInteractionTextEmbedding` | ~440 MB |

Models are stored at `/root/.cache/fastembed` inside the image.
Source: HuggingFace Hub (`huggingface.co`) — downloaded once during build, not at runtime.

---

## 5. Notes for Security Team

| Topic | Detail |
|---|---|
| **SSL verification** | Disabled globally in both Python containers via `sitecustomize.py` — workaround for corporate proxy. All `httpx`, `requests`, and Python `ssl` calls bypass certificate validation |
| **JWT** | `python-jose[cryptography]` — HS256/RS256 signing |
| **Password hashing** | `bcrypt` — no MD5/SHA1 |
| **Secrets** | Loaded from `.env` via `python-dotenv` — not hardcoded |
| **LangGraph mode** | Running in `dev` mode (`langgraph dev`) — not production-hardened |
| **ONNX Runtime** | Pulled in transitively by `fastembed` — executes native compiled model files |
| **No internet on server** | All packages and models baked into Docker images at build time |
