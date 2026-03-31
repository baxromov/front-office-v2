import os

from dotenv import load_dotenv

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "documents")
DENSE_MODEL = os.getenv("DENSE_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
SPARSE_MODEL = os.getenv("SPARSE_MODEL", "Qdrant/bm25")
LATE_INTERACTION_MODEL = os.getenv("LATE_INTERACTION_MODEL", "colbert-ir/colbertv2.0")

_qdrant = None
_dense_model = None
_sparse_model = None
_late_model = None


def _get_clients():
    global _qdrant, _dense_model, _sparse_model, _late_model
    if _qdrant is None:
        from fastembed import LateInteractionTextEmbedding, SparseTextEmbedding, TextEmbedding
        from qdrant_client import QdrantClient
        _qdrant = QdrantClient(url=QDRANT_URL, prefer_grpc=False)
        _dense_model = TextEmbedding(DENSE_MODEL)
        _sparse_model = SparseTextEmbedding(SPARSE_MODEL)
        _late_model = LateInteractionTextEmbedding(LATE_INTERACTION_MODEL)
    return _qdrant, _dense_model, _sparse_model, _late_model


def run_search(query: str, top_k: int = 5, collection: str | None = None) -> list[dict]:
    """Hybrid RAG search. Returns list of {source, text, score}."""
    from qdrant_client.models import Prefetch, SparseVector

    qdrant, dense_model, sparse_model, late_model = _get_clients()
    coll = collection or QDRANT_COLLECTION

    dense_vector = next(dense_model.query_embed(query)).tolist()
    sparse_vector = next(sparse_model.query_embed(query))
    late_vector = next(late_model.query_embed(query)).tolist()

    prefetch = [
        Prefetch(query=dense_vector, using="all-MiniLM-L6-v2", limit=20),
        Prefetch(query=SparseVector(**sparse_vector.as_object()), using="bm25", limit=20),
    ]

    results = qdrant.query_points(
        collection_name=coll,
        prefetch=prefetch,
        query=late_vector,
        using="colbertv2.0",
        with_payload=True,
        limit=top_k,
    )

    chunks = []
    for point in results.points:
        text = point.payload.get("text", "")
        source = point.payload.get("metadata", {}).get("source", "unknown")
        filename = source.split("/")[-1]
        if text:
            chunks.append({"source": filename, "text": text, "score": point.score})
    return chunks
