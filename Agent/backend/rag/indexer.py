"""RAG index backed by Qdrant Cloud.

Embedding provider priority at query time:
  1. Voyage voyage-3.5-lite  (VOYAGE_API_KEY present) — primary
  2. Cohere embed-english-v3.0 (COHERE_API_KEY present) — fallback, same 1024-dim

Both produce 1024-dim vectors and use the same Qdrant collection.
"""
import os
from pathlib import Path

from qdrant_client import QdrantClient
from llama_index.core import VectorStoreIndex, StorageContext, Settings
from llama_index.vector_stores.qdrant import QdrantVectorStore

COLLECTION_NAME = "tripsathi"

# ── Embedding model selection ────────────────────────────────────────────────

def _configure_embed_model():
    """Set Settings.embed_model based on available API keys. Voyage preferred."""
    if os.getenv("VOYAGE_API_KEY"):
        from llama_index.embeddings.voyageai import VoyageEmbedding
        Settings.embed_model = VoyageEmbedding(
            model_name="voyage-3.5-lite",
            voyage_api_key=os.environ["VOYAGE_API_KEY"],
        )
        return "voyage"
    if os.getenv("COHERE_API_KEY"):
        from llama_index.embeddings.cohere import CohereEmbedding
        Settings.embed_model = CohereEmbedding(
            cohere_api_key=os.environ["COHERE_API_KEY"],
            model_name="embed-english-v3.0",
            input_type="search_query",
        )
        return "cohere"
    raise RuntimeError("Neither VOYAGE_API_KEY nor COHERE_API_KEY is set.")


Settings.llm = None  # LlamaIndex LLM disabled — synthesis handled in nodes.py

_qdrant: QdrantClient | None = None
_index: VectorStoreIndex | None = None
_embed_provider: str | None = None


def _get_qdrant() -> QdrantClient:
    global _qdrant
    if _qdrant is None:
        _qdrant = QdrantClient(
            url=os.environ["QDRANT_URL"],
            api_key=os.environ["QDRANT_API_KEY"],
        )
    return _qdrant


def get_index() -> VectorStoreIndex:
    """Return a cached VectorStoreIndex backed by Qdrant Cloud."""
    global _index, _embed_provider
    if _index is not None:
        return _index

    if _embed_provider is None:
        _embed_provider = _configure_embed_model()

    client = _get_qdrant()
    try:
        count = client.count(COLLECTION_NAME).count
    except Exception as e:
        raise RuntimeError(
            f"Qdrant collection '{COLLECTION_NAME}' not found. Run: python reindex.py\n({e})"
        )
    if count == 0:
        raise RuntimeError(
            f"Qdrant collection '{COLLECTION_NAME}' is empty. Run: python reindex.py"
        )

    # Ensure keyword index exists on destination field (idempotent — safe to call every startup)
    try:
        client.create_payload_index(COLLECTION_NAME, "destination", "keyword")
    except Exception:
        pass  # index already exists — that's fine

    vector_store = QdrantVectorStore(client=client, collection_name=COLLECTION_NAME)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    _index = VectorStoreIndex.from_vector_store(vector_store, storage_context=storage_context)
    return _index


def get_query_engine(similarity_top_k: int = 12, destination: str | None = None):
    """Return a query engine. Pass destination to restrict to that destination's chunks."""
    index = get_index()
    if destination:
        from llama_index.core.vector_stores import MetadataFilter, MetadataFilters, FilterOperator
        filters = MetadataFilters(filters=[
            MetadataFilter(key="destination", value=destination.lower(), operator=FilterOperator.EQ)
        ])
        return index.as_query_engine(similarity_top_k=similarity_top_k, filters=filters)
    return index.as_query_engine(similarity_top_k=similarity_top_k)
