"""One-shot indexer: embeds all rag/knowledge/*.md and upserts into Qdrant Cloud.
Uses voyageai + qdrant-client directly — no LlamaIndex dependency, runs on Python 3.14+.

Embedding provider priority:
  1. Voyage voyage-3.5-lite  (VOYAGE_API_KEY) — primary, 200M free tokens
  2. Cohere embed-english-v3.0 (COHERE_API_KEY) — fallback, same 1024-dim, 1K calls/month free

Run manually when adding new destination .md files:
  python reindex.py                         # full rebuild
  python reindex.py --destination manali    # re-index one destination
  python reindex.py --provider cohere       # force Cohere regardless of Voyage key
"""
import argparse
import hashlib
import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from qdrant_client import QdrantClient, models as qmodels

KNOWLEDGE_DIR = Path(__file__).parent / "rag" / "knowledge"
COLLECTION_NAME = "tripsathi"
VECTOR_DIM = 1024
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100


# ── Embedding providers ──────────────────────────────────────────────────────

def _embed_voyage(texts: list[str]) -> list[list[float]]:
    import voyageai
    voyage = voyageai.Client(api_key=os.environ["VOYAGE_API_KEY"])
    BATCH, RPM_SLEEP = 25, 21
    print(f"  Voyage voyage-3.5-lite (free tier: ~{len(texts) // BATCH * RPM_SLEEP}s — add payment method to unlock 2000 RPM)")
    vectors = []
    for i in range(0, len(texts), BATCH):
        batch = texts[i:i + BATCH]
        result = voyage.embed(batch, model="voyage-3.5-lite", input_type="document")
        vectors.extend(result.embeddings)
        done = min(i + BATCH, len(texts))
        print(f"    {done}/{len(texts)} embedded")
        if done < len(texts):
            time.sleep(RPM_SLEEP)
    return vectors


def _embed_cohere(texts: list[str]) -> list[list[float]]:
    import cohere
    co = cohere.Client(api_key=os.environ["COHERE_API_KEY"])
    BATCH = 96  # Cohere max batch size
    print(f"  Cohere embed-english-v3.0 (fallback, {len(texts)} chunks)")
    vectors = []
    for i in range(0, len(texts), BATCH):
        batch = texts[i:i + BATCH]
        result = co.embed(texts=batch, model="embed-english-v3.0", input_type="search_document")
        vectors.extend(result.embeddings)
        done = min(i + BATCH, len(texts))
        print(f"    {done}/{len(texts)} embedded")
    return vectors


def _pick_embed_fn(force_provider: str | None):
    """Return (embed_fn, provider_name). Auto-selects Voyage if key present, else Cohere."""
    if force_provider == "cohere":
        if not os.getenv("COHERE_API_KEY"):
            print("COHERE_API_KEY not set."); sys.exit(1)
        return _embed_cohere, "cohere"
    if force_provider == "voyage" or os.getenv("VOYAGE_API_KEY"):
        return _embed_voyage, "voyage"
    if os.getenv("COHERE_API_KEY"):
        print("VOYAGE_API_KEY not set — falling back to Cohere.")
        return _embed_cohere, "cohere"
    print("Neither VOYAGE_API_KEY nor COHERE_API_KEY is set."); sys.exit(1)


# ── Chunking ─────────────────────────────────────────────────────────────────

def _chunk_text(text: str) -> list[str]:
    chunks, start = [], 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        if end < len(text):
            nl = text.rfind("\n", start, end)
            if nl > start + CHUNK_SIZE // 2:
                end = nl + 1
        chunks.append(text[start:end].strip())
        next_start = end - CHUNK_OVERLAP
        if next_start <= start:
            next_start = end
        start = next_start
    return [c for c in chunks if len(c) > 50]


# ── Main ─────────────────────────────────────────────────────────────────────

def rebuild(destination: str | None = None, force_provider: str | None = None):
    embed_fn, provider = _pick_embed_fn(force_provider)
    qdrant = QdrantClient(url=os.environ["QDRANT_URL"], api_key=os.environ["QDRANT_API_KEY"])

    if destination:
        md_files = [KNOWLEDGE_DIR / f"{destination}.md"]
        md_files = [f for f in md_files if f.exists()]
        if not md_files:
            print(f"No .md file found for '{destination}'."); sys.exit(1)
        print(f"Deleting existing vectors for destination='{destination}'...")
        qdrant.delete(
            collection_name=COLLECTION_NAME,
            points_selector=qmodels.Filter(must=[
                qmodels.FieldCondition(key="destination", match=qmodels.MatchValue(value=destination.lower()))
            ]),
        )
    else:
        try:
            qdrant.delete_collection(COLLECTION_NAME)
            print(f"Deleted existing '{COLLECTION_NAME}' collection.")
        except Exception:
            pass
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=qmodels.VectorParams(size=VECTOR_DIM, distance=qmodels.Distance.COSINE),
        )
        print(f"Created '{COLLECTION_NAME}' collection (dim={VECTOR_DIM}, cosine).")
        md_files = sorted(KNOWLEDGE_DIR.glob("*.md"))

    all_chunks: list[dict] = []
    for md_file in md_files:
        dest = md_file.stem.lower()
        chunks = _chunk_text(md_file.read_text(encoding="utf-8"))
        for i, chunk in enumerate(chunks):
            all_chunks.append({
                "id": hashlib.md5(f"{dest}_{i}_{chunk[:50]}".encode()).hexdigest(),
                "text": chunk, "destination": dest,
                "source_file": md_file.name, "chunk_index": i,
            })
        print(f"  {dest}: {len(chunks)} chunks")

    if not all_chunks:
        print("No chunks to index."); return

    print(f"\nEmbedding {len(all_chunks)} chunks via {provider}...")
    vectors = embed_fn([c["text"] for c in all_chunks])

    points = [
        qmodels.PointStruct(
            id=int(hashlib.md5(c["id"].encode()).hexdigest()[:15], 16),
            vector=v,
            payload={"text": c["text"], "destination": c["destination"],
                     "source_file": c["source_file"], "chunk_index": c["chunk_index"],
                     "embed_provider": provider},
        )
        for c, v in zip(all_chunks, vectors)
    ]

    for i in range(0, len(points), 100):
        qdrant.upsert(collection_name=COLLECTION_NAME, points=points[i:i + 100])

    print(f"\nDone. {len(points)} vectors in Qdrant '{COLLECTION_NAME}' (provider: {provider}).")
    print(f"Collection total: {qdrant.count(COLLECTION_NAME).count} vectors.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", help="Re-index one destination (e.g. manali)")
    parser.add_argument("--provider", choices=["voyage", "cohere"], help="Force a specific provider")
    args = parser.parse_args()
    rebuild(destination=args.destination, force_provider=args.provider)
