FROM python:3.12-slim

# System dependencies for fastembed (ONNX Runtime needs libgomp)
# Retry logic for corporate proxy that drops connections
RUN echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/80-retries && \
    echo 'Acquire::http::Timeout "120";' >> /etc/apt/apt.conf.d/80-retries && \
    echo 'Acquire::https::Timeout "120";' >> /etc/apt/apt.conf.d/80-retries && \
    for i in 1 2 3; do \
      apt-get update && apt-get install -y --no-install-recommends --fix-missing \
        libgomp1 && break || \
      (echo "apt retry $i/3..." && sleep 10); \
    done && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Configure pip for corporate network
RUN pip config set global.trusted-host "pypi.org pypi.python.org files.pythonhosted.org" && \
    pip config set global.timeout 1000 && \
    pip config set global.retries 10 && \
    pip install --no-cache-dir --upgrade pip setuptools wheel

# Copy only dependency files first for better layer caching
COPY pyproject.toml README.md ./

# Install dependencies with retry loop for flaky corporate proxy
RUN --mount=type=cache,target=/root/.cache/pip \
    for i in 1 2 3 4 5; do \
    pip install -e . && break || \
    (echo "Retry $i/5 after network error..." && sleep 15); \
    done

# Copy application source
COPY src/ src/
COPY langgraph.json ./

EXPOSE 8000

ENV PYTHONHTTPSVERIFY=0

# Disable SSL verification globally for corporate network
COPY <<'EOF' /usr/local/lib/python3.12/site-packages/sitecustomize.py
import ssl
ssl._create_default_https_context = ssl._create_unverified_context

# Patch httpx to disable SSL verification by default
import httpx
_orig_async_init = httpx.AsyncClient.__init__
_orig_sync_init = httpx.Client.__init__

def _patched_async_init(self, *args, **kwargs):
    kwargs.setdefault("verify", False)
    _orig_async_init(self, *args, **kwargs)

def _patched_sync_init(self, *args, **kwargs):
    kwargs.setdefault("verify", False)
    _orig_sync_init(self, *args, **kwargs)

httpx.AsyncClient.__init__ = _patched_async_init
httpx.Client.__init__ = _patched_sync_init

# Patch requests (used by HuggingFace Hub / fastembed model downloads)
try:
    import requests.adapters
    _orig_send = requests.adapters.HTTPAdapter.send
    def _patched_send(self, *args, **kwargs):
        kwargs["verify"] = False
        return _orig_send(self, *args, **kwargs)
    requests.adapters.HTTPAdapter.send = _patched_send
except Exception:
    pass
EOF

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
