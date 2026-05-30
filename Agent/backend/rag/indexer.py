import os
from pathlib import Path

import chromadb
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, StorageContext
from llama_index.vector_stores.chroma import ChromaVectorStore

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"
CHROMA_PATH = Path(__file__).parent.parent / "data" / "chroma_db"

_query_engine = None


def _build_index() -> VectorStoreIndex:
    CHROMA_PATH.mkdir(parents=True, exist_ok=True)
    chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    collection = chroma_client.get_or_create_collection("tripsathi")
    vector_store = ChromaVectorStore(chroma_collection=collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    if not any(KNOWLEDGE_DIR.glob("*.md")):
        raise RuntimeError(
            f"No knowledge files found in {KNOWLEDGE_DIR}. "
            "Add destination .md files before starting the server."
        )

    documents = SimpleDirectoryReader(str(KNOWLEDGE_DIR)).load_data()
    return VectorStoreIndex.from_documents(documents, storage_context=storage_context)


def _load_index() -> VectorStoreIndex:
    CHROMA_PATH.mkdir(parents=True, exist_ok=True)
    chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    collection = chroma_client.get_or_create_collection("tripsathi")
    vector_store = ChromaVectorStore(chroma_collection=collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    return VectorStoreIndex.from_vector_store(vector_store, storage_context=storage_context)


def get_query_engine(similarity_top_k: int = 5):
    """Return a cached query engine, building the index on first call."""
    global _query_engine
    if _query_engine is not None:
        return _query_engine

    try:
        index = _load_index()
        # If collection is empty, build from scratch
        if index._vector_store._collection.count() == 0:
            index = _build_index()
    except Exception:
        index = _build_index()

    _query_engine = index.as_query_engine(similarity_top_k=similarity_top_k)
    return _query_engine


def rebuild_index():
    """Force a full index rebuild from knowledge files."""
    global _query_engine
    _query_engine = None
    index = _build_index()
    _query_engine = index.as_query_engine(similarity_top_k=5)
    return _query_engine
