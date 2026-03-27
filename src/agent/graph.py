import os
from dotenv import load_dotenv
from fastembed import LateInteractionTextEmbedding, SparseTextEmbedding, TextEmbedding
from langchain_core.tools import tool
from langchain_ollama import ChatOllama
from langgraph.prebuilt import create_react_agent
from qdrant_client import QdrantClient
from qdrant_client.models import Prefetch, SparseVector

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "documents")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:397b-cloud")

DENSE_MODEL = os.getenv("DENSE_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
SPARSE_MODEL = os.getenv("SPARSE_MODEL", "Qdrant/bm25")
LATE_INTERACTION_MODEL = os.getenv("LATE_INTERACTION_MODEL", "colbert-ir/colbertv2.0")

qdrant = QdrantClient(url=QDRANT_URL, prefer_grpc=False)
_dense_model = TextEmbedding(DENSE_MODEL)
_sparse_model = SparseTextEmbedding(SPARSE_MODEL)
_late_model = LateInteractionTextEmbedding(LATE_INTERACTION_MODEL)
llm = ChatOllama(model=OLLAMA_MODEL, base_url=OLLAMA_BASE_URL, temperature=0)


@tool
def search_documents(query: str) -> str:
    """Search the knowledge base for relevant information to answer the user's question."""
    dense_vector = next(_dense_model.query_embed(query)).tolist()
    sparse_vector = next(_sparse_model.query_embed(query))
    late_vector = next(_late_model.query_embed(query)).tolist()

    prefetch = [
        Prefetch(query=dense_vector, using="all-MiniLM-L6-v2", limit=20),
        Prefetch(query=SparseVector(**sparse_vector.as_object()), using="bm25", limit=20),
    ]

    results = qdrant.query_points(
        collection_name=QDRANT_COLLECTION,
        prefetch=prefetch,
        query=late_vector,
        using="colbertv2.0",
        with_payload=True,
        limit=5,
    )

    if not results.points:
        return "No relevant documents found."

    chunks = []
    for point in results.points:
        text = point.payload.get("text", "")
        source = point.payload.get("metadata", {}).get("source", "unknown")
        if text:
            chunks.append(f"[Source: {source}]\n{text}")

    return "\n\n---\n\n".join(chunks) if chunks else "No relevant content found."


graph = create_react_agent(
    model=llm,
    tools=[search_documents],
    prompt=(
        "You are a helpful bank assistant. "
        "When the user asks a question, always use the search_documents tool first "
        "to find relevant information from the knowledge base, then provide a clear and accurate answer. "
        "Answer in the same language the user used."
    ),
)
