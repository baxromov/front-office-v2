import argparse
import io
import logging
import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastembed import LateInteractionTextEmbedding, SparseTextEmbedding, TextEmbedding
from langchain_text_splitters import RecursiveCharacterTextSplitter
from minio import Minio
from pymongo import MongoClient
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    HnswConfigDiff,
    Modifier,
    MultiVectorComparator,
    MultiVectorConfig,
    PointStruct,
    SparseVectorParams,
    VectorParams,
)

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "documents")

DENSE_MODEL = os.getenv("DENSE_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
SPARSE_MODEL = os.getenv("SPARSE_MODEL", "Qdrant/bm25")
LATE_INTERACTION_MODEL = os.getenv("LATE_INTERACTION_MODEL", "colbert-ir/colbertv2.0")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "documents")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "800"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "150"))

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "front_office")

logger = logging.getLogger(__name__)


def ensure_qdrant_collection(
    client: QdrantClient,
    dense_size: int,
    colbert_size: int,
) -> None:
    if not client.collection_exists(QDRANT_COLLECTION):
        client.create_collection(
            collection_name=QDRANT_COLLECTION,
            vectors_config={
                "all-MiniLM-L6-v2": VectorParams(
                    size=dense_size,
                    distance=Distance.COSINE,
                ),
                "colbertv2.0": VectorParams(
                    size=colbert_size,
                    distance=Distance.COSINE,
                    multivector_config=MultiVectorConfig(
                        comparator=MultiVectorComparator.MAX_SIM,
                    ),
                    hnsw_config=HnswConfigDiff(m=0),
                ),
            },
            sparse_vectors_config={
                "bm25": SparseVectorParams(modifier=Modifier.IDF),
            },
        )
        logger.info("Created Qdrant collection: %s", QDRANT_COLLECTION)
    else:
        logger.info("Qdrant collection already exists: %s", QDRANT_COLLECTION)


def parse_file(data: bytes, filename: str) -> str:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix == "pdf":
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if suffix == "docx":
        import docx
        doc = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs)
    return data.decode("utf-8", errors="replace")


def chunk_text(text: str) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
    )
    return splitter.split_text(text)


def ingest_file(
    filename: str,
    data: bytes,
    qdrant: QdrantClient,
    dense_model: TextEmbedding,
    sparse_model: SparseTextEmbedding,
    late_model: LateInteractionTextEmbedding,
) -> int:
    text = parse_file(data, filename)
    chunks = chunk_text(text)
    if not chunks:
        logger.warning("No chunks extracted from %s", filename)
        return 0

    dense_embeddings = list(dense_model.embed(chunks))
    bm25_embeddings = list(sparse_model.embed(chunks))
    late_embeddings = list(late_model.embed(chunks))

    points = []
    for chunk, dense, bm25, late in zip(chunks, dense_embeddings, bm25_embeddings, late_embeddings):
        points.append(
            PointStruct(
                id=str(uuid.uuid4()),
                vectors={
                    "all-MiniLM-L6-v2": dense.tolist(),
                    "bm25": bm25.as_object(),
                    "colbertv2.0": late.tolist(),
                },
                payload={
                    "text": chunk,
                    "metadata": {"source": filename, "point_type": "chunk"},
                },
            )
        )

    batch_size = 100
    for i in range(0, len(points), batch_size):
        qdrant.upsert(
            collection_name=QDRANT_COLLECTION,
            points=points[i : i + batch_size],
        )

    logger.info("Ingested %d chunks from %s", len(points), filename)
    return len(points)


def run_ingestion(bucket: str | None = None, force: bool = False) -> dict:
    bucket = bucket or MINIO_BUCKET

    minio_client = Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=MINIO_SECURE,
    )
    qdrant = QdrantClient(url=QDRANT_URL)
    dense_model = TextEmbedding(DENSE_MODEL)
    sparse_model = SparseTextEmbedding(SPARSE_MODEL)
    late_model = LateInteractionTextEmbedding(LATE_INTERACTION_MODEL)
    mongo = MongoClient(MONGO_URL)
    db = mongo[MONGO_DB]

    # Determine vector sizes from the models
    sample = ["sample"]
    dense_size = len(list(dense_model.embed(sample))[0].tolist())
    colbert_size = len(list(late_model.embed(sample))[0][0].tolist())

    ensure_qdrant_collection(qdrant, dense_size, colbert_size)

    if not minio_client.bucket_exists(bucket):
        return {"processed": 0, "skipped": 0, "errors": [f"Bucket '{bucket}' not found"]}

    objects = list(minio_client.list_objects(bucket, recursive=True))
    processed = 0
    skipped = 0
    errors = []

    for obj in objects:
        filename = obj.object_name
        etag = obj.etag.strip('"') if obj.etag else ""

        if not force:
            existing = db.ingested_files.find_one({"filename": filename, "etag": etag})
            if existing:
                logger.info("Skipping %s (already ingested, etag=%s)", filename, etag)
                skipped += 1
                continue

        try:
            response = minio_client.get_object(bucket, filename)
            data = response.read()
            response.close()
            response.release_conn()

            chunk_count = ingest_file(filename, data, qdrant, dense_model, sparse_model, late_model)

            db.ingested_files.update_one(
                {"filename": filename},
                {
                    "$set": {
                        "etag": etag,
                        "ingested_at": datetime.now(timezone.utc),
                        "chunk_count": chunk_count,
                    }
                },
                upsert=True,
            )
            processed += 1
        except Exception as e:
            logger.error("Error ingesting %s: %s", filename, e)
            errors.append({"file": filename, "error": str(e)})

    mongo.close()
    return {"processed": processed, "skipped": skipped, "errors": errors}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest documents from MinIO into Qdrant")
    parser.add_argument("--bucket", default=None, help="MinIO bucket name (default from env)")
    parser.add_argument("--force", action="store_true", help="Re-ingest already-processed files")
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args()
    logging.basicConfig(level=args.log_level, format="%(levelname)s %(name)s: %(message)s")
    result = run_ingestion(bucket=args.bucket, force=args.force)
    print(result)
