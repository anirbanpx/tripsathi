import os
from pathlib import Path

import chromadb
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, StorageContext, Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.vector_stores.chroma import ChromaVectorStore

Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")
Settings.llm = None  # disable LlamaIndex LLM synthesis — we do our own synthesis in nodes.py

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"
CHROMA_PATH = Path(__file__).parent.parent / "data" / "chroma_db"

_index: VectorStoreIndex | None = None


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
    for doc in documents:
        # Tag each document with its destination so queries can be scoped at retrieval time
        stem = Path(doc.metadata.get("file_name", "")).stem
        if stem:
            doc.metadata["destination"] = stem.lower()

    return VectorStoreIndex.from_documents(documents, storage_context=storage_context)


def _load_index() -> VectorStoreIndex:
    CHROMA_PATH.mkdir(parents=True, exist_ok=True)
    chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    collection = chroma_client.get_or_create_collection("tripsathi")
    vector_store = ChromaVectorStore(chroma_collection=collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    return VectorStoreIndex.from_vector_store(vector_store, storage_context=storage_context)


def get_index() -> VectorStoreIndex:
    """Return a cached index, building from knowledge files on first call."""
    global _index
    if _index is not None:
        return _index

    try:
        index = _load_index()
        if index._vector_store._collection.count() == 0:
            index = _build_index()
    except Exception:
        index = _build_index()

    _index = index
    return _index


def get_query_engine(similarity_top_k: int = 5):
    """Return a query engine backed by the cached index."""
    return get_index().as_query_engine(similarity_top_k=similarity_top_k)


def rebuild_index():
    """Force a full index rebuild from knowledge files."""
    global _index
    _index = None
    _index = _build_index()
    return _index.as_query_engine(similarity_top_k=5)
