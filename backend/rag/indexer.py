import os
from pathlib import Path

from qdrant_client import QdrantClient
from llama_index.core import VectorStoreIndex, StorageContext, Settings
from llama_index.vector_stores.qdrant import QdrantVectorStore
from llama_index.embeddings.voyageai import VoyageEmbedding

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"
COLLECTION_NAME = "tripsathi"

Settings.embed_model = VoyageEmbedding(
    model_name="voyage-3.5-lite",
    voyage_api_key=os.environ["VOYAGE_API_KEY"],
)
Settings.llm = None  # LlamaIndex LLM synthesis disabled — synthesis handled in nodes.py

_qdrant: QdrantClient | None = None
_index: VectorStoreIndex | None = None


def _get_qdrant() -> QdrantClient:
    global _qdrant
    if _qdrant is None:
        _qdrant = QdrantClient(
            url=os.environ["QDRANT_URL"],
            api_key=os.environ["QDRANT_API_KEY"],
        )
    return _qdrant


def get_index() -> VectorStoreIndex:
    """Return a cached VectorStoreIndex backed by Qdrant Cloud. Raises if collection is empty."""
    global _index
    if _index is not None:
        return _index

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

    vector_store = QdrantVectorStore(client=client, collection_name=COLLECTION_NAME)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    _index = VectorStoreIndex.from_vector_store(vector_store, storage_context=storage_context)
    return _index


def get_query_engine(similarity_top_k: int = 5, destination: str | None = None):
    """Return a query engine. Pass destination to restrict results to that destination only."""
    index = get_index()
    if destination:
        from llama_index.core.vector_stores import MetadataFilter, MetadataFilters, FilterOperator
        filters = MetadataFilters(filters=[
            MetadataFilter(key="destination", value=destination.lower(), operator=FilterOperator.EQ)
        ])
        return index.as_query_engine(similarity_top_k=similarity_top_k, filters=filters)
    return index.as_query_engine(similarity_top_k=similarity_top_k)


def rebuild_index():
    """Force a full re-index from knowledge files. Prefer running reindex.py directly."""
    global _index
    _index = None
    import reindex
    reindex.rebuild()
    _index = None  # force fresh load on next get_index() call
