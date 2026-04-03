# Dependencies

---

## 1. Ollama

### Install

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# macOS (Homebrew)
brew install ollama

# Windows — download installer from https://ollama.com/download
```

```bash
ollama --version
ollama serve   # starts daemon on http://localhost:11434
```

### Pull models

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

---

## 2. Python Packages

### Web & API
| Package | Version | Purpose |
|---|---|---|
| fastapi | >=0.135.2 | Web framework |
| uvicorn[standard] | >=0.42.0 | ASGI server |
| httpx | >=0.28.1 | Async HTTP client |
| python-multipart | >=0.0.22 | File upload / form data |
| python-dotenv | >=1.2.2 | Environment variable loading |
| pydantic | >=2.0.0 | Data validation |
| pydantic[email] | >=2.7.0 | Data validation with email support |
| pydantic-settings | >=2.6.0 | Settings management |

### Auth & Security
| Package | Version | Purpose |
|---|---|---|
| python-jose[cryptography] | >=3.5.0 | JWT token handling |
| bcrypt | >=5.0.0 | Password hashing |
| passlib[bcrypt] | >=1.7.4 | Password hashing utilities |
| slowapi | >=0.1.9 | Rate limiting middleware |

### Database & Storage
| Package | Version | Purpose |
|---|---|---|
| motor | >=3.7.1 | Async MongoDB driver |
| pymongo | >=4.0.0 | MongoDB driver |
| beanie | >=1.26.0 | Async MongoDB ODM |
| qdrant-client | >=1.17.1 | Qdrant vector DB client |
| qdrant-client[fastembed] | >=1.12.0 | Qdrant vector DB client + fastembed |
| redis | >=5.0.0 | Redis client |
| arq | >=0.25.0 | Async task queue (Redis-backed) |
| minio | >=7.2.0 | MinIO / S3 object storage client |
| boto3 | >=1.35.0 | AWS S3 / object storage |
| aiofiles | >=23.0.0 | Async file I/O |
| fastembed | >=0.4.0 | Local embedding model runner (ONNX) |

### AI / LLM
| Package | Version | Purpose |
|---|---|---|
| ollama | >=0.3.0 | Ollama Python client |
| langchain | >=0.3.0 | LangChain core |
| langchain-core | >=0.3.0 | LangChain base abstractions |
| langchain-community | >=0.4.1 | LangChain integrations |
| langchain-text-splitters | >=0.3.0 | Document chunking |
| langchain-ollama | >=1.0.1 | Ollama LLM integration |
| langchain-anthropic | >=0.3.0 | Anthropic (Claude) integration |
| langchain-openai | >=0.3.0 | OpenAI integration |
| langchain-qdrant | >=0.2.0 | Qdrant vector store integration |
| langgraph | >=1.1.3 | Agent orchestration framework |
| langgraph-sdk | >=0.1.36 | LangGraph client SDK |
| langgraph-cli[inmem] | >=0.4.19 | LangGraph dev server |
| langgraph-checkpoint-mongodb | >=0.3.0 | MongoDB checkpointing for LangGraph |
| langdetect | >=1.0.9 | Language detection |
| langfuse | >=2.0.0 | LLM observability / tracing |

### Document Processing
| Package | Version | Purpose |
|---|---|---|
| pypdf | >=4.0.0 | PDF parsing |
| pdfplumber | >=0.11.0 | PDF text/table extraction |
| pdf2image | >=1.17.0 | PDF to image (requires poppler) |
| python-docx | >=1.1.0 | DOCX parsing |
| openpyxl | >=3.1.0 | Excel (XLSX) parsing |
| unstructured[pdf,docx,xlsx] | >=0.16.0 | Multi-format document parsing |

### OCR & Computer Vision
| Package | Version | Purpose |
|---|---|---|
| easyocr | >=1.7.0 | Deep learning OCR |
| pytesseract | >=0.3.10 | Tesseract OCR wrapper |
| Pillow | >=10.0.0 | Image processing |
| numpy | >=1.24.0 | Numerical computing |

### Dev
| Package | Version | Purpose |
|---|---|---|
| pytest | >=8.0 | Test runner |
| pytest-asyncio | >=0.24.0 | Async test support |
| ruff | >=0.8.0 | Linter / formatter |

---

## 3. Node Packages

### Runtime
| Package | Version | Purpose |
|---|---|---|
| react | ^19.2.0 | UI framework |
| react-dom | ^19.2.0 | React DOM renderer |
| react-router-dom | ^6.30.3 | Client-side routing |
| react-markdown | ^10.1.0 | Markdown rendering |
| remark-gfm | ^4.0.1 | GitHub Flavored Markdown support |
| react-hook-form | ^7.71.2 | Form state management |
| react-dropzone | ^15.0.0 | File drag-and-drop |
| @hookform/resolvers | ^5.2.2 | Zod integration for react-hook-form |
| @tanstack/react-query | ^5.90.21 | Server state management |
| @tanstack/react-table | ^8.21.3 | Headless table component |
| @headlessui/react | ^2.2.9 | Accessible UI primitives |
| @heroicons/react | ^2.2.0 | Icon set |
| @radix-ui/react-alert-dialog | ^1.1.15 | Accessible alert dialog |
| @radix-ui/react-dialog | ^1.1.15 | Accessible dialog / modal |
| @radix-ui/react-label | ^2.1.8 | Accessible form label |
| @radix-ui/react-select | ^2.2.6 | Accessible select menu |
| @radix-ui/react-separator | ^1.1.8 | Visual separator |
| @radix-ui/react-slot | ^1.2.4 | Composition primitive |
| axios | ^1.13.6 | HTTP client |
| zod | ^3.24.2 | Schema validation |
| zustand | ^5.0.12 | State management |
| recharts | ^3.7.0 | Chart components |
| lucide-react | ^0.577.0 | Icon set |
| date-fns | ^4.1.0 | Date utilities |
| tailwindcss | ^4.2.1 | Utility CSS framework |
| @tailwindcss/vite | ^4.2.1 | TailwindCSS Vite plugin |
| @tailwindcss/postcss | ^4.1.18 | TailwindCSS PostCSS plugin |
| @tailwindcss/typography | ^0.5.19 | Prose styling plugin |
| class-variance-authority | ^0.7.1 | Component variant styling |
| clsx | ^2.1.1 | Conditional class names |
| tailwind-merge | ^3.5.0 | TailwindCSS class merging |

### Dev
| Package | Version | Purpose |
|---|---|---|
| vite | ^7.3.1 | Build tool / dev server |
| @vitejs/plugin-react | ^5.1.1 | React Fast Refresh for Vite |
| typescript | ~5.9.3 | Type checking |
| postcss | ^8.5.6 | CSS processing |
| autoprefixer | ^10.4.24 | CSS vendor prefixes |
| eslint | ^9.39.4 | Linter |
| eslint-plugin-react-hooks | ^7.0.1 | React hooks lint rules |
| eslint-plugin-react-refresh | ^0.5.2 | React Refresh lint rules |
| @eslint/js | ^9.39.4 | ESLint JS config |
| typescript-eslint | ^8.56.1 | TypeScript ESLint integration |
| globals | ^17.4.0 | Global variables for ESLint |
| @types/node | ^24.12.0 | Node.js TypeScript types |
| @types/react | ^19.2.14 | React TypeScript types |
| @types/react-dom | ^19.2.3 | React DOM TypeScript types |

---

## 4. Docker / Linux Packages

### Base image: `python:3.12-slim` (Debian Bookworm) — included by default
| Package | Purpose |
|---|---|
| libc6 | GNU C Library — core Linux runtime |
| libgcc-s1 | GCC runtime library |
| libstdc++6 | C++ standard library |
| libssl3 | OpenSSL shared library |
| zlib1g | zlib compression |
| libexpat1 | XML parsing |
| libffi8 | Foreign function interface |
| libsqlite3-0 | SQLite |
| libncursesw6 | Terminal handling |
| libbz2-1.0 | bzip2 compression |
| liblzma5 | XZ/LZMA compression |
| libreadline8 | Readline (Python REPL) |
| libuuid1 | UUID generation |

### Explicitly installed via `apt-get install`
| Package | Purpose | Required by |
|---|---|---|
| libgomp1 | GNU OpenMP — shared memory parallelism | ONNX Runtime (fastembed) |
| poppler-utils | PDF rendering utilities | pdf2image |
| tesseract-ocr | OCR engine | pytesseract |
| tesseract-ocr-eng | English language pack | pytesseract |

### ML models (downloaded at build time via fastembed / HuggingFace Hub)
| Model | Type | Approx. size |
|---|---|---|
| `sentence-transformers/all-MiniLM-L6-v2` | Dense embedding | ~90 MB |
| `Qdrant/bm25` | Sparse embedding | ~5 MB |
| `colbert-ir/colbertv2.0` | Late interaction re-ranking | ~440 MB |
