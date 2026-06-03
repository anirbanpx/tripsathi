"""One-shot indexer: embeds all rag/knowledge/*.md with Voyage and upserts into Qdrant Cloud.
Uses voyageai + qdrant-client directly — no LlamaIndex dependency, runs on Python 3.14+.
Run manually when adding new destination .md files.

Usage:
  python reindex.py                         # full rebuild (wipes + re-indexes all 18 destinations)
  python reindex.py --destination manali    # re-index a single destination only
"""
import argparse
import hashlib
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

import voyageai
from qdrant_client import QdrantClient, models as qmodels

KNOWLEDGE_DIR = Path(__file__).parent / "rag" / "knowledge"
COLLECTION_NAME = "tripsathi"
EMBED_MODEL = "voyage-3.5-lite"
VECTOR_DIM = 1024  # voyage-3.5-lite output dimension
CHUNK_SIZE = 800   # characters per chunk (overlapping splits for longer .md files)
CHUNK_OVERLAP = 100


def _chunk_text(text: str) -> list[str]:
    """Split text into overlapping character-window chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        # try to break at newline
        if end < len(text):
            nl = text.rfind("\n", start, end)
            if nl > start + CHUNK_SIZE // 2:
                end = nl + 1
        chunks.append(text[start:end].strip())
        next_start = end - CHUNK_OVERLAP
        if next_start <= start:
            next_start = end  # short chunk — no overlap, just advance
        start = next_start
    return [c for c in chunks if len(c) > 50]  # drop tiny trailing fragments


def rebuild(destination: str | None = None):
    voyage = voyageai.Client(api_key=os.environ["VOYAGE_API_KEY"])
    qdrant = QdrantClient(
        url=os.environ["QDRANT_URL"],
        api_key=os.environ["QDRANT_API_KEY"],
    )

    if destination:
        md_files = [KNOWLEDGE_DIR / f"{destination}.md"]
        md_files = [f for f in md_files if f.exists()]
        if not md_files:
            print(f"No .md file found for destination '{destination}'.")
            sys.exit(1)
        # Delete existing points for this destination
        print(f"Deleting existing vectors for destination='{destination}'...")
        qdrant.delete(
            collection_name=COLLECTION_NAME,
            points_selector=qmodels.Filter(
                must=[qmodels.FieldCondition(
                    key="destination",
                    match=qmodels.MatchValue(value=destination.lower()),
                )]
            ),
        )
    else:
        # Full rebuild: recreate collection
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

    # Build chunks
    all_chunks: list[dict] = []
    for md_file in md_files:
        dest = md_file.stem.lower()
        text = md_file.read_text(encoding="utf-8")
        chunks = _chunk_text(text)
        for i, chunk in enumerate(chunks):
            chunk_id = hashlib.md5(f"{dest}_{i}_{chunk[:50]}".encode()).hexdigest()
            all_chunks.append({
                "id": chunk_id,
                "text": chunk,
                "destination": dest,
                "source_file": md_file.name,
                "chunk_index": i,
            })
        print(f"  {dest}: {len(chunks)} chunks")

    if not all_chunks:
        print("No chunks to index.")
        return

    # Embed in batches — free tier: 3 RPM / 10K TPM (add payment method to unlock standard limits)
    # Batch of 25 chunks × ~200 tokens ≈ 5K tokens/req, well under 10K TPM ceiling.
    # 21s sleep between requests keeps us safely under 3 RPM.
    import time
    BATCH = 25
    RPM_SLEEP = 21  # seconds between requests
    texts = [c["text"] for c in all_chunks]
    print(f"\nEmbedding {len(texts)} chunks with {EMBED_MODEL} (free tier: slow, ~{len(texts)//BATCH * RPM_SLEEP}s)...")
    print("Tip: add a payment method at dashboard.voyageai.com to unlock 2000 RPM (still free up to 200M tokens).")
    vectors = []
    for i in range(0, len(texts), BATCH):
        batch = texts[i:i + BATCH]
        result = voyage.embed(batch, model=EMBED_MODEL, input_type="document")
        vectors.extend(result.embeddings)
        done = min(i + BATCH, len(texts))
        print(f"  {done}/{len(texts)} embedded")
        if done < len(texts):
            time.sleep(RPM_SLEEP)

    # Upsert to Qdrant
    points = [
        qmodels.PointStruct(
            id=int(hashlib.md5(c["id"].encode()).hexdigest()[:15], 16),
            vector=v,
            payload={
                "text": c["text"],
                "destination": c["destination"],
                "source_file": c["source_file"],
                "chunk_index": c["chunk_index"],
            },
        )
        for c, v in zip(all_chunks, vectors)
    ]

    UPSERT_BATCH = 100
    for i in range(0, len(points), UPSERT_BATCH):
        qdrant.upsert(collection_name=COLLECTION_NAME, points=points[i:i + UPSERT_BATCH])

    print(f"\nDone. {len(points)} vectors upserted into Qdrant '{COLLECTION_NAME}'.")
    count = qdrant.count(COLLECTION_NAME).count
    print(f"Collection now has {count} vectors total.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", help="Re-index one destination slug (e.g. manali)")
    args = parser.parse_args()
    rebuild(destination=args.destination)
