"""Force-rebuild ChromaDB from all knowledge/*.md files. Deletes existing collection first to avoid duplicates."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

import chromadb
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, StorageContext, Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.vector_stores.chroma import ChromaVectorStore

Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

KNOWLEDGE_DIR = Path(__file__).parent / "rag" / "knowledge"
CHROMA_PATH = Path(__file__).parent / "data" / "chroma_db"


def rebuild():
    CHROMA_PATH.mkdir(parents=True, exist_ok=True)
    chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))

    try:
        chroma_client.delete_collection("tripsathi")
        print("Deleted existing 'tripsathi' collection.")
    except Exception:
        pass

    collection = chroma_client.get_or_create_collection("tripsathi")
    vector_store = ChromaVectorStore(chroma_collection=collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    files = list(KNOWLEDGE_DIR.glob("*.md"))
    print(f"Indexing {len(files)} knowledge files: {[f.name for f in files]}")

    documents = SimpleDirectoryReader(str(KNOWLEDGE_DIR)).load_data()
    VectorStoreIndex.from_documents(documents, storage_context=storage_context)
    print(f"Done. Indexed {len(documents)} document chunks into ChromaDB.")


if __name__ == "__main__":
    rebuild()
